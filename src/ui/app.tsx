/// <reference lib="dom" />
/** @jsxImportSource hono/jsx/dom */
import { useEffect, useRef, useState } from 'hono/jsx'
import type { PlaybackController } from '../player/youtube-player'
import { DEFAULT_QUEUE } from '../player/queue'
import { Icon } from './icon'
import { Library } from './library'
import { Transport } from './transport'
import { useLibrary } from '../library/use-library'
import type { PlaylistEntry } from '../library/types'
import { tracksFromText } from '../library/validation'
import { TrackMetadata } from '../library/track-metadata'
import {
  loadQueue,
  saveQueue as persistQueue,
  queueEntry,
} from '../player/queue-storage'

const CHECKS = [
  'Playback continues in another app',
  'Playback continues with the screen locked',
  'Three tracks advance while locked (20+ min)',
  'The current track is correct when I return',
  'Lock-screen / headphone controls work',
  'No platform ads observed with Brave Shields',
]
const inputValue = (event: Event) => {
  const target = event.currentTarget
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
    ? target.value
    : ''
}

function initialQueue(): PlaylistEntry[] {
  try {
    return loadQueue(localStorage)
  } catch {
    /* Storage may be blocked or an older saved queue may be invalid. */
  }
  return tracksFromText(DEFAULT_QUEUE.join('\n'))
}

