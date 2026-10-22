/// <reference lib="dom" />
/** @jsxImportSource hono/jsx/dom */
import type { useLibrary } from '../library/use-library'
import type { PlaylistEntry } from '../library/types'
import type { TrackMetadata } from '../library/track-metadata'
import { ShareControls } from '../sharing/controls'

type LibraryState = ReturnType<typeof useLibrary>
function inputValue(event: Event) {
  const target = event.currentTarget
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
    ? target.value
    : ''
}

export function Library({
  library,
  online,
  queue,
  loadQueue,
  metadata,
}: {
  library: LibraryState
  online: boolean
  queue: PlaylistEntry[]
  loadQueue: (entries: PlaylistEntry[]) => void
  metadata: TrackMetadata
}) {
  const { draft, saved, busy } = library
  const disabled = busy || !online
  return (
    <div class="library-panel space-y-5">
      <div class="queue-header">
        <div>
          <p class="eyebrow">KEEP YOUR EVERYDAY ROTATION</p>
          <h2>
            Your library<span>.</span>
          </h2>
          <p class="muted">Named playlists, saved across your devices.</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="btn btn-sm"
          disabled={disabled}
          onClick={() => library.create()}
        >
          New playlist
        </button>
        <button
          class="btn btn-sm"
          disabled={disabled}
          onClick={() => library.create(queue)}
        >
          Save current queue as playlist
        </button>
        <button
          class="btn btn-sm btn-ghost"
          disabled={disabled || library.loading}
          onClick={() => void library.refresh()}
        >
          Refresh library
        </button>
      </div>
      {library.loading && <p role="status">Loading library…</p>}
      {!library.loading && !library.playlists.length && (
        <p class="muted">
          No saved playlists yet. Create one or save your current queue.
        </p>
      )}
      {library.error && (
        <div class="notice warning" role="alert">
          <p>{library.error}</p>
          {library.errorStatus === 401 && (
            <a
              class="text-link"
              href="/api/auth/signin"
              target="_blank"
              rel="noopener"
            >
              Sign in in a new tab, then retry
            </a>
          )}
          {[404, 409].includes(library.errorStatus) && draft && (
            <div class="flex flex-wrap gap-2 mt-3">
              <button
                class="btn btn-sm"
                disabled={disabled}
                onClick={() => void library.reload()}
              >
                Reload latest
              </button>
              <button
                class="btn btn-sm"
                disabled={disabled}
                onClick={() => void library.save(true)}
              >
                Save as new playlist
              </button>
            </div>
          )}
          <p class="text-sm mt-2">
            Your draft stays here while this page is open. Retry Save changes or
            Refresh library when ready.
          </p>
        </div>
      )}
      {library.notice && (
        <p class="notice" role="status">
          {library.notice}
        </p>
      )}
      <ul class="space-y-2" aria-label="Saved playlists">
        {library.playlists.map((playlist) => (
          <li key={playlist.id}>
            <button
              class="btn btn-ghost w-full justify-between h-auto min-h-12 text-left whitespace-normal"
              disabled={disabled}
              aria-label={`Open ${playlist.name}`}
              onClick={() => void library.open(playlist.id)}
            >
              <span class="min-w-0 break-words">{playlist.name}</span>
              <span class="text-sm font-normal shrink-0">
                {playlist.trackCount} tracks
              </span>
            </button>
          </li>
        ))}
      </ul>
      {draft && (
        <section
          class="space-y-4 border-t border-base-300 pt-5"
          aria-label="Playlist editor"
          aria-busy={busy ? 'true' : 'false'}
        >
          <h3 class="text-lg font-bold">
            {saved ? 'Edit playlist' : 'New playlist'}
          </h3>
          <fieldset disabled={disabled} class="space-y-4 min-w-0">
            <label class="block" for="playlist-name">
              Playlist name
              <input
                class="input w-full mt-2"
                id="playlist-name"
                value={draft.name}
                maxlength={100}
                onInput={(event) => library.change({ name: inputValue(event) })}
              />
            </label>
            <label class="block" for="library-links">
              Track links
              <textarea
                class="w-full rounded-field border border-base-300 bg-base-100 p-3 mt-2"
                id="library-links"
                rows={3}
                maxlength={12000}
                value={library.links}
                onInput={(event) => library.setLinks(inputValue(event))}
                placeholder="One YouTube or YouTube Music track link per line"
              />
            </label>
            <p class="muted">
              Individual track links or video IDs. Up to 50 tracks; duplicates
              are welcome.
            </p>
            <button
              class="btn btn-sm"
              disabled={!library.links.trim()}
              onClick={() => library.addTracks()}
            >
              Add tracks
            </button>
            <ol class="space-y-4" aria-label="Playlist tracks">
              {draft.entries.map((entry, index) => {
                const details = metadata.details(entry)
                return (
                  <li
                    key={entry.id}
                    class="rounded-box border border-base-300 p-3 space-y-2"
                  >
                    <div class="min-w-0 break-words">
                      <p class="font-bold">
                        {index + 1}. {details.title}
                      </p>
                      <p class="text-sm text-base-content/70">
                        {details.subtitle}
                      </p>
                    </div>
                    {details.unavailable && (
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        onClick={() => void metadata.retry(entry.videoId)}
                      >
                        Retry track details
                      </button>
                    )}
                    <label class="block" for={`label-${entry.id}`}>
                      Track {index + 1} label
                      <input
                        class="input w-full mt-1"
                        id={`label-${entry.id}`}
                        value={entry.label ?? ''}
                        maxlength={200}
                        placeholder="Optional track name"
                        onInput={(event) => {
                          const label = inputValue(event)
                          library.change({
                            entries: draft.entries.map((track) =>
                              track.id === entry.id
                                ? { ...track, label }
                                : track,
                            ),
                          })
                        }}
                      />
                    </label>
                    <label class="block" for={`album-${entry.id}`}>
                      Track {index + 1} album
                      <input
                        class="input w-full mt-1"
                        id={`album-${entry.id}`}
                        value={entry.album ?? ''}
                        maxlength={200}
                        placeholder="Optional album name"
                        onInput={(event) => {
                          const album = inputValue(event)
                          library.change({
                            entries: draft.entries.map((track) =>
                              track.id === entry.id
                                ? { ...track, album }
                                : track,
                            ),
                          })
                        }}
                      />
                    </label>
                    <div class="flex flex-wrap gap-2">
                      <button
                        class="btn btn-sm"
                        aria-label={`Move track ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => library.move(index, -1)}
                      >
                        ↑ Up
                      </button>
                      <button
                        class="btn btn-sm"
                        aria-label={`Move track ${index + 1} down`}
                        disabled={index === draft.entries.length - 1}
                        onClick={() => library.move(index, 1)}
                      >
                        ↓ Down
                      </button>
                      <button
                        class="btn btn-sm btn-ghost"
                        aria-label={`Remove track ${index + 1}`}
                        onClick={() =>
                          library.change({
                            entries: draft.entries.filter(
                              (track) => track.id !== entry.id,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
            {!draft.entries.length && (
              <p class="muted">
                This playlist is empty. You can save it now and add tracks
                later.
              </p>
            )}
            <div class="flex flex-wrap gap-2">
              <button class="btn" onClick={() => void library.save()}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button
                class="btn btn-ghost"
                onClick={() => {
                  if (library.canLeave()) library.discard()
                }}
              >
                Discard changes
              </button>
            </div>
          </fieldset>
          <p class="muted">
            Titles and authors come from YouTube. Album names are optional. Save
            changes to keep fetched details with this playlist.
          </p>
          <p class="muted" role="status">
            {busy
              ? 'Working…'
              : library.dirty
                ? 'Unsaved changes'
                : saved
                  ? 'All changes saved'
                  : 'Name your playlist to get started.'}
          </p>
          {saved && (
            <div class="flex flex-wrap gap-2">
              <button
                class="btn"
                disabled={disabled || !saved.entries.length}
                onClick={() => {
                  loadQueue(saved.entries)
                }}
              >
                Load into queue
              </button>
              <button
                class="btn btn-ghost"
                disabled={disabled}
                onClick={() => void library.remove()}
              >
                Delete playlist
              </button>
            </div>
          )}
          {saved && (
            <p class="muted">
              Load uses the saved version. Start listening or Restart queue
              applies it to playback.
            </p>
          )}
          {saved && (
            <ShareControls
              key={saved.id}
              saved={saved}
              disabled={disabled}
              dirty={library.dirty}
            />
          )}
        </section>
      )}
    </div>
  )
}
