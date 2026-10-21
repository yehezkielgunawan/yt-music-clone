import { describe, expect, it } from 'vitest'
import {
  parsePlaylist,
  parseRevision,
  tracksFromText,
} from '../../src/library/validation'

const entry = {
  id: crypto.randomUUID(),
  videoId: 'jfKfPfyJRdk',
  label: '  Morning  ',
}

describe('playlist validation', () => {
  it('preserves and normalizes optional music metadata while accepting older entries', () => {
    const entries = parsePlaylist({
      name: 'Rotation',
      entries: [
        entry,
        {
          ...entry,
          id: crypto.randomUUID(),
          title: ' Song ',
          author: ' Artist ',
          album: ' Album ',
        },
      ],
    }).entries
    expect(entries[0]).toEqual({ ...entry, label: 'Morning' })
    expect(entries[1]).toMatchObject({
      title: 'Song',
      author: 'Artist',
      album: 'Album',
    })
    expect(
      parsePlaylist({ name: 'Rotation', entries: [{ ...entry, album: ' ' }] })
        .entries[0].album,
    ).toBeNull()
  })
  it.each(['title', 'author', 'album'] as const)(
    'rejects invalid %s metadata',
    (field) => {
      for (const value of [42, {}, 'x'.repeat(201)]) {
        expect(() =>
          parsePlaylist({
            name: 'Rotation',
            entries: [{ ...entry, [field]: value }],
          }),
        ).toThrow()
      }
    },
  )
  it('normalizes labels and preserves duplicate videos with distinct identities', () => {
    const value = parsePlaylist({
      name: '  Rotation  ',
      entries: [entry, { ...entry, id: crypto.randomUUID(), label: ' ' }],
    })
    expect(value.name).toBe('Rotation')
    expect(value.entries.map((track) => track.label)).toEqual(['Morning', null])
  })
  it('allows empty playlists', () => {
    expect(parsePlaylist({ name: 'New', entries: [] }).entries).toEqual([])
  })
  it.each([
    { name: ' ', entries: [] },
    { name: 'a'.repeat(101), entries: [] },
    { name: 'New', entries: [{ ...entry, label: 'a'.repeat(201) }] },
    { name: 'New', entries: [entry, entry] },
    { name: 'New', entries: [{ ...entry, videoId: 'invalid' }] },
    {
      name: 'New',
      entries: Array.from({ length: 51 }, () => ({
        ...entry,
        id: crypto.randomUUID(),
      })),
    },
    null,
  ])('rejects invalid data: %j', (value) =>
    expect(() => parsePlaylist(value)).toThrow(),
  )
  it('accepts YouTube Music track links and discards sharing/playlist parameters', () => {
    const tracks = tracksFromText(
      'https://music.youtube.com/watch?v=jfKfPfyJRdk&list=PLabc&si=shared\nhttps://youtu.be/jfKfPfyJRdk?si=shared',
    )
    expect(tracks.map((track) => track.videoId)).toEqual([
      'jfKfPfyJRdk',
      'jfKfPfyJRdk',
    ])
    expect(tracks[0].id).not.toBe(tracks[1].id)
  })
  it('reports the invalid line for playlist-only URLs', () => {
    expect(() =>
      tracksFromText(
        'jfKfPfyJRdk\nhttps://music.youtube.com/playlist?list=PLabc',
      ),
    ).toThrow(/Line 2:.*individual track/i)
  })
  it.each([0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid revisions: %j',
    (revision) => {
      expect(() => parseRevision(revision)).toThrow()
    },
  )
})