export function App({
  controller,
  connectPlayer,
}: {
  controller: PlaybackController
  connectPlayer: () => Promise<void>
}) {
  const [snapshot, setSnapshot] = useState(controller.snapshot())
  const [queue, setQueue] = useState(initialQueue)
  const [tab, setTab] = useState<'queue' | 'library' | 'test' | 'log'>('queue')
  const [metadata] = useState(() => new TrackMetadata())
  const [metadataVersion, setMetadataVersion] = useState(0)
  const library = useLibrary(tab === 'library', (entries) =>
    metadata.enrich(entries),
  )
  const [activeEntries, setActiveEntries] = useState<PlaylistEntry[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [queueNotice, setQueueNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [notes, setNotes] = useState('')
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false))
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null)
  const [installHint, setInstallHint] = useState('')
  const [logTick, setLogTick] = useState(0)
  const [videoExpanded, setVideoExpanded] = useState(false)
  const editField = useRef<HTMLTextAreaElement | null>(null)
  const order =
    snapshot.started && snapshot.order.length
      ? snapshot.order
      : queue.map((entry) => entry.videoId)
  const playingEntry = queueEntry(
    activeEntries,
    snapshot.order,
    snapshot.index,
    snapshot.shuffle,
  )
  const playingDetails = metadata.details(
    playingEntry ?? {
      id: '',
      videoId: snapshot.videoId,
      label: null,
    },
  )

  useEffect(
    () =>
      metadata.subscribe(() => setMetadataVersion((version) => version + 1)),
    [metadata],
  )
  useEffect(() => {
    if (online)
      void metadata.load([
        ...queue,
        ...activeEntries,
        ...(library.draft?.entries ?? []),
      ])
  }, [metadata, queue, activeEntries, library.draft?.entries, online])
  useEffect(() => {
    try {
      persistQueue(localStorage, metadata.enrich(queue))
    } catch {
      // Lookup results remain visible when browser storage is unavailable.
    }
  }, [metadata, metadataVersion, queue])

  function changeTab(next: typeof tab) {
    if (next === tab) return
    if (tab === 'library') {
      if (!library.canLeave()) return
      library.discard()
    }
    setTab(next)
  }

  function replaceQueue(entries: PlaylistEntry[]) {
    const next = entries.map((entry) => ({ ...entry }))
    setQueue(next)
    setError('')
    try {
      persistQueue(localStorage, metadata.enrich(next))
    } catch {
      setError(
        'Queue updated for this session. Browser storage is unavailable, so it will not survive a reload.',
      )
    }
  }

  useEffect(() => controller.subscribe(setSnapshot), [controller])
  useEffect(() => {
    document
      .getElementById('video-panel')
      ?.classList.toggle('is-compact', !videoExpanded)
  }, [videoExpanded])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    const install = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPrompt)
    }
    const installed = () => {
      setInstallPrompt(null)
      setInstallHint('Installed. Open Yehezgun-music from your home screen.')
      controller.diagnostics.record('app-installed')
    }
    const checklistLink = document.getElementById('open-checklist')
    const openChecklist = (event: Event) => {
      event.preventDefault()
      changeTab('test')
      document
        .querySelector('.room-toolbar')
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('beforeinstallprompt', install)
    window.addEventListener('appinstalled', installed)
    checklistLink?.addEventListener('click', openChecklist)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('beforeinstallprompt', install)
      window.removeEventListener('appinstalled', installed)
      checklistLink?.removeEventListener('click', openChecklist)
    }
  }, [controller, tab, library.dirty, library.busy])
  useEffect(() => {
    if (editing) editField.current?.focus()
  }, [editing])

  async function start(index = 0) {
    setError('')
    setQueueNotice('')
    if (!snapshot.ready) {
      setBusy(true)
      try {
        await connectPlayer()
      } catch {
        /* Controller provides the actionable message. */
      } finally {
        setBusy(false)
      }
      return
    }
    try {
      setActiveEntries(metadata.enrich(queue))
      controller.start(
        queue.map((entry) => entry.videoId),
        index,
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to start.')
    }
  }

  function saveQueue() {
    try {
      const entries = tracksFromText(draft)
      // Preserve labels for unchanged occurrences when editing the plain-link queue.
      const available = [...queue]
      for (const entry of entries) {
        const index = available.findIndex(
          (existing) => existing.videoId === entry.videoId,
        )
        if (index >= 0) Object.assign(entry, available.splice(index, 1)[0])
      }
      setEditing(false)
      setError('')
      replaceQueue(entries)
      controller.diagnostics.record('queue-edited', { count: entries.length })
      // Editing never interrupts the currently playing queue. An explicit restart applies it.
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Check your video URLs.',
      )
    }
  }

  function exportReport() {
    controller.diagnostics.record('report-exported')
    const report = {
      ...controller.diagnostics.report({
        browser: navigator.userAgent,
        mode: matchMedia('(display-mode: standalone)').matches
          ? 'standalone'
          : 'browser',
        online: navigator.onLine,
        secureContext: window.isSecureContext,
        notes: notes.slice(0, 2000),
      }),
      checks: CHECKS.map((label, index) => ({
        label,
        observed: checks[index],
      })),
      queue,
      playback: controller.snapshot(),
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `yehezgun-music-playback-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  async function install() {
    if (!installPrompt) {
      setInstallHint(
        'In Brave, open ⋮ and choose “Add to Home screen” or “Install app”. Use the deployed HTTPS address.',
      )
      return
    }
    try {
      await installPrompt.prompt()
      await installPrompt.userChoice
      setInstallPrompt(null)
    } catch {
      setInstallHint('Open Brave’s ⋮ menu and choose “Add to Home screen”.')
    }
  }

  return (
    <>
      <div class="room-toolbar">
        <div class="room-tabs" role="tablist" aria-label="Listening room views">
          <button
            id="tab-queue"
            role="tab"
            aria-selected={tab === 'queue' ? 'true' : 'false'}
            aria-controls="room-panel"
            onClick={() => changeTab('queue')}
          >
            Your queue <span>{order.length}</span>
          </button>
          <button
            id="tab-library"
            role="tab"
            aria-selected={tab === 'library' ? 'true' : 'false'}
            aria-controls="room-panel"
            onClick={() => changeTab('library')}
          >
            Library
          </button>
          <button
            id="tab-test"
            role="tab"
            aria-selected={tab === 'test' ? 'true' : 'false'}
            aria-controls="room-panel"
            onClick={() => changeTab('test')}
          >
            Phone test
          </button>
          <button
            id="tab-log"
            role="tab"
            aria-selected={tab === 'log' ? 'true' : 'false'}
            aria-controls="room-panel"
            onClick={() => {
              changeTab('log')
              setLogTick(logTick + 1)
            }}
          >
            Session log
          </button>
        </div>
      </div>
      {!online && (
        <p class="notice warning" role="status">
          You’re offline. Your saved queue is here, but YouTube playback needs a
          connection.
        </p>
      )}
      {error && (
        <p class="notice warning" role="alert">
          {error}
        </p>
      )}
      {queueNotice && (
        <p class="notice" role="status">
          {queueNotice}
        </p>
      )}
      <section id="room-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'library' && (
          <Library
            library={library}
            online={online}
            queue={metadata.enrich(queue)}
            metadata={metadata}
            loadQueue={(entries) => {
              replaceQueue(entries)
              setEditing(false)
              // Remain in the library so loading never discards an unsaved draft.
              setQueueNotice(
                'Saved playlist loaded into your pending queue. Open Your queue and tap Start listening or Restart queue when ready.',
              )
            }}
          />
        )}
        {tab === 'queue' && (
          <>
            <div class="queue-header">
              <div>
                <p class="eyebrow">A FEW TRACKS TO GET YOU STARTED</p>
                <h2>
                  The first rotation<span>.</span>
                </h2>
                <p class="muted">
                  {queue.length} tracks · Pending queue stays on this device
                </p>
              </div>
              <button
                class="icon-button edit-queue"
                aria-label="Edit test queue"
                onClick={() => {
                  setDraft(queue.map((entry) => entry.videoId).join('\n'))
                  setEditing(!editing)
                  setError('')
                }}
              >
                <Icon name={editing ? 'close' : 'plus'} />
              </button>
            </div>
            {editing && (
              <form
                class="queue-editor"
                onSubmit={(event) => {
                  event.preventDefault()
                  saveQueue()
                }}
              >
                <label for="queue-input">Make it your own</label>
                <p>
                  Paste one YouTube video link or ID per line. Up to 50 tracks.
                </p>
                <textarea
                  ref={editField}
                  id="queue-input"
                  rows={5}
                  value={draft}
                  onInput={(event) => setDraft(inputValue(event))}
                  spellcheck={false}
                  maxlength={12000}
                />
                <div class="editor-actions">
                  <button
                    type="button"
                    class="subtle-button"
                    onClick={() => setDraft(DEFAULT_QUEUE.join('\n'))}
                  >
                    Use sample tracks
                  </button>
                  <button type="submit" class="small-primary">
                    Save queue
                  </button>
                </div>
                {snapshot.started && (
                  <p>
                    Changes apply when you tap Restart queue. Current playback
                    keeps going.
                  </p>
                )}
              </form>
            )}
            <div class="track-list" aria-label="Playback queue">
              {order.map((id, index) => {
                const active = snapshot.started && snapshot.index === index
                const entry = queueEntry(
                  snapshot.started ? activeEntries : queue,
                  order,
                  index,
                  snapshot.started && snapshot.shuffle,
                ) ?? { id: '', videoId: id, label: null }
                const details = metadata.details(entry)
                const currentTitle =
                  entry.label || (active && snapshot.title) || details.title
                return (
                  <button
                    class={`track-row ${active ? 'is-active' : ''}`}
                    key={`${id}-${index}`}
                    disabled={busy || !online}
                    aria-label={`Play ${currentTitle}`}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => {
                      if (snapshot.started) controller.select(index)
                      else void start(index)
                    }}
                  >
                    <span class="track-index">
                      {active && snapshot.state === 1 ? (
                        <span class="equalizer" aria-label="Playing">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        String(index + 1).padStart(2, '0')
                      )}
                    </span>
                    <span
                      class={`track-art art-${index % 3}`}
                      aria-hidden="true"
                    >
                      <span class="art-orbit" />
                      <span class="art-letter">
                        {['a', 'b', 'c'][index % 3]}
                      </span>
                    </span>
                    <span class="track-text">
                      <strong>{currentTitle}</strong>
                      <small>
                        {active && snapshot.author
                          ? [snapshot.author, entry.album]
                              .filter(Boolean)
                              .join(' · ')
                          : details.subtitle}
                      </small>
                    </span>
                    <span class="track-play">
                      <Icon name="play" size={17} />
                    </span>
                  </button>
                )
              })}
            </div>
            {order.some(
              (id) =>
                metadata.details({ id: '', videoId: id, label: null })
                  .unavailable,
            ) && (
              <button
                class="btn btn-sm"
                disabled={!online}
                onClick={() => {
                  for (const id of new Set(order)) {
                    if (
                      metadata.details({ id: '', videoId: id, label: null })
                        .unavailable
                    )
                      void metadata.retry(id)
                  }
                }}
              >
                Retry track details
              </button>
            )}
            <div class="queue-actions">
              <button
                class="primary-button"
                disabled={busy || !online}
                onClick={() => void start()}
              >
                <Icon name={snapshot.ready ? 'play' : 'connection'} size={18} />
                {busy
                  ? 'Connecting…'
                  : !snapshot.ready
                    ? 'Connect player'
                    : snapshot.started
                      ? 'Restart queue'
                      : 'Start listening'}
                <Icon name="arrow" size={18} />
              </button>
              <span>
                {!snapshot.ready
                  ? 'Connect once. Then tap to play.'
                  : snapshot.started
                    ? 'Restart to apply your edited queue.'
                    : 'A tap starts your whole queue.'}
              </span>
            </div>
            <div class="queue-options">
              <button
                class="queue-option"
                aria-label="Shuffle playlist"
                aria-pressed={snapshot.shuffle ? 'true' : 'false'}
                disabled={!snapshot.started}
                onClick={() => controller.toggleShuffle()}
              >
                <Icon name="shuffle" size={15} />
                Shuffle
              </button>
              <button
                class="queue-option"
                aria-label="Repeat playlist"
                aria-pressed={snapshot.loop ? 'true' : 'false'}
                disabled={!snapshot.started}
                onClick={() => controller.toggleLoop()}
              >
                <Icon name="repeat" size={15} />
                Repeat
              </button>
            </div>
            <div class="next-up-note">
              <Icon name="list" size={17} />
              <p>
                Tracks advance inside the YouTube player. No background timer
                tricks.
              </p>
            </div>
          </>
        )}
        {tab === 'test' && (
          <div class="test-panel">
            <p class="eyebrow">REAL PHONE. REAL PLAYBACK.</p>
            <h2>
              Take it for a walk<span>.</span>
            </h2>
            <p class="muted">
              Enable Brave’s background play setting, keep Shields on, then
              start a queue. Enable Repeat to keep the sample queue running for
              20 minutes. Try a regular tab and the installed app separately.
            </p>
            <div class="test-instructions">
              <span>
                01 <strong>Press play</strong>
              </span>
              <span>
                02 <strong>Lock your phone</strong>
              </span>
              <span>
                03 <strong>Listen for 20 minutes</strong>
              </span>
            </div>
            <fieldset class="checklist">
              <legend>Mark only what you actually observe</legend>
              {CHECKS.map((label, index) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={checks[index]}
                    onChange={(event) => {
                      const updated = [...checks]
                      updated[index] =
                        event.currentTarget instanceof HTMLInputElement &&
                        event.currentTarget.checked
                      setChecks(updated)
                      controller.diagnostics.record('test-observation', {
                        check: label,
                        observed: updated[index],
                      })
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <label class="field-label" for="test-notes">
              Your setup & notes
            </label>
            <textarea
              id="test-notes"
              rows={3}
              maxlength={2000}
              value={notes}
              onInput={(event) => setNotes(inputValue(event))}
              placeholder="Phone model, Android / Brave version, Shields settings, any interruptions…"
            />
            <button class="secondary-button" onClick={exportReport}>
              <Icon name="download" size={17} />
              Export test report
            </button>
            <p class="fine-print">
              A checked box is your observation, not an automatic pass. Closing
              or force-stopping Brave can end playback.
            </p>
          </div>
        )}
        {tab === 'log' && (
          <div class="test-panel">
            <div class="section-heading">
              <p class="eyebrow">A LITTLE VISIBILITY</p>
              <button
                class="subtle-button"
                onClick={() => setLogTick(logTick + 1)}
              >
                Refresh
              </button>
            </div>
            <h2>
              Behind the music<span>.</span>
            </h2>
            <p class="muted">
              The latest 300 events from this session. Browser suspension can
              delay or omit background events. Logs stay in memory until you
              export them.
            </p>
            <div class="event-log" aria-label="Playback events">
              {controller.diagnostics
                .entries()
                .slice()
                .reverse()
                .map((event, index) => (
                  <div class="event-row" key={`${event.at}-${index}`}>
                    <time>{new Date(event.at).toLocaleTimeString()}</time>
                    <strong>{event.type}</strong>
                    <code>
                      {Object.entries(event.detail)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(' · ')}
                    </code>
                  </div>
                ))}
            </div>
            <button class="secondary-button" onClick={exportReport}>
              <Icon name="download" size={17} />
              Export session report
            </button>
          </div>
        )}
      </section>
      <div class="install-card">
        <span class="install-art" aria-hidden="true">
          ♪
        </span>
        <div>
          <strong>A home on your home screen.</strong>
          <p>
            Install Yehezgun-music for a little less browser, a little more
            music.
          </p>
        </div>
        <button class="install-button" onClick={() => void install()}>
          Install <Icon name="plus" size={16} />
        </button>
      </div>
      {installHint && (
        <p class="notice" role="status">
          {installHint}
        </p>
      )}
      <Transport
        snapshot={snapshot}
        title={
          playingEntry?.label ||
          snapshot.title ||
          (snapshot.started
            ? playingDetails.title
            : 'Something good is up next.')
        }
        author={
          snapshot.author ||
          (snapshot.started
            ? playingDetails.subtitle
            : 'Connect the player, then press play.')
        }
        busy={busy}
        online={online}
        videoExpanded={videoExpanded}
        onToggleVideo={() => setVideoExpanded(!videoExpanded)}
        onStart={() => void start()}
        onPlay={() => controller.play()}
        onPause={() => controller.pause()}
        onPrevious={() => controller.previous()}
        onNext={() => controller.next()}
        onSeek={(seconds) => controller.seek(seconds)}
        onShuffle={() => controller.toggleShuffle()}
        onRepeat={() => controller.toggleLoop()}
      />
    </>
  )
}

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
