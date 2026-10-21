import { getAuthUser } from '@hono/auth-js'
import { createMiddleware } from 'hono/factory'
import { getAuthConfig } from './config'

export type AppEnv = {
  Bindings: Omit<CloudflareBindings, 'DB'> &
    Partial<Pick<CloudflareBindings, 'DB'>>
  Variables: { ownerId: string }
}

export const configureAuth = createMiddleware<AppEnv>(async (c, next) => {
  const config = getAuthConfig(c.env)
  if (!config) {
    return c.text(
      'Authentication is not configured. Set the required Worker environment variables, then retry.',
      503,
    )
  }
  if (new URL(c.req.url).origin !== new URL(c.env.AUTH_URL).origin) {
    return c.text('Open Yehezgun-music at its configured AUTH_URL.', 400)
  }
  c.set('authConfig', config)
  await next()
})

export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  const auth = await getAuthUser(c)
  if (!auth?.token) {
    return c.req.path.startsWith('/api/')
      ? c.json({ error: 'Unauthorized' }, 401)
      : c.redirect('/api/auth/signin')
  }
  c.set('authUser', auth)
  c.set('ownerId', `google:${auth.token.sub}`)
  await next()
})
