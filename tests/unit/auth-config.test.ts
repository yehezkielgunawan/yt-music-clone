import { describe, expect, it } from 'vitest'
import { getAuthConfig } from '../../src/auth/config'
import { authTestEnv } from '../fixtures/auth'

const account = {
  provider: 'google',
  type: 'oidc' as const,
  providerAccountId: 'google-owner-id',
}
const profile = {
  sub: 'google-owner-id',
  email: authTestEnv.ALLOWED_GOOGLE_EMAIL,
  email_verified: true,
}

describe('Google owner policy', () => {
  it('allows the verified owner', async () => {
    const config = getAuthConfig(authTestEnv)!
    expect(
      await config.callbacks!.signIn!({
        user: { id: profile.sub },
        account,
        profile,
      }),
    ).toBe(true)
  })

  it.each([
    { email: 'other@example.com' },
    { email_verified: false },
    { email: undefined },
    { sub: undefined },
  ])('denies an unauthorized Google profile: %j', async (overrides) => {
    const config = getAuthConfig(authTestEnv)!
    expect(
      await config.callbacks!.signIn!({
        user: { id: profile.sub },
        account,
        profile: { ...profile, ...overrides },
      }),
    ).toBe(false)
  })

  it('requires a boolean verification claim, not a truthy string', async () => {
    const config = getAuthConfig(authTestEnv)!
    expect(
      await config.callbacks!.signIn!({
        user: { id: profile.sub },
        account,
        profile: JSON.parse(
          JSON.stringify({ ...profile, email_verified: 'true' }),
        ),
      }),
    ).toBe(false)
  })

  it('denies any provider other than Google', async () => {
    const config = getAuthConfig(authTestEnv)!
    expect(
      await config.callbacks!.signIn!({
        user: { id: profile.sub },
        account: { ...account, provider: 'github' },
        profile,
      }),
    ).toBe(false)
  })

  it('records the verified Google identity in the encrypted session token', async () => {
    const config = getAuthConfig(authTestEnv)!
    const token = await config.callbacks!.jwt!({
      token: {},
      user: { id: 'unrelated-internal-id' },
      account,
      profile,
      trigger: 'signIn',
    })
    expect(token).toMatchObject({
      sub: profile.sub,
      provider: 'google',
      email: profile.email,
      emailVerified: true,
    })
  })

  it('does not accept identity changes from a client session update', async () => {
    const config = getAuthConfig(authTestEnv)!
    const token = {
      sub: profile.sub,
      provider: 'google',
      email: profile.email,
      emailVerified: true,
    }
    expect(
      await config.callbacks!.jwt!({
        token,
        user: { id: profile.sub },
        account: null,
        trigger: 'update',
        session: { email: 'other@example.com', emailVerified: false },
      }),
    ).toEqual(token)
  })

  it('keeps redirects on the configured origin', async () => {
    const config = getAuthConfig(authTestEnv)!
    for (const url of [
      'https://evil.example/',
      '//evil.example/',
      'javascript:alert(1)',
    ]) {
      expect(
        await config.callbacks!.redirect!({
          url,
          baseUrl: authTestEnv.AUTH_URL,
        }),
      ).toBe(`${authTestEnv.AUTH_URL}/`)
    }
  })

  it.each([
    'not-a-url',
    'http://example.com',
    'https://example.com/api/auth',
    'https://user:password@example.com',
  ])('rejects unsafe AUTH_URL configuration: %s', (AUTH_URL) => {
    expect(getAuthConfig({ ...authTestEnv, AUTH_URL })).toBeNull()
  })
})
