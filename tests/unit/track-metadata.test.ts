import { describe, expect, it, vi } from 'vitest'
import { TrackMetadata } from '../../src/library/track-metadata'
import type { PlaylistEntry } from '../../src/library/types'

const track = (videoId = 't_xWqaUws6c'): PlaylistEntry => ({
  id: crypto.randomUUID(),
  videoId,
  label: null,
})

describe('track metadata client', () => {
  it('deduplicates videos and enriches only the entries passed in without replacing user edits', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({ title: 'Song', author: 'Channel' })
    const metadata = new TrackMetadata(lookup)
    const first = track()
    const duplicate = { ...track(), label: 'My title', album: 'My album' }
    await metadata.load([first, duplicate])
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(metadata.enrich([first, duplicate])).toEqual([
      { ...first, title: 'Song', author: 'Channel' },
      { ...duplicate, title: 'Song', author: 'Channel' },
    ])
    expect(first).not.toHaveProperty('title')
    expect(metadata.details(duplicate)).toMatchObject({
      title: 'My title',
      subtitle: 'Channel · My album',
    })
    expect(metadata.enrich([])).toEqual([])
  })
  it('bounds concurrency and shares in-flight requests across consumers', async () => {
    const release: (() => void)[] = []
    const lookup = vi.fn(
      () =>
        new Promise<{ title: string; author: string }>((resolve) => {
          release.push(() => resolve({ title: 'Song', author: 'Channel' }))
        }),
    )
    const metadata = new TrackMetadata(lookup)
    const tracks = [
      'aaaaaaaaaaa',
      'bbbbbbbbbbb',
      'ccccccccccc',
      'ddddddddddd',
    ].map(track)
    const loading = metadata.load(tracks)
    const same = metadata.load([tracks[0]])
    expect(lookup).toHaveBeenCalledTimes(3)
    expect(metadata.details(tracks[3]).title).toBe('Loading track details…')
    release.splice(0).forEach((resolve) => resolve())
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(4))
    release.splice(0).forEach((resolve) => resolve())
    await Promise.all([loading, same])
    expect(metadata.details(tracks[3]).title).toBe('Song')
  })
  it('does not repeatedly fetch failures and allows explicit retry', async () => {
    const lookup = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue({ title: 'Recovered', author: 'Channel' })
    const metadata = new TrackMetadata(lookup)
    const entry = track()
    await metadata.load([entry])
    expect(metadata.details(entry)).toMatchObject({
      title: 'Track details unavailable',
      unavailable: true,
    })
    await metadata.load([entry])
    expect(lookup).toHaveBeenCalledTimes(1)
    await metadata.retry(entry.videoId)
    expect(metadata.details(entry)).toMatchObject({
      title: 'Recovered',
      unavailable: false,
    })
  })
  it('uses stored metadata offline without a lookup and never invents an album', async () => {
    const lookup = vi.fn()
    const metadata = new TrackMetadata(lookup)
    const entry = { ...track(), title: 'Stored song', author: 'Stored channel' }
    await metadata.load([entry])
    expect(lookup).not.toHaveBeenCalled()
    expect(metadata.enrich([entry])[0]).not.toHaveProperty('album')
    expect(metadata.details(entry).subtitle).toBe('Stored channel')
    expect(metadata.details(track()).title).toBe('Stored song')
  })
  it('only notifies mounted subscribers when a delayed lookup completes', async () => {
    let resolve!: (value: { title: string; author: string }) => void
    const metadata = new TrackMetadata(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const listener = vi.fn()
    const unsubscribe = metadata.subscribe(listener)
    const pending = metadata.load([track()])
    unsubscribe()
    listener.mockClear()
    resolve({ title: 'Delayed', author: 'Channel' })
    await pending
    expect(listener).not.toHaveBeenCalled()
    expect(metadata.enrich([track('differentid')])[0]).not.toHaveProperty(
      'title',
    )
  })
})
