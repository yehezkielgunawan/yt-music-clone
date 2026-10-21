import { afterEach, describe, expect, it, vi } from 'vitest'
import app from '../../src/index'
import { authTestEnv, sessionCookie } from '../fixtures/auth'

const videoId = 't_xWqaUws6c'
async function request(id = videoId, authorized = true) {
  const cookie = await sessionCookie()
  return app.request(
    `${authTestEnv.AUTH_URL}/api/tracks/${id}`,
    {
      headers: authorized ? { cookie: `${cookie.name}=${cookie.value}` } : {},
    },
    authTestEnv,
  )
}
afterEach(() => vi.unstubAllGlobals())

describe('track metadata endpoint', () => {
  it('requires an owner session before contacting YouTube', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect((await request(videoId, false)).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects invalid IDs without contacting an arbitrary URL', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect((await request('invalid')).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('returns only validated title and author from the fixed oEmbed endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        title: ' Song ',
        author_name: ' Artist ',
        html: '<script>untrusted</script>',
      }),
    )
    vi.stubGlobal('fetch', fetcher)
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ title: 'Song', author: 'Artist' })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const [target, options] = fetcher.mock.calls[0]
    const url = new URL(String(target))
    expect(url.origin + url.pathname).toBe('https://www.youtube.com/oembed')
    expect(url.searchParams.get('url')).toBe(
      `https://www.youtube.com/watch?v=${videoId}`,
    )
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.redirect).toBe('error')
  })
  it.each([
    () => new Response(null, { status: 404 }),
    () => Response.json({ title: 42, author_name: 'Artist' }),
    () => Response.json({ title: 'Song', author_name: 'x'.repeat(201) }),
    () => new Response('not json'),
    () => new Response('x'.repeat(32769)),
  ])(
    'returns a retryable error for unavailable or invalid upstream details',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
      const result = await request()
      expect(result.status).toBe(502)
      expect(await result.json()).toEqual({
        error: 'Track details unavailable. Please retry.',
      })
    },
  )
  it('handles network and timeout failures without failing the app', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')),
    )
    expect((await request()).status).toBe(502)
  })
})
