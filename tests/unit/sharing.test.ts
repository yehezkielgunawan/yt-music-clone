import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import app from '../../src/index'
import {
  PlaylistRepository,
  type LibraryDatabase,
} from '../../src/library/repository'
import { ShareRepository } from '../../src/sharing/repository'
import { authTestEnv, sessionCookie } from '../fixtures/auth'

const databases: DatabaseSync[] = []
function setup() {
  const sqlite = new DatabaseSync(':memory:')
  databases.push(sqlite)
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of ['0001_saved_playlists.sql', '0002_playlist_shares.sql']) {
    sqlite.exec(
      readFileSync(
        new URL(`../../migrations/${file}`, import.meta.url),
        'utf8',
      ),
    )
  }
  const db: LibraryDatabase = {
    prepare(sql) {
      return {
        bind(...values) {
          const statement = sqlite.prepare(sql)
          return {
            async first<Row>() {
              return (statement.get(...values) ?? null) as Row | null
            },
            async all<Row>() {
              return { results: statement.all(...values) as Row[] }
            },
          }
        },
      }
    },
  }
  const owner = 'google:google-owner-id'
  return {
    db,
    playlists: new PlaylistRepository(db, owner),
    shares: new ShareRepository(db, owner),
  }
}
const draft = {
  name: 'A <shared> mix',
  entries: [
    {
      id: crypto.randomUUID(),
      videoId: 'jfKfPfyJRdk',
      label: 'First',
      title: 'Title',
      author: 'Artist',
      album: 'Album',
    },
    { id: crypto.randomUUID(), videoId: 'jfKfPfyJRdk', label: 'Second' },
  ],
}
const operation = (revision = 1, version = 0) => ({
  revision,
  version,
  operationId: crypto.randomUUID(),
})
afterEach(() => databases.splice(0).forEach((db) => db.close()))

