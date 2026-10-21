/// <reference lib="dom" />
import type { PlaylistEntry } from './types'

interface MusicDetails {
  title: string
  author: string
}
type Lookup = (videoId: string) => Promise<MusicDetails>
type Result =
  { status: 'loading' | 'unavailable' } | ({ status: 'ready' } & MusicDetails)

async function lookupMetadata(videoId: string): Promise<MusicDetails> {
  const response = await fetch(`/api/tracks/${videoId}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Unavailable')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object') throw new Error('Invalid metadata')
  const { title, author } = data as Record<string, unknown>
  if (
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > 200 ||
    typeof author !== 'string' ||
    !author.trim() ||
    author.length > 200
  )
    throw new Error('Invalid metadata')
  return { title: title.trim(), author: author.trim() }
}

// Browser-session cache only: no draft references or server request state are retained.
export class TrackMetadata {
  private results = new Map<string, Result>()
  private pending = new Map<string, Promise<void>>()
  private jobs: (() => Promise<void>)[] = []
  private running = 0
  private listeners = new Set<() => void>()

  constructor(private lookup: Lookup = lookupMetadata) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    this.listeners.forEach((listener) => listener())
  }

  private pump() {
    while (this.running < 3 && this.jobs.length) {
      this.running++
      void this.jobs.shift()!()
    }
  }

  private request(videoId: string): Promise<void> {
    const pending = this.pending.get(videoId)
    if (pending) return pending
    if (this.results.has(videoId)) return Promise.resolve()
    this.results.set(videoId, { status: 'loading' })
    const promise = new Promise<void>((resolve) => {
      this.jobs.push(async () => {
        try {
          const details = await this.lookup(videoId)
          this.results.set(videoId, { status: 'ready', ...details })
        } catch {
          this.results.set(videoId, { status: 'unavailable' })
        } finally {
          this.pending.delete(videoId)
          this.running--
          resolve()
          this.emit()
          this.pump()
        }
      })
    })
    this.pending.set(videoId, promise)
    this.emit()
    this.pump()
    return promise
  }

  async load(entries: PlaylistEntry[]) {
    let seeded = false
    for (const entry of entries) {
      if (
        entry.title &&
        entry.author &&
        this.results.get(entry.videoId)?.status !== 'ready'
      ) {
        this.results.set(entry.videoId, {
          status: 'ready',
          title: entry.title,
          author: entry.author,
        })
        seeded = true
      }
    }
    if (seeded) this.emit()
    const missing = entries.filter((entry) => !entry.title || !entry.author)
    await Promise.all(missing.map((entry) => this.request(entry.videoId)))
  }

  retry(videoId: string) {
    if (this.results.get(videoId)?.status === 'unavailable')
      this.results.delete(videoId)
    return this.request(videoId)
  }

  enrich(entries: PlaylistEntry[]): PlaylistEntry[] {
    return entries.map((entry) => {
      const result = this.results.get(entry.videoId)
      if (result?.status !== 'ready') return { ...entry }
      return {
        ...entry,
        title: entry.title || result.title,
        author: entry.author || result.author,
      }
    })
  }

  details(entry: PlaylistEntry) {
    const result = this.results.get(entry.videoId)
    const title =
      entry.title || (result?.status === 'ready' ? result.title : '')
    const author =
      entry.author || (result?.status === 'ready' ? result.author : '')
    const unavailable = (!title || !author) && result?.status === 'unavailable'
    return {
      title:
        entry.label ||
        title ||
        (result?.status === 'loading'
          ? 'Loading track details…'
          : 'Track details unavailable'),
      subtitle: [author, entry.album].filter(Boolean).join(' · ') || 'YouTube',
      unavailable,
    }
  }
}
