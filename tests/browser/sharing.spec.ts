import { expect } from '@playwright/test'
import { test } from './fixtures'
import { authTestEnv } from '../fixtures/auth'
import { fakeAPI, connectAndStart } from '../fixtures/youtube'

test('publishes a fixed snapshot, plays anonymously, replaces and revokes without disturbing private playback', async ({
  page,
  browser,
}) => {
  const id = crypto.randomUUID()
  const name = `Shared ${id}`
  const headers = { origin: authTestEnv.AUTH_URL }
  await page.request.post('/api/playlists', {
    headers,
    data: {
      id,
      name,
      entries: [
        {
          id: crypto.randomUUID(),
          videoId: 'jfKfPfyJRdk',
          label: 'First copy',
          author: 'Saved artist',
        },
        {
          id: crypto.randomUUID(),
          videoId: 'jfKfPfyJRdk',
          label: 'Second copy',
        },
      ],
    },
  })
  await fakeAPI(page)
  await page.goto('/')
  await connectAndStart(page)
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click()
  await page
    .getByLabel('Playlist name', { exact: true })
    .fill('Unpublished draft')
  await page
    .getByRole('button', { name: 'Share saved playlist', exact: true })
    .click()
  const link = page.getByLabel('Public playlist link', { exact: true })
  await expect(link).toHaveValue(/\/s\/[a-f0-9]{64}$/)
  const url = await link.inputValue()
  await expect(page.getByLabel('Playlist name', { exact: true })).toHaveValue(
    'Unpublished draft',
  )

  const guest = await browser.newContext()
  const visitor = await guest.newPage()
  try {
    await fakeAPI(visitor)
    await visitor.addInitScript(() =>
      localStorage.setItem('side-a:queue:v2', 'untouched-private-queue'),
    )
    let privateRequests = 0
    visitor.on('request', (request) => {
      if (/\/api\/(playlists|tracks|auth)/.test(request.url()))
        privateRequests++
    })
    await visitor.goto(url)
    await expect(
      visitor.getByRole('heading', { name, exact: true }),
    ).toBeVisible()
    await expect(
      visitor.getByRole('button', { name: 'Connect player', exact: true }),
    ).toBeVisible()
    await expect(
      visitor.getByRole('tab', { name: 'Library', exact: true }),
    ).toHaveCount(0)
    await visitor
      .getByRole('button', { name: 'Connect player', exact: true })
      .click()
    await expect(
      visitor.getByRole('button', { name: 'Start listening', exact: true }),
    ).toBeEnabled()
    expect(
      await visitor.evaluate(() =>
        Reflect.get(window, '__fixture').calls.filter(
          (call: string[]) => call[0] === 'loadPlaylist',
        ),
      ),
    ).toHaveLength(0)
    await visitor
      .getByRole('button', { name: 'Start listening', exact: true })
      .click()
    await expect(visitor.locator('.now-playing strong')).toHaveText(
      'First copy',
    )
    await visitor
      .getByRole('button', { name: '2. Second copy', exact: true })
      .click()
    await expect(visitor.locator('.now-playing strong')).toHaveText(
      'Second copy',
    )
    expect(
      await visitor.evaluate(() => localStorage.getItem('side-a:queue:v2')),
    ).toBe('untouched-private-queue')
    expect(privateRequests).toBe(0)
    expect(
      (
        await guest.request.get(`${authTestEnv.AUTH_URL}/api/playlists`)
      ).status(),
    ).toBe(401)

    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Playlist saved.' }),
    ).toBeVisible()
    await visitor.reload()
    await expect(
      visitor.getByRole('heading', { name, exact: true }),
    ).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await page
      .getByRole('button', { name: 'Replace shared snapshot', exact: true })
      .click()
    await expect(link).not.toHaveValue(url)
    const replacement = await link.inputValue()
    expect((await guest.request.get(url)).status()).toBe(404)
    await visitor.goto(replacement)
    await expect(
      visitor.getByRole('heading', { name: 'Unpublished draft', exact: true }),
    ).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await page
      .getByRole('button', { name: 'Disable sharing', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Share saved playlist', exact: true }),
    ).toBeEnabled()
    expect((await guest.request.get(replacement)).status()).toBe(404)
    expect(
      await page.evaluate(() =>
        Reflect.get(window, '__fixture').calls.filter(
          (call: string[]) => call[0] === 'loadPlaylist',
        ),
      ),
    ).toHaveLength(1)
    expect(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  } finally {
    await guest.close()
  }
})

test('recovers a lost sharing response without rotating the published link', async ({
  page,
}) => {
  const id = crypto.randomUUID()
  const name = `Retry share ${id}`
  await page.request.post('/api/playlists', {
    headers: { origin: authTestEnv.AUTH_URL },
    data: { id, name, entries: [] },
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click()
  let publishedPath = ''
  await page.route(`**/api/playlists/${id}/share`, async (route) => {
    if (route.request().method() === 'POST' && !publishedPath) {
      const response = await route.fetch()
      publishedPath = (await response.json()).share.path
      await route.abort()
    } else await route.continue()
  })
  await page
    .getByRole('button', { name: 'Share saved playlist', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Retry sharing request', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Retry sharing request', exact: true })
    .click()
  await expect(page.getByLabel('Public playlist link')).toHaveValue(
    `${authTestEnv.AUTH_URL}${publishedPath}`,
  )
})

test('D1 rejects competing replacements and removes public access when the source is deleted', async ({
  page,
  browser,
}) => {
  const id = crypto.randomUUID()
  const headers = { origin: authTestEnv.AUTH_URL }
  const path = `/api/playlists/${id}`
  await page.request.post('/api/playlists', {
    headers,
    data: { id, name: 'Concurrent sharing', entries: [] },
  })
  const firstResponse = await page.request.post(`${path}/share`, {
    headers,
    data: { revision: 1, version: 0, operationId: crypto.randomUUID() },
  })
  expect(firstResponse.status()).toBe(201)
  const { share: first } = await firstResponse.json()
  const competing = await Promise.all(
    Array.from({ length: 2 }, () =>
      page.request.put(`${path}/share`, {
        headers,
        data: {
          revision: 1,
          version: first.version,
          operationId: crypto.randomUUID(),
        },
      }),
    ),
  )
  expect(competing.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ])
  const { share: latest } = await (
    await page.request.get(`${path}/share`)
  ).json()
  expect(latest.version).toBe(2)
  expect(
    (
      await page.request.delete(`${path}/share`, {
        headers,
        data: { version: 1, operationId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(409)
  const guest = await browser.newContext()
  try {
    expect(
      (
        await guest.request.get(`${authTestEnv.AUTH_URL}${first.path}`)
      ).status(),
    ).toBe(404)
    expect(
      (
        await guest.request.get(`${authTestEnv.AUTH_URL}${latest.path}`)
      ).status(),
    ).toBe(200)
    expect(
      (
        await page.request.delete(path, { headers, data: { revision: 1 } })
      ).status(),
    ).toBe(200)
    expect(
      (
        await guest.request.get(`${authTestEnv.AUTH_URL}${latest.path}`)
      ).status(),
    ).toBe(404)
  } finally {
    await guest.close()
  }
})
