import { describe, expect, it } from 'vitest'
import {
  loadQueue,
  saveQueue,
  queueLabel,
  QUEUE_KEY,
  LEGACY_QUEUE_KEY,
} from '../../src/player/queue-storage'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('labeled queue storage', () => {
  it('reads legacy queues and preserves labels and duplicate entry identities on reload', () => {
    const store = storage()
    store.setItem(LEGACY_QUEUE_KEY, 'jfKfPfyJRdk\njfKfPfyJRdk')
    const entries = loadQueue(store)
    entries[1].label = 'Second occurrence'
    saveQueue(store, entries)
    expect(loadQueue(store)).toEqual(entries)
    expect(store.getItem(LEGACY_QUEUE_KEY)).not.toBeNull()
    expect(store.getItem(QUEUE_KEY)).not.toBeNull()
  })
  it('falls back to legacy data when structured storage is corrupt', () => {
    const store = storage()
    store.setItem(QUEUE_KEY, '{broken')
    store.setItem(LEGACY_QUEUE_KEY, 'jfKfPfyJRdk')
    expect(loadQueue(store).map((entry) => entry.videoId)).toEqual([
      'jfKfPfyJRdk',
    ])
  })
  it('uses sample tracks when storage is blocked', () => {
    expect(
      loadQueue({
        getItem() {
          throw new Error('blocked')
        },
      }),
    ).toHaveLength(3)
  })
  it('does not mislabel duplicate videos when shuffled identity is ambiguous', () => {
    const entries = loadQueue({ getItem: () => 'jfKfPfyJRdk\njfKfPfyJRdk' })
    entries[0].label = 'First'
    entries[1].label = 'Second'
    expect(queueLabel(entries, ['jfKfPfyJRdk', 'jfKfPfyJRdk'], 1, false)).toBe(
      'Second',
    )
    expect(
      queueLabel(entries, ['jfKfPfyJRdk', 'jfKfPfyJRdk'], 1, true),
    ).toBeNull()
  })
})
