/// <reference lib="dom" />
/** @jsxImportSource hono/jsx/dom */
import { render } from 'hono/jsx/dom'
import { useEffect, useState } from 'hono/jsx'
import { PlaybackController } from '../player/youtube-player'
import { createPlayerConnection } from '../player/connect-player'
import { Transport } from '../ui/transport'
import { parsePlaylist } from '../library/validation'
import { queueEntry } from '../player/queue-storage'

const root = document.getElementById('shared-app')!
const playlist = parsePlaylist(JSON.parse(root.dataset.playlist!))
const controller = new PlaybackController()
const connectPlayer = createPlayerConnection(controller)

function SharedPlayback() {
  const [snapshot, setSnapshot] = useState(controller.snapshot())
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => controller.subscribe(setSnapshot), [])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    const sync = () => {
      if (document.visibilityState === 'visible') controller.sync()
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('pageshow', sync)
    document.addEventListener('visibilitychange', sync)
    // Foreground progress only; YouTube owns automatic track advancement.
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        controller.snapshot().started
      )
        controller.sync()
    }, 1000)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('pageshow', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])
  useEffect(() => {
    document
      .getElementById('video-panel')
      ?.classList.toggle('is-compact', !expanded)
  }, [expanded])
  useEffect(() => {
    const buttons =
      document.querySelectorAll<HTMLButtonElement>('[data-track-index]')
    buttons.forEach((button) => {
      button.disabled = !snapshot.started
    })
  }, [snapshot.started])

  async function start() {
    if (!playlist.entries.length) return
    if (!snapshot.ready) {
      setBusy(true)
      try {
        await connectPlayer()
      } catch {
        /* Controller supplies connection feedback. */
      } finally {
        setBusy(false)
      }
      return
    }
    controller.start(playlist.entries.map((entry) => entry.videoId))
  }

  // Do not assign occurrence-specific labels to ambiguous shuffled duplicates.
  const entry = queueEntry(
    playlist.entries,
    snapshot.order,
    snapshot.index,
    snapshot.shuffle,
  )
  return (
    <>
      {!playlist.entries.length ? (
        <p class="muted">There are no tracks to play.</p>
      ) : (
        <Transport
          snapshot={snapshot}
          title={
            entry?.label || entry?.title || snapshot.title || playlist.name
          }
          author={entry?.author || snapshot.author || 'Shared playlist'}
          busy={busy}
          online={online}
          videoExpanded={expanded}
          onToggleVideo={() => setExpanded(!expanded)}
          onStart={() => void start()}
          onPlay={() => controller.play()}
          onPause={() => controller.pause()}
          onPrevious={() => controller.previous()}
          onNext={() => controller.next()}
          onSeek={(seconds) => controller.seek(seconds)}
          onShuffle={() => controller.toggleShuffle()}
          onRepeat={() => controller.toggleLoop()}
        />
      )}
    </>
  )
}

document.getElementById('shared-tracks')?.addEventListener('click', (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-track-index]')
      : null
  if (!button || button.disabled || !controller.snapshot().started) return
  const original = Number(button.dataset.trackIndex)
  const state = controller.snapshot()
  // Resolve the selected original occurrence against YouTube's shuffled order.
  const id = playlist.entries[original]?.videoId
  if (!id) return
  const occurrence = playlist.entries
    .slice(0, original)
    .filter((entry) => entry.videoId === id).length
  const indices = state.order.flatMap((video, index) =>
    video === id ? [index] : [],
  )
  if (indices[occurrence] !== undefined) controller.select(indices[occurrence])
})
render(<SharedPlayback />, root)
