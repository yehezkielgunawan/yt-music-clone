import { Hono } from 'hono'
import type { AppEnv } from '../auth/middleware'
import { PlaylistRepository } from '../library/repository'
import { parseId, parseRevision } from '../library/validation'
import { ShareRepository } from './repository'
import type { ShareMutation } from './types'

export const sharing = new Hono<AppEnv>()

function mutation(body: unknown): ShareMutation {
  if (!body || typeof body !== 'object')
    throw new Error('Send a sharing request.')
  const value = body as Record<string, unknown>
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 0)
    throw new Error('Use a valid sharing version.')
  return {
    version: Number(value.version),
    operationId: parseId(value.operationId),
  }
}

sharing.all('/:id/share', async (c) => {
  const method = c.req.method
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method))
    return c.json({ error: 'Method not allowed.' }, 405)
  let id: string
  let input: ShareMutation | undefined
  let revision = 0
  try {
    id = parseId(c.req.param('id'))
    if (method !== 'GET') {
      const body = await c.req.json<unknown>()
      input = mutation(body)
      if (method !== 'DELETE')
        revision = parseRevision((body as Record<string, unknown>).revision)
    }
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : 'Invalid sharing request.',
      },
      400,
    )
  }
  const db = c.env.DB!
  if (!(await new PlaylistRepository(db, c.get('ownerId')).get(id)))
    return c.json({ error: 'Playlist not found.' }, 404)
  const repo = new ShareRepository(db, c.get('ownerId'))
  if (method === 'GET') return c.json({ share: await repo.status(id) })
  const share =
    method === 'DELETE'
      ? await repo.revoke(id, input!)
      : await repo.publish(id, { ...input!, revision }, method === 'PUT')
  return share
    ? c.json({ share }, method === 'POST' ? 201 : 200)
    : c.json(
        {
          error:
            'The playlist or shared link changed. Refresh sharing status and reload the saved playlist before retrying. Your draft is still here.',
        },
        409,
      )
})
