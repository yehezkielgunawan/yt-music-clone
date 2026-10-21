import { afterEach, describe, expect, it, vi } from 'vitest'
import app from '../../src/index'
import { authTestEnv, sessionCookie } from '../fixtures/auth'

async function request(
  path: string,
  cookie?: Awaited<ReturnType<typeof sessionCookie>>,
  env = authTestEnv,
) {
  return app.request(
    `${env.AUTH_URL}${path}`,
    { headers: cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {} },
    env,
  )
}

describe('private listening room', () => {
  it('redirects signed-out visitors before rendering the player', async () => {
    const response = await request('/')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/api/auth/signin')
    expect(await response.text()).not.toContain('player-stage')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('renders the room for a valid owner session', async () => {
    const response = await request('/', await sessionCookie())
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('id="player-stage"')
    expect(html).toContain('href="/api/auth/signout"')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin',
    )
  })

  it('rejects a tampered cookie', async () => {
    const cookie = await sessionCookie()
    cookie.value = `${cookie.value.slice(0, -10)}0123456789`
    expect((await request('/', cookie)).status).toBe(302)
  })

  it('rejects an expired session', async () => {
    expect(
      (await request('/', await sessionCookie({}, { maxAge: -120 }))).status,
    ).toBe(302)
  })

  it.each([
    { email: 'someone-else@example.com' },
    { emailVerified: false },
    { emailVerified: undefined },
    { provider: 'github' },
    { sub: undefined },
  ])('rejects an unauthorized session: %j', async (claims) => {
    expect((await request('/', await sessionCookie(claims))).status).toBe(302)
  })

  it('rechecks the current allowlist for an existing session', async () => {
    const cookie = await sessionCookie()
    const env = {
      ...authTestEnv,
      ALLOWED_GOOGLE_EMAIL: 'new-owner@example.com',
    }
    expect((await request('/', cookie, env)).status).toBe(302)
    const response = await request('/api/auth/session', cookie, env)
    expect(await response.json()).toBeNull()
  })

  it('returns an API 401 instead of a login redirect', async () => {
    expect((await request('/api/private')).status).toBe(401)
  })
})

describe('public authentication endpoints', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('serves Google sign-in without loading the player client', async () => {
    const response = await request('/api/auth/signin')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const html = await response.text()
    expect(html).toContain('Google')
    expect(html).toContain('csrfToken')
    expect(html).not.toContain('/src/client.tsx')
    expect(html).not.toContain('player-stage')
  })

  it('exposes no session to signed-out visitors', async () => {
    const response = await request('/api/auth/session')
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })

  it('shows a recoverable access-denied page', async () => {
    const response = await request('/api/auth/error?error=AccessDenied')
    expect(response.status).toBe(403)
    expect(await response.text()).toContain('/api/auth/signin')
  })

  it.each(Object.keys(authTestEnv))('fails closed without %s', async (key) => {
    const response = await request('/', undefined, {
      ...authTestEnv,
      [key]: '',
    })
    expect(response.status).toBe(503)
    const html = await response.text()
    expect(html).toContain('Authentication is not configured')
    expect(html).not.toContain(authTestEnv.GOOGLE_CLIENT_SECRET)
    expect(html).not.toContain('player-stage')
  })

  it('rejects a request from an unconfigured origin', async () => {
    const response = await app.request(
      'https://untrusted.example/',
      {},
      authTestEnv,
    )
    expect(response.status).toBe(400)
  })

  it('starts Google OAuth with CSRF, PKCE and the configured callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          issuer: 'https://accounts.google.com',
          authorization_endpoint:
            'https://accounts.google.com/o/oauth2/v2/auth',
          token_endpoint: 'https://oauth2.googleapis.com/token',
          jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
          code_challenge_methods_supported: ['S256'],
        }),
      ),
    )
    const csrf = await request('/api/auth/csrf')
    const { csrfToken } = await csrf.json<{ csrfToken: string }>()
    const cookies = csrf.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ')
    const response = await app.request(
      `${authTestEnv.AUTH_URL}/api/auth/signin/google`,
      {
        method: 'POST',
        headers: { cookie: cookies },
        body: new URLSearchParams({ csrfToken, callbackUrl: '/' }),
      },
      authTestEnv,
    )
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin).toBe('https://accounts.google.com')
    expect(location.searchParams.get('redirect_uri')).toBe(
      `${authTestEnv.AUTH_URL}/api/auth/callback/google`,
    )
    expect(location.searchParams.get('scope')).toBe('openid email profile')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('code_challenge')).toBeTruthy()
    expect(location.searchParams.get('state')).toBeTruthy()
  })

  it('clears the owner cookie only after a CSRF-protected logout POST', async () => {
    const cookie = await sessionCookie()
    const csrf = await request('/api/auth/csrf', cookie)
    const { csrfToken } = await csrf.json<{ csrfToken: string }>()
    const response = await app.request(
      `${authTestEnv.AUTH_URL}/api/auth/signout`,
      {
        method: 'POST',
        headers: {
          cookie: [
            `${cookie.name}=${cookie.value}`,
            ...csrf.headers.getSetCookie().map((value) => value.split(';')[0]),
          ].join('; '),
        },
        body: new URLSearchParams({ csrfToken, callbackUrl: '/' }),
      },
      authTestEnv,
    )
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`${authTestEnv.AUTH_URL}/`)
    expect(
      response.headers
        .getSetCookie()
        .some(
          (value) =>
            value.startsWith(`${cookie.name}=;`) && value.includes('Max-Age=0'),
        ),
    ).toBe(true)
  })

  it('rejects a logout POST without a CSRF token', async () => {
    const cookie = await sessionCookie()
    const response = await app.request(
      `${authTestEnv.AUTH_URL}/api/auth/signout`,
      {
        method: 'POST',
        headers: { cookie: `${cookie.name}=${cookie.value}` },
        body: new URLSearchParams({ callbackUrl: '/' }),
      },
      authTestEnv,
    )
    expect(response.headers.get('location')).toContain('MissingCSRF')
    expect(
      response.headers
        .getSetCookie()
        .some((value) => value.startsWith(`${cookie.name}=;`)),
    ).toBe(false)
  })

  it('uses secure HTTPS cookies and ignores forwarded-host spoofing', async () => {
    const env = { ...authTestEnv, AUTH_URL: 'https://music.yehezgun.com' }
    const response = await app.request(
      `${env.AUTH_URL}/api/auth/csrf`,
      {
        headers: {
          'x-forwarded-host': 'evil.example',
          'x-forwarded-proto': 'http',
        },
      },
      env,
    )
    expect(response.status).toBe(200)
    const cookies = response.headers.getSetCookie()
    expect(
      cookies.some(
        (value) =>
          value.startsWith('__Host-authjs.csrf-token=') &&
          value.includes('HttpOnly') &&
          value.includes('Secure') &&
          value.includes('SameSite=Lax'),
      ),
    ).toBe(true)
    expect(
      (await request('/', await sessionCookie({}, { url: env.AUTH_URL }), env))
        .status,
    ).toBe(200)
  })
})
