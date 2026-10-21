import Google from '@auth/core/providers/google'
import type { AuthConfig } from '@hono/auth-js'

function ownerEmail(email: unknown, allowed: string): boolean {
  return typeof email === 'string' && email.toLowerCase() === allowed
}

export function getAuthConfig(env: CloudflareBindings): AuthConfig | null {
  if (
    typeof env.AUTH_SECRET !== 'string' ||
    env.AUTH_SECRET.length < 32 ||
    !env.GOOGLE_CLIENT_ID?.trim() ||
    !env.GOOGLE_CLIENT_SECRET?.trim() ||
    !env.ALLOWED_GOOGLE_EMAIL?.trim() ||
    !env.AUTH_URL?.trim()
  )
    return null

  const allowed = env.ALLOWED_GOOGLE_EMAIL.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allowed)) return null

  let origin: string
  try {
    const url = new URL(env.AUTH_URL)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return null
    origin = url.origin
  } catch {
    return null
  }

  return {
    basePath: '/api/auth',
    secret: env.AUTH_SECRET,
    // Middleware accepts only AUTH_URL's exact origin before trusting the host.
    trustHost: true,
    useSecureCookies: origin.startsWith('https:'),
    providers: [
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        checks: ['pkce', 'state'],
        authorization: {
          params: { scope: 'openid email profile', prompt: 'select_account' },
        },
      }),
    ],
    session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
    theme: { colorScheme: 'dark', brandColor: '#1b4235' },
    logger: {
      // Log error types, never OAuth responses, tokens, cookies, or credentials.
      error(error) {
        console.error(JSON.stringify({ event: 'auth-error', type: error.name }))
      },
      warn(code) {
        // AUTH_URL pins the origin; basePath deliberately pins the separate route.
        if (code !== 'env-url-basepath-redundant')
          console.warn(JSON.stringify({ event: 'auth-warning', code }))
      },
    },
    callbacks: {
      signIn({ account, profile }) {
        return (
          account?.provider === 'google' &&
          profile?.email_verified === true &&
          typeof profile.sub === 'string' &&
          profile.sub.length > 0 &&
          ownerEmail(profile.email, allowed)
        )
      },
      jwt({ token, account, profile }) {
        if (account) {
          if (
            account.provider !== 'google' ||
            profile?.email_verified !== true ||
            typeof profile.sub !== 'string' ||
            !profile.sub ||
            !ownerEmail(profile.email, allowed)
          )
            return null
          token.sub = profile.sub
          token.email = String(profile.email).toLowerCase()
          token.provider = 'google'
          token.emailVerified = true
        }
        // Runs on session reads too; changing the allowlist invalidates old access.
        // Ignore client-supplied session updates: identity comes only from Google.
        return token.provider === 'google' &&
          token.emailVerified === true &&
          typeof token.sub === 'string' &&
          token.sub.length > 0 &&
          ownerEmail(token.email, allowed)
          ? token
          : null
      },
      redirect({ url }) {
        try {
          const destination = new URL(url, origin)
          if (destination.origin === origin) return destination.href
        } catch {
          /* Fall back to the listening room. */
        }
        return `${origin}/`
      },
    },
  }
}
