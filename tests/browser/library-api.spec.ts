import { expect } from '@playwright/test'
import { test } from './fixtures'
import { authTestEnv, sessionCookie } from '../fixtures/auth'

test('real D1 persists playlists and atomically rejects stale changes', async ({
  page,
  playwright,
}) => {
  const request = page.request
  const origin = authTestEnv.AUTH_URL
  const id = crypto.randomUUID()
  const data = {
    id,
    name: 'API rotation',
    entries: [
      { id: crypto.randomUUID(), videoId: 'jfKfPfyJRdk', label: 'Saved label' },
    ],
  }
  const created = await request.post('/api/playlists', {
    headers: { origin },
    data,
  })
  expect(created.status()).toBe(201)
  const saved = (await created.json()).playlist
  expect(saved.entries).toEqual(data.entries)
  expect(
    (
      await request.post('/api/playlists', { headers: { origin }, data })
    ).status(),
  ).toBe(201)
  const writes = await Promise.all(
    ['First edit', 'Second edit'].map((name) =>
      request.put(`/api/playlists/${id}`, {
        headers: { origin },
        data: { ...data, name, revision: 1 },
      }),
    ),
  )
  expect(writes.map((response) => response.status()).sort()).toEqual([200, 409])
  expect(
    (
      await request.delete(`/api/playlists/${id}`, {
        headers: { origin },
        data: { revision: 1 },
      })
    ).status(),
  ).toBe(409)
  const fetched = await request.get(`/api/playlists/${id}`)
  expect(fetched.headers()['cache-control']).toBe('private, no-store')
  expect((await fetched.json()).playlist.revision).toBe(2)
  const other = await playwright.request.newContext({ baseURL: origin })
  try {
    const cookie = await sessionCookie({ sub: 'another-google-identity' })
    expect(
      (
        await other.get(`/api/playlists/${id}`, {
          headers: { cookie: `${cookie.name}=${cookie.value}` },
        })
      ).status(),
    ).toBe(404)
    expect((await other.get('/api/playlists')).status()).toBe(401)
  } finally {
    await other.dispose()
  }
  expect(
    (
      await request.delete(`/api/playlists/${id}`, {
        headers: { origin },
        data: { revision: 2 },
      })
    ).status(),
  ).toBe(200)
  expect((await request.get(`/api/playlists/${id}`)).status()).toBe(404)
})
