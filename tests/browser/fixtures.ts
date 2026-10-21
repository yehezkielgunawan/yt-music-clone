import { test as base } from '@playwright/test'
import { sessionCookie } from '../fixtures/auth'

// Exercise the real production authorization middleware with encrypted test cookies.
export const test = base.extend({
  page: async ({ page, context }, use) => {
    await context.addCookies([
      { ...(await sessionCookie()), httpOnly: true, sameSite: 'Lax' },
    ])
    await use(page)
  },
})
