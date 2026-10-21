/// <reference lib="dom" />
/** @jsxImportSource hono/jsx/dom */
import { useEffect, useRef, useState } from 'hono/jsx'
import type { PlaybackSnapshot } from '../player/youtube-player'
import { Icon } from './icon'

const stateLabel = (state: number) =>
  ({
    '-1': 'Ready when you are',
    '0': 'Track ended',
    '1': 'Playing',
    '2': 'Paused',
    '3': 'Buffering',
    '5': 'Cued',
  })[String(state)] || 'Connecting'
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

interface TransportProps {
  snapshot: PlaybackSnapshot
  title: string
  author: string
  busy: boolean
  online: boolean
  videoExpanded: boolean
  onToggleVideo: () => void
  onStart: () => void
  onPlay: () => void
  onPause: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (seconds: number) => void
  onShuffle: () => void
  onRepeat: () => void
}

export function Transport({
  snapshot,
  title,
  author,
  busy,
  online,
  videoExpanded,
  onToggleVideo,
  onStart,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onSeek,
  onShuffle,
  onRepeat,
}: TransportProps) {
  const [seek, setSeek] = useState<number | null>(null)
  const root = useRef<HTMLElement | null>(null)
  const seekInput = useRef<HTMLInputElement | null>(null)
  const primaryLabel = busy
    ? 'Connecting…'
    : !snapshot.ready
      ? 'Connect player'
      : !snapshot.started
        ? 'Start listening'
        : snapshot.state === 1
          ? 'Pause'
          : 'Play'

  useEffect(() => {
    const element = root.current
    if (!element) return
    const resize = () => {
      document.documentElement.style.setProperty(
        '--transport-height',
        `${Math.ceil(element.getBoundingClientRect().height)}px`,
      )
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--transport-height')
    }
  }, [])

  // A track transition must not carry an unfinished scrub into the next track.
  useEffect(() => setSeek(null), [snapshot.videoId, snapshot.index])

  // Hono aliases JSX onChange to input. Listen to native change so dragging
  // previews the position and only releasing the scrubber commits a seek.
  useEffect(() => {
    const input = seekInput.current
    if (!input) return
    const commit = () => {
      onSeek(Number(input.value))
      setSeek(null)
    }
    input.addEventListener('change', commit)
    return () => input.removeEventListener('change', commit)
  }, [onSeek])

  return (
    <section ref={root} class="transport" aria-label="Playback controls">
      <div class="transport-inner">
        <div
          class={`mini-art art-${Math.max(snapshot.index, 0) % 3}`}
          aria-hidden="true"
        >
          ♪
        </div>
        <div class="now-playing">
          <small>
            {snapshot.started
              ? stateLabel(snapshot.state)
              : 'YOUR LISTENING ROOM'}
          </small>
          <strong>{title}</strong>
          <span>{author}</span>
        </div>
        <div class="transport-buttons">
          <button
            class="icon-button"
            aria-label="Previous track"
            disabled={!snapshot.started}
            onClick={onPrevious}
          >
            <Icon name="previous" />
          </button>
          <button
            class={`main-play ${!snapshot.started ? 'is-start' : ''}`}
            aria-label={primaryLabel}
            disabled={busy || (!online && !snapshot.started)}
            onClick={() => {
              if (!snapshot.started) onStart()
              else if (snapshot.state === 1) onPause()
              else onPlay()
            }}
          >
            <Icon
              name={
                !snapshot.ready
                  ? 'connection'
                  : snapshot.state === 1
                    ? 'pause'
                    : 'play'
              }
              size={22}
            />
            {!snapshot.started && <span>{primaryLabel}</span>}
          </button>
          <button
            class="icon-button"
            aria-label="Next track"
            disabled={!snapshot.started}
            onClick={onNext}
          >
            <Icon name="next" />
          </button>
        </div>
        <div class="transport-options">
          <button
            class="queue-option"
            aria-label="Shuffle queue"
            aria-pressed={snapshot.shuffle ? 'true' : 'false'}
            disabled={!snapshot.started}
            onClick={onShuffle}
          >
            <Icon name="shuffle" size={16} /> Shuffle
          </button>
          <button
            class="queue-option"
            aria-label="Repeat queue"
            aria-pressed={snapshot.loop ? 'true' : 'false'}
            disabled={!snapshot.started}
            onClick={onRepeat}
          >
            <Icon name="repeat" size={16} /> Repeat
          </button>
          <button
            class="queue-option video-toggle"
            aria-controls="player-stage"
            aria-expanded={videoExpanded ? 'true' : 'false'}
            onClick={onToggleVideo}
          >
            <Icon name={videoExpanded ? 'compact' : 'expand'} size={16} />
            {videoExpanded ? 'Compact video' : 'Expand video'}
          </button>
        </div>
        <div class="seek-row">
          <span>{time(seek ?? snapshot.currentTime)}</span>
          <input
            ref={seekInput}
            type="range"
            aria-label="Seek playback"
            aria-valuetext={`${time(seek ?? snapshot.currentTime)} of ${time(snapshot.duration)}`}
            min="0"
            max={Math.max(snapshot.duration, 1)}
            step="1"
            value={seek ?? snapshot.currentTime}
            disabled={!snapshot.started || !snapshot.duration}
            onInput={(event) =>
              setSeek(Number((event.currentTarget as HTMLInputElement).value))
            }
            onBlur={() => setSeek(null)}
          />
          <span>{time(snapshot.duration)}</span>
        </div>
      </div>
      {snapshot.message && (
        <p
          class={`transport-message ${snapshot.failed ? 'is-error' : ''}`}
          role={snapshot.failed ? 'alert' : 'status'}
        >
          {snapshot.message}
        </p>
      )}
    </section>
  )
}
