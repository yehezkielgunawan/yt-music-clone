import { expect } from '@playwright/test'
import { test } from './fixtures'
import { authTestEnv } from '../fixtures/auth'
import { fakeAPI, connectAndStart } from '../fixtures/youtube'

test('looks up music details, preserves label and album edits, and saves across reloads', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  const name = `Music details ${crypto.randomUUID()}`
  await page.getByLabel('Playlist name').fill(name)
  await page.getByLabel('Track links').fill('t_xWqaUws6c\nt_xWqaUws6c')
  await page.getByRole('button', { name: 'Add tracks', exact: true }).click()
  const tracks = page.getByRole('list', { name: 'Playlist tracks' })
  await expect(tracks).toContainText('Fixture song')
  await expect(tracks).toContainText('Fixture artist')
  await expect(tracks).not.toContainText('t_xWqaUws6c')
  await page.getByLabel('Track 1 label', { exact: true }).fill('Personal title')
  await page.getByLabel('Track 1 album', { exact: true }).fill('Personal album')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Playlist saved.' }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click()
  await expect(page.getByLabel('Track 1 album', { exact: true })).toHaveValue(
    'Personal album',
  )
  await page
    .getByRole('button', { name: 'Load into queue', exact: true })
    .click()
  await page.getByRole('tab', { name: 'Your queue' }).click()
  await expect(page.locator('.track-row').first()).toContainText(
    'Personal title',
  )
  await expect(page.locator('.track-row').first()).toContainText(
    'Fixture artist · Personal album',
  )
  await page.reload()
  await expect(page.locator('.track-row').first()).toContainText(
    'Personal album',
  )
})

test('offers retry without showing an ID when details are unavailable', async ({
  page,
}) => {
  let fail = true
  await page.route('**/api/tracks/t_xWqaUws6c', (route) =>
    route.fulfill(
      fail
        ? { status: 502, json: { error: 'Unavailable' } }
        : { json: { title: 'Recovered song', author: 'Recovered artist' } },
    ),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit test queue' }).click()
  await page.getByLabel('Make it your own').fill('t_xWqaUws6c')
  await page.getByRole('button', { name: 'Save queue', exact: true }).click()
  await expect(page.locator('.track-row')).toContainText(
    'Track details unavailable',
  )
  await expect(page.locator('.track-row')).not.toContainText('t_xWqaUws6c')
  await expect(
    page.getByRole('button', { name: 'Retry track details', exact: true }),
  ).toBeVisible()
  fail = false
  await page
    .getByRole('button', { name: 'Retry track details', exact: true })
    .click()
  await expect(page.locator('.track-row')).toContainText('Recovered song')
})

test('late metadata never changes another playlist draft or restarts active playback', async ({
  page,
}) => {
  await fakeAPI(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested!: () => void
  const started = new Promise<void>((resolve) => {
    requested = resolve
  })
  await page.route('**/api/tracks/t_xWqaUws6c', async (route) => {
    requested()
    await gate
    await route.fulfill({
      json: { title: 'Late title', author: 'Late artist' },
    })
  })
  await page.goto('/')
  await connectAndStart(page)
  const origin = authTestEnv.AUTH_URL
  const id = crypto.randomUUID()
  const name = `Old playlist ${id}`
  await page.request.post('/api/playlists', {
    headers: { origin },
    data: {
      id,
      name,
      entries: [
        { id: crypto.randomUUID(), videoId: 't_xWqaUws6c', label: null },
      ],
    },
  })
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click()
  await started
  await page.getByLabel('Track 1 label', { exact: true }).fill('Keep my edit')
  await page.getByLabel('Track 1 album', { exact: true }).fill('Keep my album')
  release()
  await expect(
    page.getByRole('list', { name: 'Playlist tracks' }),
  ).toContainText('Late artist · Keep my album')
  await expect(page.getByLabel('Track 1 label', { exact: true })).toHaveValue(
    'Keep my edit',
  )
  const { playlist } = await (
    await page.request.get(`/api/playlists/${id}`)
  ).json()
  expect(playlist.revision).toBe(1)
  expect(playlist.entries[0].title).toBeUndefined()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  await expect(page.getByLabel('Track 1 label', { exact: true })).toHaveCount(0)
  expect(
    (await page.evaluate(() => Reflect.get(window, '__fixture').calls)).filter(
      (call: string[]) => call[0] === 'loadPlaylist',
    ),
  ).toHaveLength(1)
})

test('a response arriving after switching playlists cannot populate the new draft', async ({
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested!: () => void
  const started = new Promise<void>((resolve) => {
    requested = resolve
  })
  await page.route('**/api/tracks/t_xWqaUws6c', async (route) => {
    requested()
    await gate
    await route.fulfill({ json: { title: 'Old track', author: 'Old artist' } })
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  await page.getByLabel('Track links').fill('t_xWqaUws6c')
  await page.getByRole('button', { name: 'Add tracks', exact: true }).click()
  await started
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  await page.getByLabel('Playlist name').fill('New untouched draft')
  const response = page.waitForResponse('**/api/tracks/t_xWqaUws6c')
  release()
  await response
  await expect(page.getByLabel('Playlist name')).toHaveValue(
    'New untouched draft',
  )
  await expect(
    page.getByRole('list', { name: 'Playlist tracks' }).getByRole('listitem'),
  ).toHaveCount(0)
})

test('metadata arriving after a lost create response preserves idempotent retries', async ({
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/tracks/t_xWqaUws6c', async (route) => {
    await gate
    await route.fulfill({
      json: { title: 'Late title', author: 'Late artist' },
    })
  })
  let lost = false
  await page.route('**/api/playlists', async (route) => {
    if (route.request().method() === 'POST' && !lost) {
      lost = true
      await route.fetch()
      await route.abort()
    } else await route.continue()
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  const name = `Lost response ${crypto.randomUUID()}`
  await page.getByLabel('Playlist name').fill(name)
  await page.getByLabel('Track links').fill('t_xWqaUws6c')
  await page.getByRole('button', { name: 'Add tracks', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Could not reach your library',
  )
  release()
  await expect(
    page.getByRole('list', { name: 'Playlist tracks' }),
  ).toContainText('Late title')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Playlist saved.' }),
  ).toBeVisible()
  // Once the uncertain create is acknowledged, the next normal save can add details.
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Playlist saved.' }),
  ).toBeVisible()
  const { playlists } = await (await page.request.get('/api/playlists')).json()
  const matches = playlists.filter(
    (item: { name: string }) => item.name === name,
  )
  expect(matches).toHaveLength(1)
  const { playlist } = await (
    await page.request.get(`/api/playlists/${matches[0].id}`)
  ).json()
  expect(playlist.entries[0]).toMatchObject({
    title: 'Late title',
    author: 'Late artist',
  })
})

test('uses Yehezgun-music branding in the page and installation assets', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Yehezgun-music — Your little listening room')
  await expect(
    page.getByRole('link', { name: 'Yehezgun-music home', exact: true }),
  ).toBeVisible()
  const manifest = await (
    await page.request.get('/manifest.webmanifest')
  ).json()
  expect(manifest).toMatchObject({
    name: 'Yehezgun-music',
    short_name: 'Yehezgun-music',
  })
  expect(await (await page.request.get('/offline.html')).text()).toContain(
    'Yehezgun-music — Offline',
  )
  for (const width of [320, 393, 740, 1024, 1280]) {
    await page.setViewportSize({ width, height: 851 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await page.screenshot({
    path: 'test-results/yehezgun-music.png',
    fullPage: true,
    scale: 'css',
  })
})
