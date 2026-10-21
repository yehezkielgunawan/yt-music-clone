import { encode, type JWT } from '@auth/core/jwt'
import testEnv from './auth-env.json' with { type: 'json' }

// Public, test-only credentials. Never use these values for a deployed Worker.
export const authTestEnv = testEnv satisfies Omit<CloudflareBindings, 'DB'>

export async function sessionCookie(
  claims: JWT = {},
  options: { url?: string; maxAge?: number; secret?: string } = {},
) {
  const url = options.url ?? authTestEnv.AUTH_URL
  const name = `${url.startsWith('https:') ? '__Secure-' : ''}authjs.session-token`
  const value = await encode({
    secret: options.secret ?? authTestEnv.AUTH_SECRET,
    salt: name,
    maxAge: options.maxAge ?? 3600,
    token: {
      sub: 'google-owner-id',
      email: authTestEnv.ALLOWED_GOOGLE_EMAIL,
      name: 'Side A owner',
      provider: 'google',
      emailVerified: true,
      ...claims,
    },
  })
  return { name, value, url }
}