describe('public playlist snapshots', () => {
  it('publishes saved data once, preserves duplicate order, and never follows private edits', async () => {
    const { playlists, shares } = setup()
    const id = crypto.randomUUID()
    await playlists.create(id, draft)
    const input = operation()
    const share = await shares.publish(id, input, false)
    expect(share?.path).toMatch(/^\/s\/[a-f0-9]{64}$/)
    expect(await shares.publicSnapshot(share!.path!.split('/').pop()!)).toEqual(
      draft,
    )
    await playlists.update(id, 1, {
      ...draft,
      name: 'Private edit',
      entries: [],
    })
    expect(await shares.publish(id, input, false)).toEqual(share)
    expect(await shares.publicSnapshot(share!.path!.split('/').pop()!)).toEqual(
      draft,
    )
    expect(await shares.publish(id, operation(2), false)).toBeNull()
  })

  it('checks owner and saved revision and atomically replaces links with retry protection', async () => {
    const { db, playlists, shares } = setup()
    const id = crypto.randomUUID()
    await playlists.create(id, draft)
    expect(
      await new ShareRepository(db, 'google:other').publish(
        id,
        operation(),
        false,
      ),
    ).toBeNull()
    expect(await shares.publish(id, operation(), true)).toBeNull()
    expect(await shares.publish(id, operation(2), false)).toBeNull()
    const first = (await shares.publish(id, operation(), false))!
    await playlists.update(id, 1, { ...draft, name: 'New snapshot' })
    expect(await shares.publish(id, operation(1, 1), true)).toBeNull()
    expect(
      await shares.publicSnapshot(first.path!.split('/').pop()!),
    ).not.toBeNull()
    const input = operation(2, 1)
    const second = (await shares.publish(id, input, true))!
    expect(second.version).toBe(2)
    expect(second.path).not.toBe(first.path)
    expect(await shares.publish(id, input, true)).toEqual(second)
    expect(
      await shares.publicSnapshot(first.path!.split('/').pop()!),
    ).toBeNull()
    expect(
      (await shares.publicSnapshot(second.path!.split('/').pop()!))?.name,
    ).toBe('New snapshot')
    expect(
      await shares.revoke(id, { version: 1, operationId: crypto.randomUUID() }),
    ).toBeNull()
  })

  it('revokes idempotently, prevents stale resurrection, and cascades playlist deletion', async () => {
    const { playlists, shares } = setup()
    const id = crypto.randomUUID()
    await playlists.create(id, draft)
    const create = operation()
    const first = (await shares.publish(id, create, false))!
    const revoke = { version: 1, operationId: crypto.randomUUID() }
    expect((await shares.revoke(id, revoke))?.path).toBeNull()
    expect((await shares.revoke(id, revoke))?.version).toBe(2)
    expect(
      await shares.publicSnapshot(first.path!.split('/').pop()!),
    ).toBeNull()
    expect(await shares.publish(id, create, false)).toBeNull()
    const second = (await shares.publish(id, operation(1, 2), false))!
    expect(second.version).toBe(3)
    await playlists.delete(id, 1)
    expect(
      await shares.publicSnapshot(second.path!.split('/').pop()!),
    ).toBeNull()
    expect(await shares.status(id)).toBeNull()
  })

  it('serves escaped anonymous HTML and JSON, but keeps all mutations and the library protected', async () => {
    const { db, playlists, shares } = setup()
    const id = crypto.randomUUID()
    await playlists.create(id, draft)
    const share = (await shares.publish(id, operation(), false))!
    const env = { ...authTestEnv, DB: db as D1Database }
    const html = await app.request(`${env.AUTH_URL}${share.path}`, {}, env)
    expect(html.status).toBe(200)
    expect(html.headers.get('cache-control')).toBe('private, no-store')
    expect(html.headers.get('x-robots-tag')).toContain('noindex')
    const text = await html.text()
    expect(text).toContain('A &lt;shared&gt; mix')
    expect(text).toContain('/src/sharing/client.tsx')
    expect(text).not.toContain('/src/client.tsx')
    expect(text).not.toContain('Sign out')
    const token = share.path!.split('/').pop()!
    const json = await app.request(
      `${env.AUTH_URL}/api/shares/${token}`,
      {},
      env,
    )
    expect(json.headers.get('cache-control')).toBe('private, no-store')
    expect(await json.json()).toEqual({ playlist: draft })
    for (const [path, method] of [
      ['/api/playlists', 'GET'],
      [`/api/playlists/${id}/share`, 'GET'],
      [`/api/playlists/${id}/share`, 'POST'],
      [`/api/shares/${token}`, 'DELETE'],
    ]) {
      expect(
        (await app.request(`${env.AUTH_URL}${path}`, { method }, env)).status,
      ).toBe(401)
    }
    expect(
      (await app.request(`${env.AUTH_URL}/s/invalid`, {}, env)).status,
    ).toBe(404)
    expect(
      (
        await app.request(
          `${env.AUTH_URL}/s/${'a'.repeat(64)}`,
          {},
          authTestEnv,
        )
      ).status,
    ).toBe(503)
  })

  it('validates owner requests, returns conflicts, and publishes no client-supplied content', async () => {
    const { db, playlists } = setup()
    const id = crypto.randomUUID()
    await playlists.create(id, draft)
    const env = { ...authTestEnv, DB: db as D1Database }
    const cookie = await sessionCookie()
    const request = (data: unknown, origin = env.AUTH_URL, method = 'POST') =>
      app.request(
        `${env.AUTH_URL}/api/playlists/${id}/share`,
        {
          method,
          headers: {
            cookie: `${cookie.name}=${cookie.value}`,
            origin,
            'content-type': 'application/json',
          },
          body: JSON.stringify(data),
        },
        env,
      )
    expect((await request(operation(), 'https://foreign.example')).status).toBe(
      403,
    )
    expect((await request({ ...operation(), version: -1 })).status).toBe(400)
    expect(
      (await request({ ...operation(), operationId: 'invalid' })).status,
    ).toBe(400)
    expect((await request(operation(2))).status).toBe(409)
    const response = await request({
      ...operation(),
      name: 'Injected',
      entries: [],
    })
    expect(response.status).toBe(201)
    const { share } = await response.json<{ share: { path: string } }>()
    const publicResponse = await app.request(
      `${env.AUTH_URL}/api/shares/${share.path.split('/').pop()}`,
      {},
      env,
    )
    expect(await publicResponse.json()).toEqual({ playlist: draft })
  })
})
