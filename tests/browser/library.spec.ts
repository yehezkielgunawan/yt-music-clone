import { expect } from '@playwright/test'
import { test } from './fixtures'
import { authTestEnv } from '../fixtures/auth'
import { fakeAPI, connectAndStart } from '../fixtures/youtube'

test('refreshing successfully clears a previous library load error', async ({
  page,
}) => {
  let fail = true
  await page.route('**/api/playlists', (route) => {
    if (route.request().method() === 'GET' && fail) {
      fail = false
      return route.fulfill({
        status: 503,
        json: { error: 'Temporary library failure.' },
      })
    }
    return route.continue()
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Temporary library failure.',
  )
  await page
    .getByRole('button', { name: 'Refresh library', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Refresh library', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('saves labeled YouTube Music tracks, reorders duplicates and reopens on another device', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  const name = `Rotation ${crypto.randomUUID()}`
  await page.getByLabel('Playlist name').fill(name)
  await page
    .getByLabel('Track links')
    .fill(
      'https://music.youtube.com/watch?v=jfKfPfyJRdk&si=test\nhttps://youtu.be/jfKfPfyJRdk',
    )
  await page.getByRole('button', { name: 'Add tracks', exact: true }).click()
  await page.getByLabel('Track 1 label').fill('First version')
  await page.getByLabel('Track 2 label').fill('Second version')
  await page
    .getByRole('button', { name: 'Move track 2 up', exact: true })
    .click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Playlist saved.' }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click()
  await expect(page.getByLabel('Track 1 label')).toHaveValue('Second version')
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
  })
  await context.route('**/api/tracks/*', (route) =>
    route.fulfill({
      json: { title: 'Fixture song', author: 'Fixture artist' },
    }),
  )
  const other = await context.newPage()
  try {
    await other.goto('/')
    await other.getByRole('tab', { name: 'Library', exact: true }).click()
    await other
      .getByRole('button', { name: `Open ${name}`, exact: true })
      .click()
    await expect(other.getByLabel('Track 2 label')).toHaveValue('First version')
    await other
      .getByRole('button', { name: 'Load into queue', exact: true })
      .click()
    await other.getByRole('tab', { name: 'Your queue' }).click()
    await expect(other.locator('.track-row').first()).toContainText(
      'Second version',
    )
    await other.reload()
    await expect(other.locator('.track-row').first()).toContainText(
      'Second version',
    )
  } finally {
    await context.close()
  }
})

test('protects unsaved drafts and retains them after a failed save', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  await page.getByLabel('Playlist name').fill('Unsaved draft')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('tab', { name: 'Your queue' }).click()
  await expect(page.getByLabel('Playlist name')).toHaveValue('Unsaved draft')
  await page.route('**/api/playlists', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          json: { error: 'Storage temporarily unavailable.' },
        })
      : route.continue(),
  )
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Storage temporarily unavailable.',
  )
  await expect(page.getByLabel('Playlist name')).toHaveValue('Unsaved draft')
  await page.unroute('**/api/playlists')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Playlist saved.' }),
  ).toBeVisible()
})

test('library editing, loading and deletion preserve active playback until restart', async ({
  page,
}) => {
  await fakeAPI(page)
  await page.goto('/')
  await connectAndStart(page)
  await page
    .locator('#fixture-player')
    .evaluate((element) => element.setAttribute('data-instance', 'original'))
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page
    .getByRole('button', {
      name: 'Save current queue as playlist',
      exact: true,
    })
    .click()
  await page.getByLabel('Playlist name').fill('Imported queue')
  await expect(page.getByLabel('Track 3 label')).toBeVisible()
  await page.getByLabel('Track 1 label').fill('My first track')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Playlist saved.' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Load into queue', exact: true })
    .click()
  page.once('dialog', (dialog) => dialog.accept())
  await page
    .getByRole('button', { name: 'Delete playlist', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Playlist deleted.' }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'Your queue' }).click()
  await expect(page.locator('.track-row').first()).not.toContainText(
    'My first track',
  )
  expect(
    (await page.evaluate(() => Reflect.get(window, '__fixture').calls)).filter(
      (call: string[]) => call[0] === 'loadPlaylist',
    ),
  ).toHaveLength(1)
  await expect(page.locator('#fixture-player')).toHaveAttribute(
    'data-instance',
    'original',
  )
  await page.getByRole('button', { name: 'Restart queue', exact: true }).click()
  await expect(page.locator('.track-row').first()).toContainText(
    'My first track',
  )
  await expect(page.locator('.now-playing strong')).toHaveText('My first track')
  expect(
    (await page.evaluate(() => Reflect.get(window, '__fixture').calls)).filter(
      (call: string[]) => call[0] === 'loadPlaylist',
    ),
  ).toHaveLength(2)
})

