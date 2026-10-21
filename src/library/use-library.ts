/// <reference lib="dom" />
import { useEffect, useRef, useState } from 'hono/jsx'
import { libraryClient, LibraryError } from './client'
import type {
  Playlist,
  PlaylistDraft,
  PlaylistEntry,
  PlaylistSummary,
} from './types'
import { parsePlaylist, tracksFromText } from './validation'

type Editor = PlaylistDraft & { id: string; revision: number }

export function useLibrary(
  active: boolean,
  enrich: (entries: PlaylistEntry[]) => PlaylistEntry[],
) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([])
  const [draft, setDraft] = useState<Editor | null>(null)
  const [saved, setSaved] = useState<Playlist | null>(null)
  const [links, setLinks] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorStatus, setErrorStatus] = useState(0)
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const listRequest = useRef(0)
  const createAttempt = useRef<string | null>(null)
  const dirty = Boolean(
    links.trim() ||
    (draft &&
      (saved
        ? draft.name !== saved.name ||
          JSON.stringify(draft.entries) !== JSON.stringify(saved.entries)
        : draft.name || draft.entries.length)),
  )

  function failed(error: unknown) {
    setError(
      error instanceof Error
        ? error.message
        : 'Could not complete the request. Please retry.',
    )
    setErrorStatus(error instanceof LibraryError ? error.status : 0)
  }
  function clearFeedback() {
    setError('')
    setErrorStatus(0)
    setNotice('')
  }
  async function refresh() {
    const sequence = ++listRequest.current
    setError('')
    setErrorStatus(0)
    setLoading(true)
    try {
      const { playlists } = await libraryClient.list()
      if (sequence === listRequest.current) setPlaylists(playlists)
    } catch (error) {
      if (sequence === listRequest.current) failed(error)
    } finally {
      if (sequence === listRequest.current) setLoading(false)
    }
  }
  useEffect(() => {
    if (active) {
      clearFeedback()
      void refresh()
    }
  }, [active])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(
    () => () => {
      listRequest.current++
    },
    [],
  )

  function canLeave() {
    return (
      !lock.current &&
      (!dirty || window.confirm('Discard your unsaved playlist changes?'))
    )
  }
  function discard() {
    if (lock.current) return
    setDraft(
      saved
        ? { ...saved, entries: saved.entries.map((entry) => ({ ...entry })) }
        : null,
    )
    setLinks('')
    clearFeedback()
  }
  function accept(playlist: Playlist) {
    createAttempt.current = null
    setSaved(playlist)
    setDraft({
      ...playlist,
      entries: playlist.entries.map((entry) => ({ ...entry })),
    })
    setLinks('')
  }
  async function run(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    clearFeedback()
    try {
      await action()
    } catch (error) {
      failed(error)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function create(entries: PlaylistEntry[] = []) {
    if (!canLeave()) return
    setSaved(null)
    setDraft({
      id: crypto.randomUUID(),
      revision: 0,
      name: '',
      entries: entries.map((entry) => ({ ...entry, id: crypto.randomUUID() })),
    })
    setLinks('')
    clearFeedback()
  }
  async function open(id: string) {
    if (!canLeave()) return
    await run(async () => {
      accept((await libraryClient.get(id)).playlist)
    })
  }
  function change(update: Partial<PlaylistDraft>) {
    if (!draft || lock.current) return
    setDraft({ ...draft, ...update })
    setNotice('')
  }
  function addTracks() {
    if (!draft || lock.current) return
    clearFeedback()
    try {
      const entries = [...draft.entries, ...tracksFromText(links)]
      if (entries.length > 50)
        throw new Error('Use up to 50 tracks per playlist.')
      change({ entries })
      setLinks('')
    } catch (error) {
      failed(error)
    }
  }
  async function save(asNew = false) {
    if (!draft || lock.current) return
    if (links.trim()) {
      failed(
        new Error(
          'Add the pasted track links before saving, or clear the Track links field.',
        ),
      )
      return
    }
    await run(async () => {
      // Keep an uncertain create payload stable if its response was lost, even
      // when more automatic metadata has arrived since the first attempt.
      const entries =
        !asNew && createAttempt.current === draft.id
          ? draft.entries
          : enrich(draft.entries)
      const data = parsePlaylist({ ...draft, entries })
      const editor = asNew
        ? { ...draft, ...data, id: crypto.randomUUID(), revision: 0 }
        : { ...draft, ...data }
      // Keep the same creation ID on retries, even if the first response was lost.
      if (!editor.revision) {
        setDraft(editor)
        createAttempt.current = editor.id
      }
      if (asNew) {
        setSaved(null)
      }
      const { playlist } = editor.revision
        ? await libraryClient.save(editor.id, editor.revision, data)
        : await libraryClient.create(editor.id, data)
      accept(playlist)
      setNotice('Playlist saved.')
      await refresh()
    })
  }
  async function remove() {
    if (
      !saved ||
      !canLeave() ||
      !window.confirm(
        `Delete “${saved.name}”? Current playback will keep going.`,
      )
    )
      return
    await run(async () => {
      await libraryClient.delete(saved.id, saved.revision)
      setSaved(null)
      setDraft(null)
      setLinks('')
      setNotice('Playlist deleted. Current playback is unchanged.')
      await refresh()
    })
  }
  async function reload() {
    if (!draft || !canLeave()) return
    await run(async () => {
      accept((await libraryClient.get(draft.id)).playlist)
    })
  }
  function move(index: number, direction: -1 | 1) {
    if (!draft) return
    const target = index + direction
    if (target < 0 || target >= draft.entries.length) return
    const entries = [...draft.entries]
    ;[entries[index], entries[target]] = [entries[target], entries[index]]
    change({ entries })
  }

  return {
    playlists,
    draft,
    saved,
    links,
    setLinks,
    busy,
    loading,
    error,
    errorStatus,
    notice,
    dirty,
    canLeave,
    discard,
    create,
    open,
    change,
    addTracks,
    save,
    remove,
    reload,
    refresh,
    move,
  }
}
