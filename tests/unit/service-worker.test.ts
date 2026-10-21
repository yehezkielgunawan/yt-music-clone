import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

async function worker() {
  const listeners: Record<string, (event: unknown) => void> = {}
  const addAll = vi.fn()
  const deleteCache = vi.fn()
  const fetchRequest = vi.fn(async () => new Response('network'))
  const cache = {
    addAll,
    match: vi.fn(async (path: string) =>
      path === '/offline.html'
        ? new Response('offline')
        : new Response('private room'),
    ),
  }
  runInNewContext(
    await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'),
    {
      self: {
        location: { origin: 'https://music.yehezgun.com' },
        addEventListener(name: string, callback: (event: unknown) => void) {
          listeners[name] = callback
        },
        clients: { claim: vi.fn() },
      },
      caches: {
        open: vi.fn(async () => cache),
        keys: vi.fn(async () => ['side-a-shell-v1', 'other-app']),
        delete: deleteCache,
        match: cache.match,
      },
      fetch: fetchRequest,
      URL,
      Response,
    },
  )
  return { listeners, addAll, deleteCache, fetchRequest, cache }
}

describe('public-only service worker cache', () => {
  it('does not fetch or cache protected HTML during installation', async () => {
    const { listeners, addAll, cache } = await worker()
    let installed: Promise<void> = Promise.resolve()
    listeners.install({
      waitUntil(promise: Promise<void>) {
        installed = promise
      },
    })
    await installed
    expect(addAll.mock.calls.flat(2)).not.toContain('/')
    expect(addAll.mock.calls.flat(2)).toContain('/offline.html')
    expect(cache.match).not.toHaveBeenCalledWith('/')
  })

  it('deletes the legacy private shell cache on activation', async () => {
    const { listeners, deleteCache } = await worker()
    let activated: Promise<void> = Promise.resolve()
    listeners.activate({
      waitUntil(promise: Promise<void>) {
        activated = promise
      },
    })
    await activated
    expect(deleteCache).toHaveBeenCalledWith('side-a-shell-v1')
    expect(deleteCache).not.toHaveBeenCalledWith('other-app')
  })

  it.each([
    '/api/auth/session',
    '/api/auth/signin',
    '/api/auth/callback/google',
    '/api/private',
  ])('never intercepts %s', async (path) => {
    const { listeners } = await worker()
    const respondWith = vi.fn()
    listeners.fetch({
      request: {
        method: 'GET',
        url: `https://music.yehezgun.com${path}`,
        mode: 'navigate',
      },
      respondWith,
    })
    expect(respondWith).not.toHaveBeenCalled()
  })

  it('returns an online authorization failure rather than an offline fallback', async () => {
    const { listeners, fetchRequest } = await worker()
    fetchRequest.mockResolvedValue(
      new Response('authentication unavailable', { status: 503 }),
    )
    let response: Promise<Response> = Promise.resolve(new Response())
    listeners.fetch({
      request: {
        method: 'GET',
        url: 'https://music.yehezgun.com/',
        mode: 'navigate',
      },
      respondWith(promise: Promise<Response>) {
        response = promise
      },
    })
    expect((await response).status).toBe(503)
  })

  it('uses the public offline screen only when the network fails', async () => {
    const { listeners, fetchRequest, cache } = await worker()
    fetchRequest.mockRejectedValue(new TypeError('offline'))
    let response: Promise<Response> = Promise.resolve(new Response())
    listeners.fetch({
      request: {
        method: 'GET',
        url: 'https://music.yehezgun.com/',
        mode: 'navigate',
      },
      respondWith(promise: Promise<Response>) {
        response = promise
      },
    })
    expect(await (await response).text()).toBe('offline')
    expect(cache.match).not.toHaveBeenCalledWith('/')
  })
})