test('a lost create response can be retried without duplicating the playlist', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  const name = `Retry ${crypto.randomUUID()}`
  await page.getByLabel('Playlist name').fill(name)
  let lost = false
  await page.route('**/api/playlists', async (route) => {
    if (route.request().method() === 'POST' && !lost) {
      lost = true
      await route.fetch()
      await route.abort()
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Could not reach your library',
  )
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Playlist saved.' }),
  ).toBeVisible()
  const { playlists } = await (await page.request.get('/api/playlists')).json()
  expect(
    playlists.filter((item: { name: string }) => item.name === name),
  ).toHaveLength(1)
})

test('validates batch links without partially adding tracks and fits the mobile viewport', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  await page.getByLabel('Playlist name').fill('Batch validation')
  await page
    .getByLabel('Track links')
    .fill('jfKfPfyJRdk\nhttps://music.youtube.com/playlist?list=PLabc')
  await page.getByRole('button', { name: 'Add tracks', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Line 2:')
  await expect(page.getByLabel('Track 1 label')).toHaveCount(0)
  await page.getByLabel('Track links').fill('jfKfPfyJRdk')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Add the pasted track links',
  )
  await page.getByRole('button', { name: 'Add tracks', exact: true }).click()
  await page.getByLabel('Track 1 label').fill('a'.repeat(200))
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: 'test-results/mobile-library.png',
    fullPage: true,
    scale: 'css',
  })
})

test('conflicting saves preserve drafts and can save as new or reload latest', async ({
  page,
}) => {
  await page.goto('/')
  const origin = authTestEnv.AUTH_URL
  const id = crypto.randomUUID()
  const data = { id, name: `Conflict ${id}`, entries: [] }
  await page.request.post('/api/playlists', { headers: { origin }, data })
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page
    .getByRole('button', { name: `Open ${data.name}`, exact: true })
    .click()
  await page.getByLabel('Playlist name').fill('Local draft')
  await page.request.put(`/api/playlists/${id}`, {
    headers: { origin },
    data: { ...data, name: 'Remote edit', revision: 1 },
  })
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'changed on another device',
  )
  await expect(page.getByLabel('Playlist name')).toHaveValue('Local draft')
  await page
    .getByRole('button', { name: 'Save as new playlist', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Playlist saved.' }),
  ).toBeVisible()
  const { playlists } = await (await page.request.get('/api/playlists')).json()
  expect(
    playlists.filter((item: { name: string }) =>
      ['Remote edit', 'Local draft'].includes(item.name),
    ),
  ).toHaveLength(2)
  await page
    .getByRole('button', { name: 'Open Remote edit', exact: true })
    .click()
  await page.getByLabel('Playlist name').fill('Another local edit')
  await page.request.put(`/api/playlists/${id}`, {
    headers: { origin },
    data: { ...data, name: 'Newest remote', revision: 2 },
  })
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reload latest', exact: true }).click()
  await expect(page.getByLabel('Playlist name')).toHaveValue('Newest remote')
})

test('empty playlists save and expired sessions retain the editor without navigating', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New playlist', exact: true }).click()
  await page.getByLabel('Playlist name').fill('Empty playlist')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Load into queue', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Playlist name').fill('Keep this draft')
  await page.route('**/api/playlists/*', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } }),
  )
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('session expired')
  await expect(page.getByLabel('Playlist name')).toHaveValue('Keep this draft')
  await expect(
    page.getByRole('link', { name: 'Sign in in a new tab, then retry' }),
  ).toHaveAttribute('target', '_blank')
  expect(new URL(page.url()).pathname).toBe('/')
})
