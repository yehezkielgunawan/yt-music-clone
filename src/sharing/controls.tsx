/// <reference lib="dom" />
/** @jsxImportSource hono/jsx/dom */
import { useEffect, useRef, useState } from 'hono/jsx'
import type { Playlist } from '../library/types'
import { LibraryError, playlistRequest } from '../library/client'
import type { PublishMutation, ShareMutation, ShareStatus } from './types'

interface Attempt {
  method: 'POST' | 'PUT' | 'DELETE'
  data: ShareMutation | PublishMutation
}

export function ShareControls({
  saved,
  disabled,
  dirty,
}: {
  saved: Playlist
  disabled: boolean
  dirty: boolean
}) {
  const [share, setShare] = useState<ShareStatus | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(false)
  const attempt = useRef<Attempt | null>(null)
  const lock = useRef(false)
  const linkInput = useRef<HTMLInputElement | null>(null)
  const alive = useRef(true)
  const path = `/${saved.id}/share`
  const url = share?.path ? new URL(share.path, location.origin).href : ''

  function failed(error: unknown) {
    setError(
      error instanceof Error ? error.message : 'Sharing failed. Please retry.',
    )
    setExpired(error instanceof LibraryError && error.status === 401)
  }
  async function refresh() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setExpired(false)
    setNotice('')
    try {
      const result = await playlistRequest<{ share: ShareStatus | null }>(path)
      if (!alive.current) return
      setShare(result.share)
      setLoaded(true)
      attempt.current = null
      setRetry(false)
    } catch (error) {
      if (alive.current) failed(error)
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
    }
  }, [])

  async function perform(next?: Attempt) {
    if (lock.current) return
    if (next) attempt.current = next
    const pending = attempt.current
    if (!pending) return
    lock.current = true
    setBusy(true)
    setError('')
    setExpired(false)
    setNotice('')
    try {
      const result = await playlistRequest<{ share: ShareStatus }>(
        path,
        pending.method,
        pending.data,
      )
      if (!alive.current) return
      setShare(result.share)
      attempt.current = null
      setRetry(false)
      setNotice(
        pending.method === 'DELETE'
          ? 'Sharing disabled. The old link no longer works.'
          : 'Snapshot shared. Later playlist edits will not change this link.',
      )
    } catch (error) {
      if (alive.current) {
        failed(error)
        setRetry(true)
      }
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }

  function publish() {
    const replace = Boolean(share?.path)
    if (
      replace &&
      !confirm(
        'Replace the shared snapshot with the saved playlist? The previous public link will stop working.',
      )
    )
      return
    void perform({
      method: replace ? 'PUT' : 'POST',
      data: {
        revision: saved.revision,
        version: share?.version ?? 0,
        operationId: crypto.randomUUID(),
      },
    })
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Public link copied.')
    } catch {
      linkInput.current?.focus()
      linkInput.current?.select()
      setNotice('Select and copy the public link below.')
    }
  }
  const blocked = disabled || busy
  return (
    <section
      class="space-y-3 rounded-box border border-base-300 p-4"
      aria-label="Playlist sharing"
      aria-busy={busy ? 'true' : 'false'}
    >
      <h3 class="text-lg font-bold">Share a snapshot</h3>
      <p class="muted">
        Anyone with the link can view and listen without signing in. Only the
        saved playlist is shared; later edits stay private.
      </p>
      {dirty && (
        <p class="muted">
          You have unsaved changes. Sharing uses the saved version.
        </p>
      )}
      {url && (
        <label class="block">
          Public playlist link
          <input
            ref={linkInput}
            class="input w-full mt-2"
            readOnly
            value={url}
            onFocus={() => linkInput.current?.select()}
          />
        </label>
      )}
      {share?.path && (
        <p class="text-sm text-base-content/70">
          Snapshot of saved revision {share.sourceRevision}.
        </p>
      )}
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm"
          disabled={blocked || !loaded || retry}
          onClick={publish}
        >
          {share?.path ? 'Replace shared snapshot' : 'Share saved playlist'}
        </button>
        {url && (
          <>
            <button
              type="button"
              class="btn btn-sm"
              onClick={() => void copy()}
            >
              Copy link
            </button>
            <a
              class="btn btn-sm btn-ghost"
              href={url}
              target="_blank"
              rel="noopener"
            >
              Open public playlist
            </a>
            <button
              type="button"
              class="btn btn-sm btn-ghost"
              disabled={blocked || retry}
              onClick={() => {
                if (
                  confirm('Disable sharing? The public link will stop working.')
                )
                  void perform({
                    method: 'DELETE',
                    data: {
                      version: share!.version,
                      operationId: crypto.randomUUID(),
                    },
                  })
              }}
            >
              Disable sharing
            </button>
          </>
        )}
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          disabled={blocked}
          onClick={() => void refresh()}
        >
          Refresh sharing status
        </button>
        {retry && (
          <button
            type="button"
            class="btn btn-sm"
            disabled={blocked}
            onClick={() => void perform()}
          >
            Retry sharing request
          </button>
        )}
      </div>
      {error && (
        <div class="notice warning" role="alert">
          <p>{error}</p>
          {expired && (
            <a
              class="text-link"
              href="/api/auth/signin"
              target="_blank"
              rel="noopener"
            >
              Sign in in a new tab, then retry
            </a>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}
