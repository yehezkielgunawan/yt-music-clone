import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'

// This is a controlled API-boundary fixture, not a simulation of YouTube's media or Brave ad blocking.
const apiFixture = `
(() => {
  const calls = [];
  let options, ids = [], index = -1, state = -1;
  const notify = () => options.events.onStateChange({ data: state });
  const player = {
    loadPlaylist(list, startIndex) { calls.push(['loadPlaylist', ...list]); ids = list; index = startIndex; state = 1; notify(); },
    playVideo() { calls.push(['play']); state = 1; notify(); },
    pauseVideo() { calls.push(['pause']); state = 2; notify(); },
    nextVideo() { index = (index + 1) % ids.length; state = 1; notify(); },
    previousVideo() { index = Math.max(0, index - 1); notify(); },
    playVideoAt(value) { index = value; state = 1; notify(); },
    seekTo() {}, setLoop() {}, setShuffle() {},
    getPlaylist() { return ids; }, getPlaylistIndex() { return index; },
    getPlayerState() { return state; },
    getVideoData() { return { video_id: ids[index], title: ids.length ? 'Fixture track ' + (index + 1) : '', author: 'Fixture artist' }; },
    getCurrentTime() { return 42; }, getDuration() { return 180; }, destroy() {},
  };
  window.__fixture = { calls, block: () => options.events.onAutoplayBlocked(), fail: () => options.events.onError({ data: 150 }) };
  window.YT = { Player: function(host, config) {
    options = config;
    const iframe = document.createElement('iframe');
    iframe.id = 'fixture-player';
    host.replaceWith(iframe);
    setTimeout(() => options.events.onReady({ target: player }), 0);
    return player;
  }};
  window.onYouTubeIframeAPIReady();
})();
`

async function fakeAPI(page: Page) {
  await page.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: apiFixture }),
  )
}

async function connectAndStart(page: Page) {
  await page
    .getByRole('button', { name: 'Connect player', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Start listening', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Start listening', exact: true })
    .click()
  await expect(
    page.getByText('Fixture track 1', { exact: true }).first(),
  ).toBeVisible()
}

test('mobile UI mounts without errors and fits a narrow viewport', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let youtubeRequests = 0
  await page.route('**/*youtube.com/**', (route) => {
    youtubeRequests++
    return route.abort()
  })
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Connect player', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Good music. Less noise.' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(youtubeRequests).toBe(0)
  expect(errors).toEqual([])
  await page.screenshot({
    path: 'test-results/mobile-room.png',
    fullPage: true,
    scale: 'css',
  })
})

test('connects without autoplay and preserves the iframe through tabs and queue edits', async ({
  page,
}) => {
  await fakeAPI(page)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Connect player', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Start listening', exact: true }),
  ).toBeEnabled()
  expect(
    await page.evaluate(() => Reflect.get(window, '__fixture').calls),
  ).toEqual([])
  await page
    .getByRole('button', { name: 'Start listening', exact: true })
    .click()
  await page
    .locator('#fixture-player')
    .evaluate((element) => element.setAttribute('data-instance', 'original'))
  await page.getByRole('tab', { name: 'Phone test' }).click()
  await expect(
    page.getByRole('heading', { name: 'Take it for a walk.' }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'Your queue' }).click()
  await page.getByRole('button', { name: 'Edit test queue' }).click()
  await page
    .getByLabel('Make it your own')
    .fill('https://youtu.be/jfKfPfyJRdk\n5qap5aO4i9A')
  await page.getByRole('button', { name: 'Save queue' }).click()
  await expect(page.locator('#fixture-player')).toHaveAttribute(
    'data-instance',
    'original',
  )
  expect(
    (await page.evaluate(() => Reflect.get(window, '__fixture').calls)).filter(
      (call: string[]) => call[0] === 'loadPlaylist',
    ),
  ).toHaveLength(1)
  await page.getByRole('button', { name: 'Restart queue', exact: true }).click()
  expect(
    await page.evaluate(() => Reflect.get(window, '__fixture').calls.at(-1)),
  ).toEqual(['loadPlaylist', 'jfKfPfyJRdk', '5qap5aO4i9A'])
  await page.reload()
  await expect(page.locator('.track-row')).toHaveCount(2)
  await expect(
    page.getByRole('button', { name: 'Connect player', exact: true }),
  ).toBeVisible()
})

test('validates links, surfaces blocked playback, and exports a diagnostic report', async ({
  page,
}) => {
  await fakeAPI(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit test queue' }).click()
  await page
    .getByLabel('Make it your own')
    .fill('https://example.com/watch?v=jfKfPfyJRdk')
  await page.getByRole('button', { name: 'Save queue' }).click()
  await expect(page.getByRole('alert')).toContainText('Line 1')
  await page.getByRole('button', { name: 'Edit test queue' }).click()
  await connectAndStart(page)
  await page.evaluate(() => Reflect.get(window, '__fixture').block())
  await expect(page.getByRole('status')).toContainText('Playback was blocked')
  await page.evaluate(() => Reflect.get(window, '__fixture').fail())
  await expect(page.getByRole('alert').last()).toContainText('embedded player')
  await page.getByRole('tab', { name: 'Phone test' }).click()
  await page
    .getByLabel('Playback continues in another app', { exact: true })
    .check()
  await page
    .getByLabel('Your setup & notes')
    .fill('Android test fixture; real playback not verified.')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export test report' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  const report = JSON.parse(await readFile(path!, 'utf8'))
  expect(report.checks[0].observed).toBe(true)
  expect(report.environment.notes).toContain('real playback not verified')
  expect(
    report.events.some(
      (event: { type: string }) => event.type === 'autoplay-blocked',
    ),
  ).toBe(true)
})

test('handles connection failure with a retryable message', async ({
  page,
}) => {
  await page.route('https://www.youtube.com/iframe_api', (route) =>
    route.abort(),
  )
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Connect player', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'YouTube could not connect',
  )
  await expect(
    page.getByRole('button', { name: 'Connect player', exact: true }),
  ).toBeEnabled()
})

test('opens the phone checklist from its callout and exposes mobile queue options', async ({
  page,
}) => {
  await fakeAPI(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'Open the phone checklist' }).click()
  await expect(page.getByRole('tab', { name: 'Phone test' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.getByRole('tab', { name: 'Your queue' }).click()
  await connectAndStart(page)
  await page
    .getByRole('button', { name: 'Repeat playlist', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Repeat playlist', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Shuffle playlist', exact: true }),
  ).toBeVisible()
})

test('has valid install assets and shows a cached offline fallback', async ({
  page,
  context,
  request,
}) => {
  const manifestResponse = await request.get('/manifest.webmanifest')
  const manifest = await manifestResponse.json()
  expect(manifest.display).toBe('standalone')
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
  }
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true)
  expect(
    await page.evaluate(
      async () => (await caches.match('/offline.html'))?.status,
    ),
  ).toBe(200)
  await context.setOffline(true)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'A quiet moment.' }),
  ).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('link', { name: 'Try again' }).click()
  await expect(
    page.getByRole('button', { name: 'Connect player', exact: true }),
  ).toBeVisible()
})
