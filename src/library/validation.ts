import { parseQueue } from '../player/queue'
import type { PlaylistDraft, PlaylistEntry } from './types'

export function parseId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error('Use a valid playlist or track entry ID.')
  return value.toLowerCase()
}

export function parseRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('A valid playlist revision is required.')
  return value
}

export function parsePlaylist(value: unknown): PlaylistDraft {
  if (!value || typeof value !== 'object')
    throw new Error('Enter a playlist name and tracks.')
  const data = value as Record<string, unknown>
  if (
    typeof data.name !== 'string' ||
    !data.name.trim() ||
    data.name.trim().length > 100
  )
    throw new Error('Use a playlist name between 1 and 100 characters.')
  if (!Array.isArray(data.entries) || data.entries.length > 50)
    throw new Error('Use up to 50 tracks per playlist.')
  const ids = new Set<string>()
  const entries = data.entries.map((value: unknown): PlaylistEntry => {
    if (!value || typeof value !== 'object')
      throw new Error('Invalid track entry.')
    const entry = value as Record<string, unknown>
    const id = parseId(entry.id)
    if (ids.has(id)) throw new Error('Each track entry must have a unique ID.')
    ids.add(id)
    if (
      typeof entry.videoId !== 'string' ||
      !/^[A-Za-z0-9_-]{11}$/.test(entry.videoId)
    )
      throw new Error('Each track needs a valid YouTube video ID.')
    if (entry.label !== null && typeof entry.label !== 'string')
      throw new Error('Track labels must be text.')
    const label = typeof entry.label === 'string' ? entry.label.trim() : ''
    if (label.length > 200)
      throw new Error('Use up to 200 characters for a track label.')
    const metadata: Pick<PlaylistEntry, 'title' | 'author' | 'album'> = {}
    for (const field of ['title', 'author', 'album'] as const) {
      if (entry[field] === undefined) continue
      if (entry[field] !== null && typeof entry[field] !== 'string')
        throw new Error(`Track ${field} must be text.`)
      const text = typeof entry[field] === 'string' ? entry[field].trim() : ''
      if (text.length > 200)
        throw new Error(`Use up to 200 characters for a track ${field}.`)
      metadata[field] = text || null
    }
    return { id, videoId: entry.videoId, label: label || null, ...metadata }
  })
  return { name: data.name.trim(), entries }
}

export function tracksFromText(text: string): PlaylistEntry[] {
  return parseQueue(text).map((videoId) => ({
    id: crypto.randomUUID(),
    videoId,
    label: null,
  }))
}
