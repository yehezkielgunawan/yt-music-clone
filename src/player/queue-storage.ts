import { parsePlaylist, tracksFromText } from '../library/validation'
import type { PlaylistEntry } from '../library/types'
import { DEFAULT_QUEUE } from './queue'

export const QUEUE_KEY = 'side-a:queue:v2'
export const LEGACY_QUEUE_KEY = 'side-a:prototype-queue:v1'
type Reader = { getItem(key: string): string | null }
type Writer = { setItem(key: string, value: string): void }

export function loadQueue(storage: Reader): PlaylistEntry[] {
  try {
    const saved = storage.getItem(QUEUE_KEY)
    if (saved) {
      const entries = parsePlaylist({
        name: 'Queue',
        entries: JSON.parse(saved),
      }).entries
      if (entries.length) return entries
    }
  } catch {
    /* Try the original queue before falling back to samples. */
  }
  try {
    const legacy = storage.getItem(LEGACY_QUEUE_KEY)
    if (legacy) return tracksFromText(legacy)
  } catch {
    /* Storage may be blocked. */
  }
  return tracksFromText(DEFAULT_QUEUE.join('\n'))
}

export function saveQueue(storage: Writer, entries: PlaylistEntry[]) {
  storage.setItem(
    QUEUE_KEY,
    JSON.stringify(parsePlaylist({ name: 'Queue', entries }).entries),
  )
}

export function queueLabel(
  entries: PlaylistEntry[],
  order: string[],
  index: number,
  shuffled: boolean,
): string | null {
  const videoId = order[index]
  if (!shuffled && order.every((id, i) => id === entries[i]?.videoId))
    return entries[index]?.label ?? null
  const matches = entries.filter((entry) => entry.videoId === videoId)
  return matches.length === 1 ? matches[0].label : null
}
