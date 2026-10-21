import { describe, expect, it } from 'vitest'
import app from '../../src/index'
import { authTestEnv, sessionCookie } from '../fixtures/auth'

describe('library authorization and request boundaries', () => {
  async function request(
    method = 'GET',
    options: {
      origin?: string
      claims?: Record<string, unknown>
      body?: string
      contentType?: string
    } = {},
  ) {
    const cookie = await sessionCookie(options.claims)
    return app.request(
      `${authTestEnv.AUTH_URL}/api/playlists`,
      {
        method,
        headers: {
          cookie: `${cookie.name}=${cookie.value}`,
          ...(options.origin ? { origin: options.origin } : {}),
          'content-type': options.contentType ?? 'application/json',
        },
        ...(method !== 'GET' ? { body: options.body ?? '{}' } : {}),
      },
      authTestEnv,
    )
  }
  it('returns JSON 503 when library storage is missing', async () => {
    const response = await request()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Library storage is unavailable. Try again shortly.',
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it.each([undefined, 'https://foreign.example', 'null'])(
    'rejects mutation origin %s',
    async (origin) => {
      expect((await request('POST', { origin })).status).toBe(403)
    },
  )
  it('rejects non-owner sessions', async () => {
    expect(
      (await request('GET', { claims: { email: 'other@example.com' } })).status,
    ).toBe(401)
  })
  it('rejects non-JSON and oversized requests before storage access', async () => {
    expect(
      (
        await request('POST', {
          origin: authTestEnv.AUTH_URL,
          contentType: 'text/plain',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await request('POST', {
          origin: authTestEnv.AUTH_URL,
          body: 'x'.repeat(262145),
        })
      ).status,
    ).toBe(413)
  })
  it('allows a full playlist with Unicode music details through the size boundary', async () => {
    const text = '音'.repeat(200)
    const body = JSON.stringify({
      id: crypto.randomUUID(),
      name: 'Music',
      entries: Array.from({ length: 50 }, () => ({
        id: crypto.randomUUID(),
        videoId: 't_xWqaUws6c',
        label: text,
        title: text,
        author: text,
        album: text,
      })),
    })
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(65536)
    // Missing DB is checked after body size; valid-sized metadata must reach it.
    expect(
      (await request('POST', { origin: authTestEnv.AUTH_URL, body })).status,
    ).toBe(503)
  })
})
