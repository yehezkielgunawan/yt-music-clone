import { Hono } from 'hono'
import type { AppEnv } from '../auth/middleware'
import { ShareRepository } from './repository'
import { SharedPage } from './page'

export const publicSharing = new Hono<AppEnv>()
publicSharing.use('*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow')
  await next()
})

for (const path of ['/s/:token', '/api/shares/:token']) {
  publicSharing.get(path, async (c) => {
    const json = c.req.path.startsWith('/api/')
    const missing = () =>
      json
        ? c.json({ error: 'Playlist not found.' }, 404)
        : c.html(<SharedPage />, 404)
    const token = c.req.param('token')!
    if (!/^[a-f0-9]{64}$/.test(token)) return missing()
    try {
      if (!c.env.DB) throw new Error('Storage unavailable')
      const playlist = await new ShareRepository(c.env.DB, '').publicSnapshot(
        token,
      )
      if (!playlist) return missing()
      return json
        ? c.json({ playlist })
        : c.html(<SharedPage playlist={playlist} />)
    } catch {
      // Do not log capability URLs or their tokens.
      return json
        ? c.json({ error: 'Shared playlist temporarily unavailable.' }, 503)
        : c.html(<SharedPage unavailable />, 503)
    }
  })
}
