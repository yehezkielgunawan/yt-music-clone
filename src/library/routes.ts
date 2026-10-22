import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../auth/middleware'
import { PlaylistRepository } from './repository'
import { parseId, parsePlaylist, parseRevision } from './validation'
import { sharing } from '../sharing/routes'

const library = new Hono<AppEnv>()
library.use('*', async (c, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(c.req.method)) {
    if (c.req.header('origin') !== new URL(c.env.AUTH_URL).origin)
      return c.json({ error: 'Library changes must come from this app.' }, 403)
    if (
      c.req.header('content-type')?.split(';')[0].trim().toLowerCase() !==
      'application/json'
    )
      return c.json({ error: 'Send a JSON request.' }, 400)
  }
  await next()
})
library.use(
  '*',
  bodyLimit({
    maxSize: 262144,
    onError: (c) => c.json({ error: 'Playlist request is too large.' }, 413),
  }),
)
library.use('*', async (c, next) => {
  if (!c.env.DB)
    return c.json(
      { error: 'Library storage is unavailable. Try again shortly.' },
      503,
    )
  await next()
})
library.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse()
  if (error instanceof SyntaxError)
    return c.json({ error: 'Send valid JSON.' }, 400)
  if (error instanceof InvalidInput)
    return c.json({ error: error.message }, 400)
  console.error(
    JSON.stringify({ event: 'library-storage-error', type: error.name }),
  )
  return c.json(
    { error: 'Library storage is unavailable. Try again shortly.' },
    503,
  )
})

class InvalidInput extends Error {}
function validate<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    throw new InvalidInput(
      error instanceof Error ? error.message : 'Invalid playlist.',
    )
  }
}
function repo(c: import('hono').Context<AppEnv>) {
  return new PlaylistRepository(c.env.DB!, c.get('ownerId'))
}
const conflict = {
  error:
    'This playlist changed on another device. Reload the latest version or save your draft as a new playlist.',
}

library.route('/', sharing)
library.get('/', async (c) => c.json({ playlists: await repo(c).list() }))
library.post('/', async (c) => {
  const body = await c.req.json<unknown>()
  const draft = validate(() => parsePlaylist(body))
  const id = validate(() => parseId((body as Record<string, unknown>).id))
  const saved = await repo(c).create(id, draft)
  return saved ? c.json({ playlist: saved }, 201) : c.json(conflict, 409)
})
library.get('/:id', async (c) => {
  const id = validate(() => parseId(c.req.param('id')))
  const saved = await repo(c).get(id)
  return saved
    ? c.json({ playlist: saved })
    : c.json({ error: 'Playlist not found.' }, 404)
})
library.put('/:id', async (c) => {
  const body = await c.req.json<unknown>()
  const draft = validate(() => parsePlaylist(body))
  const id = validate(() => parseId(c.req.param('id')))
  const revision = validate(() =>
    parseRevision((body as Record<string, unknown>).revision),
  )
  const saved = await repo(c).update(id, revision, draft)
  if (saved) return c.json({ playlist: saved })
  return (await repo(c).get(id))
    ? c.json(conflict, 409)
    : c.json(
        {
          error:
            'Playlist not found. Your draft is still here; save it as a new playlist.',
        },
        404,
      )
})
library.delete('/:id', async (c) => {
  const body = await c.req.json<unknown>()
  const id = validate(() => parseId(c.req.param('id')))
  const revision = validate(() =>
    parseRevision(
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).revision
        : undefined,
    ),
  )
  if (await repo(c).delete(id, revision)) return c.json({ deleted: true })
  return (await repo(c).get(id))
    ? c.json(conflict, 409)
    : c.json({ error: 'Playlist not found.' }, 404)
})

export { library }
