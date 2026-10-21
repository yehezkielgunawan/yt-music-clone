import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PlaylistRepository,
  type LibraryDatabase,
} from '../../src/library/repository'

const databases: DatabaseSync[] = []
function repository(owner = 'google:owner', shared?: LibraryDatabase) {
  const sqlite = new DatabaseSync(':memory:')
  databases.push(sqlite)
  sqlite.exec(
    readFileSync(
      new URL('../../migrations/0001_saved_playlists.sql', import.meta.url),
      'utf8',
    ),
  )
  const db: LibraryDatabase = shared ?? {
    prepare(sql) {
      return {
        bind(...values) {
          const stmt = sqlite.prepare(sql)
          return {
            async first<Row>() {
              return (stmt.get(...values) ?? null) as Row | null
            },
            async all<Row>() {
              return { results: stmt.all(...values) as Row[] }
            },
          }
        },
      }
    },
  }
  return { db, repo: new PlaylistRepository(db, owner) }
}
const draft = {
  name: 'Rotation',
  entries: [
    { id: crypto.randomUUID(), videoId: 'jfKfPfyJRdk', label: 'A track' },
  ],
}

afterEach(() => {
  databases.splice(0).forEach((db) => db.close())
})
describe('playlist SQL persistence', () => {
  it('roundtrips entries, lists summaries and scopes every operation to the owner', async () => {
    const { db, repo } = repository()
    const id = crypto.randomUUID()
    const saved = await repo.create(id, draft)
    expect(await repo.get(id)).toEqual(saved)
    expect(await repo.list()).toEqual([
      expect.objectContaining({ id, trackCount: 1 }),
    ])
    const other = new PlaylistRepository(db, 'google:other')
    expect(await other.get(id)).toBeNull()
    expect(await other.list()).toEqual([])
    expect(await other.update(id, 1, draft)).toBeNull()
    expect(await other.delete(id, 1)).toBe(false)
  })
  it('creates idempotently without overwriting an existing playlist', async () => {
    const { repo } = repository()
    const id = crypto.randomUUID()
    const first = await repo.create(id, draft)
    expect(await repo.create(id, draft)).toEqual(first)
    expect(await repo.create(id, { ...draft, name: 'Different' })).toBeNull()
  })
  it('atomically rejects stale updates and deletes', async () => {
    const { repo } = repository()
    const id = crypto.randomUUID()
    await repo.create(id, draft)
    const outcomes = await Promise.all([
      repo.update(id, 1, { ...draft, name: 'First' }),
      repo.update(id, 1, { ...draft, name: 'Second' }),
    ])
    expect(outcomes.filter(Boolean)).toHaveLength(1)
    expect((await repo.get(id))?.revision).toBe(2)
    expect(await repo.delete(id, 1)).toBe(false)
    expect(await repo.delete(id, 2)).toBe(true)
    expect(await repo.get(id)).toBeNull()
  })
})
