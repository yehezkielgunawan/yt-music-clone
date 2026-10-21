import { PlaybackDiagnostics } from './playback-diagnostics'

export interface YouTubePlayer {
  loadPlaylist(ids: string[], index: number, startSeconds: number): void
  playVideo(): void
  pauseVideo(): void
  nextVideo(): void
  previousVideo(): void
  playVideoAt(index: number): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setLoop(enabled: boolean): void
  setShuffle(enabled: boolean): void
  getPlaylist(): string[] | undefined
  getPlaylistIndex(): number
  getPlayerState(): number
  getVideoData(): { video_id?: string; title?: string; author?: string }
  getCurrentTime(): number
  getDuration(): number
  destroy(): void
}

export interface PlaybackSnapshot {
  ready: boolean
  started: boolean
  state: number
  index: number
  videoId: string
  title: string
  author: string
  currentTime: number
  duration: number
  order: string[]
  shuffle: boolean
  loop: boolean
  message: string
  failed: boolean
}

const errorMessage = (code: number) => {
  if (code === 100)
    return 'This video is unavailable or private. Choose another track.'
  if (code === 101 || code === 150)
    return 'This video cannot be played in an embedded player. Choose another track.'
  if (code === 153)
    return 'YouTube could not identify this site. Use the HTTPS app URL and allow its origin referrer.'
  if (code === 5)
    return 'YouTube could not play this video. Try another track or reopen the app.'
  return `YouTube playback error (${code}). Try a different video.`
}

export class PlaybackController {
  private player?: YouTubePlayer
  private listeners = new Set<(snapshot: PlaybackSnapshot) => void>()
  private value: PlaybackSnapshot = {
    ready: false,
    started: false,
    state: -1,
    index: -1,
    videoId: '',
    title: '',
    author: '',
    currentTime: 0,
    duration: 0,
    order: [],
    shuffle: false,
    loop: false,
    message: 'Your queue is ready. Tap Start listening to connect to YouTube.',
    failed: false,
  }

  constructor(readonly diagnostics = new PlaybackDiagnostics()) {}

  snapshot(): PlaybackSnapshot {
    return { ...this.value, order: [...this.value.order] }
  }

  subscribe(listener: (snapshot: PlaybackSnapshot) => void) {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.snapshot()))
  }

  attach(player: YouTubePlayer) {
    this.player = player
    this.value.ready = true
    this.value.failed = false
    this.value.message = 'Connected. Tap Start listening to begin.'
    this.diagnostics.record('player-ready')
    this.emit()
  }

  start(ids: string[], index = 0) {
    if (!this.player || !this.value.ready)
      throw new Error('The player is still connecting. Please try again.')
    if (
      !ids.length ||
      ids.length > 50 ||
      ids.some((id) => !/^[A-Za-z0-9_-]{11}$/.test(id)) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= ids.length
    ) {
      throw new Error('Choose a valid queue and track.')
    }
    this.value = {
      ...this.value,
      started: true,
      order: [...ids],
      index,
      failed: false,
      shuffle: false,
      title: '',
      author: '',
      videoId: ids[index],
      message: 'Loading your queue…',
    }
    this.player.setShuffle(false)
    this.player.setLoop(this.value.loop)
    this.player.loadPlaylist([...ids], index, 0)
    this.diagnostics.record('queue-start', {
      count: ids.length,
      index,
      videoId: ids[index],
    })
    this.emit()
  }

  sync() {
    if (!this.player || !this.value.ready) return
    try {
      const data = this.player.getVideoData()
      const index = this.player.getPlaylistIndex()
      const order = this.player.getPlaylist()
      const videoId = data.video_id || this.value.videoId
      if (index !== this.value.index || videoId !== this.value.videoId) {
        this.diagnostics.record('track-observed', { index, videoId })
      }
      this.value = {
        ...this.value,
        state: this.player.getPlayerState(),
        index,
        videoId,
        title: data.title || '',
        author: data.author || '',
        currentTime: this.player.getCurrentTime() || 0,
        duration: this.player.getDuration() || 0,
        order: order?.length ? [...order] : this.value.order,
      }
      this.emit()
    } catch {
      // A suspended iframe can be temporarily unavailable. Reconcile on the next foreground event.
    }
  }

  stateChanged(state: number) {
    this.value.state = state
    if (state === 1) {
      this.value.message = ''
      this.value.failed = false
    }
    this.diagnostics.record('player-state', { state })
    this.sync()
    this.emit()
    // Do not call nextVideo() on ENDED: YouTube owns normal playlist advancement.
  }

  autoplayBlocked() {
    this.value.message =
      'Playback was blocked. Tap Play here or in the YouTube player to continue.'
    this.diagnostics.record('autoplay-blocked')
    this.emit()
  }

  failed(code: number) {
    this.connectionFailed(errorMessage(code))
    this.diagnostics.record('youtube-error', { code })
  }

  connectionFailed(message: string) {
    this.value.failed = true
    this.value.message = message
    this.emit()
  }

  play() {
    this.player?.playVideo()
    this.diagnostics.record('control', { action: 'play' })
  }
  pause() {
    this.player?.pauseVideo()
    this.diagnostics.record('control', { action: 'pause' })
  }
  next() {
    this.player?.nextVideo()
    this.diagnostics.record('control', { action: 'next' })
  }
  previous() {
    this.player?.previousVideo()
    this.diagnostics.record('control', { action: 'previous' })
  }
  select(index: number) {
    this.player?.playVideoAt(index)
    this.diagnostics.record('control', { action: 'select', index })
  }
  seek(seconds: number) {
    this.player?.seekTo(
      Math.max(0, Math.min(seconds, this.value.duration)),
      true,
    )
    this.sync()
  }
  toggleShuffle() {
    this.value.shuffle = !this.value.shuffle
    this.player?.setShuffle(this.value.shuffle)
    this.diagnostics.record('shuffle', { enabled: this.value.shuffle })
    this.sync()
  }
  toggleLoop() {
    this.value.loop = !this.value.loop
    this.player?.setLoop(this.value.loop)
    this.diagnostics.record('loop', { enabled: this.value.loop })
    this.emit()
  }
}
