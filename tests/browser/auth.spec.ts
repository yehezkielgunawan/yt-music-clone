import { expect, test } from '@playwright/test'
import { sessionCookie } from '../fixtures/auth'

test('signed-out visitors see Google sign-in and never load YouTube', async ({
  page,
}) => {
  const errors: string[] = []
  const youtube: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('youtube.com')) youtube.push(request.url())
  })
  await page.goto('/')
  await expect(page).toHaveURL(/\/api\/auth\/signin$/)
  await expect(page.getByRole('button', { name: /Google/ })).toBeVisible()
  await expect(page.locator('#player-stage')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(youtube).toEqual([])
})

test('logout removes access on reload and browser back', async ({
  page,
  context,
}) => {
  await context.addCookies([await sessionCookie()])
  await page.goto('/')
  await expect(page.locator('#player-stage')).toBeVisible()
  await page.getByRole('link', { name: 'Sign out', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/api\/auth\/signin$/)
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'authjs.session-token',
    ),
  ).toBe(false)
  // Traverse past the confirmation page to the original authenticated room.
  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL(/\/api\/auth\/signin$/)
  await expect(page.locator('#player-stage')).toHaveCount(0)
  await page.goto('/')
  await expect(page).toHaveURL(/\/api\/auth\/signin$/)
})

test('wrong-account and expired cookies cannot open the room', async ({
  page,
  context,
}) => {
  for (const cookie of [
    await sessionCookie({ email: 'someone-else@example.com' }),
    await sessionCookie({}, { maxAge: -120 }),
  ]) {
    await context.clearCookies()
    await context.addCookies([cookie])
    await page.goto('/')
    await expect(page).toHaveURL(/\/api\/auth\/signin$/)
    await expect(page.locator('#player-stage')).toHaveCount(0)
  }
})

test('access denied has a working sign-in retry', async ({ page }) => {
  await page.goto('/api/auth/error?error=AccessDenied')
  await expect(
    page.getByRole('heading', { name: 'This room is private.' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Try Google sign-in again' }).click()
  await expect(page.getByRole('button', { name: /Google/ })).toBeVisible()
})

test('service worker stores only public assets after authenticated use', async ({
  page,
  context,
}) => {
  await context.addCookies([await sessionCookie()])
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  const requests = await page.evaluate(async () => {
    const names = await caches.keys()
    return (
      await Promise.all(
        names
          .filter((name) => name.startsWith('side-a-shell-'))
          .map(async (name) => {
            const cache = await caches.open(name)
            return (await cache.keys()).map(
              (request) => new URL(request.url).pathname,
            )
          }),
      )
    ).flat()
  })
  expect(requests).toContain('/offline.html')
  expect(requests).not.toContain('/')
  expect(requests.some((path) => path.startsWith('/api/'))).toBe(false)
  const session = await page.request.get('/api/auth/session')
  expect(session.headers()['cache-control']).toBe('private, no-store')
})

test('activation removes a legacy cached listening room', async ({ page }) => {
  await page.goto('/api/auth/signin')
  await page.evaluate(async () => {
    const oldCache = await caches.open('side-a-shell-v1')
    await oldCache.put('/', new Response('legacy private listening room'))
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await caches.keys()).includes('side-a-shell-v1'),
      ),
    )
    .toBe(false)
  await page.goto('/')
  await expect(page).toHaveURL(/\/api\/auth\/signin$/)
  await expect(page.locator('#player-stage')).toHaveCount(0)
})
