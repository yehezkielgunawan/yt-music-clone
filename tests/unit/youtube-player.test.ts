import { describe, expect, it, vi } from 'vitest'
import {
  PlaybackController,
  type YouTubePlayer,
} from '../../src/player/youtube-player'

function setup() {
  const player: YouTubePlayer = {
    loadPlaylist: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    nextVideo: vi.fn(),
    previousVideo: vi.fn(),
    playVideoAt: vi.fn(),
    seekTo: vi.fn(),
    setLoop: vi.fn(),
    setShuffle: vi.fn(),
    getPlaylist: () => ['jfKfPfyJRdk', '5qap5aO4i9A', 'jfKfPfyJRdk'],
    getPlaylistIndex: () => 2,
    getPlayerState: () => 1,
    getVideoData: () => ({
      video_id: 'jfKfPfyJRdk',
      title: 'Track title',
      author: 'Artist',
    }),
    getCurrentTime: () => 42,
    getDuration: () => 180,
    destroy: vi.fn(),
  }
  const controller = new PlaybackController()
  return { player, controller }
}

describe('persistent player boundary', () => {
  it('refreshes the observed position after seeking without resuming a paused track', () => {
    const { player, controller } = setup()
    let position = 42
    player.getCurrentTime = () => position
    player.getPlayerState = () => 2
    player.seekTo = vi.fn((seconds) => {
      position = seconds
    })
    controller.attach(player)
    controller.sync()
    controller.seek(999)
    expect(player.seekTo).toHaveBeenCalledExactlyOnceWith(180, true)
    expect(controller.snapshot().currentTime).toBe(180)
    expect(controller.snapshot().state).toBe(2)
    expect(player.playVideo).not.toHaveBeenCalled()
  })

  it('does not autoplay on ready; loads the entire queue only on explicit start', () => {
    const { player, controller } = setup()
    controller.attach(player)
    expect(player.loadPlaylist).not.toHaveBeenCalled()
    expect(player.playVideo).not.toHaveBeenCalled()
    controller.start(['jfKfPfyJRdk', '5qap5aO4i9A'], 1)
    expect(player.loadPlaylist).toHaveBeenCalledExactlyOnceWith(
      ['jfKfPfyJRdk', '5qap5aO4i9A'],
      1,
      0,
    )
  })

  it('leaves normal track advancement to YouTube and reads its authoritative index', () => {
    const { player, controller } = setup()
    controller.attach(player)
    controller.stateChanged(0)
    expect(player.nextVideo).not.toHaveBeenCalled()
    controller.sync()
    expect(controller.snapshot().index).toBe(2)
    expect(controller.snapshot().title).toBe('Track title')
  })

  it('surfaces autoplay blocking and errors without automatically retrying or skipping', () => {
    const { player, controller } = setup()
    controller.attach(player)
    controller.autoplayBlocked()
    expect(controller.snapshot().message).toContain('Tap')
    controller.failed(150)
    expect(controller.snapshot().message).toContain('embedded')
    expect(player.nextVideo).not.toHaveBeenCalled()
    expect(player.playVideo).not.toHaveBeenCalled()
  })

  it('requires readiness and a valid queue before starting', () => {
    const { controller, player } = setup()
    expect(() => controller.start(['jfKfPfyJRdk'])).toThrow()
    controller.attach(player)
    expect(() => controller.start([])).toThrow()
    expect(() => controller.start(['jfKfPfyJRdk'], 3)).toThrow()
  })
})
