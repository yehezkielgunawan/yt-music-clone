import { expect } from '@playwright/test'
import { test } from './fixtures'
import { fakeAPI } from '../fixtures/youtube'

test.beforeEach(async ({ page }) => {
  await fakeAPI(page)
  await page.goto('/')
})

test('connects and explicitly starts from the music bar without scrolling to video', async ({
  page,
}) => {
  const bar = page.getByRole('region', { name: 'Playback controls' })
  for (const name of [
    'Previous track',
    'Next track',
    'Shuffle queue',
    'Repeat queue',
  ]) {
    await expect(bar.getByRole('button', { name })).toBeDisabled()
  }
  await expect(
    bar.getByRole('slider', { name: 'Seek playback' }),
  ).toBeDisabled()
  await bar.getByRole('button', { name: 'Connect player', exact: true }).click()
  await expect(
    bar.getByRole('button', { name: 'Start listening', exact: true }),
  ).toBeEnabled()
  expect(
    await page.evaluate(() => Reflect.get(window, '__fixture').calls),
  ).toEqual([])
  await page.locator('#player-stage').evaluate((stage) => {
    stage.scrollIntoView = () => stage.setAttribute('data-scrolled', 'true')
  })
  await bar
    .getByRole('button', { name: 'Start listening', exact: true })
    .click()
  await expect(
    bar.getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible()
  await expect(page.locator('#player-stage')).not.toHaveAttribute(
    'data-scrolled',
    'true',
  )
  expect(
    (await page.evaluate(() => Reflect.get(window, '__fixture').calls)).filter(
      (call: unknown[]) => call[0] === 'loadPlaylist',
    ),
  ).toHaveLength(1)
})

test('controls playback and seeks with the keyboard while paused', async ({
  page,
}) => {
  const bar = page.getByRole('region', { name: 'Playback controls' })
  await bar.getByRole('button', { name: 'Connect player', exact: true }).click()
  await bar
    .getByRole('button', { name: 'Start listening', exact: true })
    .click()
  await bar.getByRole('button', { name: 'Next track' }).click()
  await expect(bar).toContainText('Fixture track 2')
  await bar.getByRole('button', { name: 'Previous track' }).click()
  await expect(bar).toContainText('Fixture track 1')
  await bar.getByRole('button', { name: 'Pause', exact: true }).click()
  const seek = bar.getByRole('slider', { name: 'Seek playback' })
  await seek.focus()
  await seek.press('End')
  await expect(seek).toHaveValue('180')
  await expect(
    bar.getByRole('button', { name: 'Play', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => Reflect.get(window, '__fixture').calls),
  ).toEqual(
    expect.arrayContaining([
      ['next'],
      ['previous'],
      ['pause'],
      ['seek', 180, true],
    ]),
  )
  await bar.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(
    bar.getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible()
})

test('exposes mobile shuffle and repeat and keeps queue controls in sync', async ({
  page,
}) => {
  const bar = page.getByRole('region', { name: 'Playback controls' })
  await bar.getByRole('button', { name: 'Connect player', exact: true }).click()
  await bar
    .getByRole('button', { name: 'Start listening', exact: true })
    .click()
  for (const [barName, queueName] of [
    ['Shuffle queue', 'Shuffle playlist'],
    ['Repeat queue', 'Repeat playlist'],
  ]) {
    const control = bar.getByRole('button', { name: barName })
    await expect(control).toBeVisible()
    await control.click()
    await expect(control).toHaveAttribute('aria-pressed', 'true')
    const queueControl = page.getByRole('button', {
      name: queueName,
      exact: true,
    })
    await expect(queueControl).toHaveAttribute('aria-pressed', 'true')
    await queueControl.click()
    await expect(control).toHaveAttribute('aria-pressed', 'false')
  }
  await page.getByRole('tab', { name: 'Library' }).click()
  await bar.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(
    bar.getByRole('button', { name: 'Play', exact: true }),
  ).toBeVisible()
  await bar.getByRole('button', { name: 'Next track' }).click()
  await expect(bar).toContainText('Fixture track 2')
})

test('previews a scrub without seeking until release and clears it on track changes', async ({
  page,
}) => {
  const bar = page.getByRole('region', { name: 'Playback controls' })
  await bar.getByRole('button', { name: 'Connect player', exact: true }).click()
  await bar
    .getByRole('button', { name: 'Start listening', exact: true })
    .click()
  const seek = bar.getByRole('slider', { name: 'Seek playback' })
  await seek.evaluate((input: HTMLInputElement) => {
    input.value = '90'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(seek).toHaveAttribute('aria-valuetext', '1:30 of 3:00')
  expect(
    (await page.evaluate(() => Reflect.get(window, '__fixture').calls)).filter(
      (call: unknown[]) => call[0] === 'seek',
    ),
  ).toEqual([])
  await seek.dispatchEvent('change')
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, '__fixture').calls.at(-1)),
    )
    .toEqual(['seek', 90, true])
  await expect(seek).toHaveValue('90')
  await seek.evaluate((input: HTMLInputElement) => {
    input.value = '120'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(seek).toHaveValue('120')
  await bar.getByRole('button', { name: 'Next track' }).click()
  await expect(seek).toHaveValue('0')
})

test('retries connection and recovers blocked playback from the bar', async ({
  page,
}) => {
  const bar = page.getByRole('region', { name: 'Playback controls' })
  await page.route(
    'https://www.youtube.com/iframe_api',
    (route) => route.abort(),
    { times: 1 },
  )
  await bar.getByRole('button', { name: 'Connect player', exact: true }).click()
  await expect(bar.getByRole('alert')).toContainText(
    'YouTube could not connect',
  )
  await bar.getByRole('button', { name: 'Connect player', exact: true }).click()
  await bar
    .getByRole('button', { name: 'Start listening', exact: true })
    .click()
  await page.evaluate(() => Reflect.get(window, '__fixture').block())
  await expect(bar.getByRole('status')).toContainText('Playback was blocked')
  await bar.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(
    bar.getByRole('button', { name: 'Pause', exact: true }),
  ).toBeVisible()
  await page.evaluate(() => Reflect.get(window, '__fixture').fail())
  await expect(bar.getByRole('alert')).toContainText('embedded player')
})

for (const width of [320, 393, 820, 1280]) {
  test(`resizes the same video without interrupting playback at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 851 })
    const bar = page.getByRole('region', { name: 'Playback controls' })
    const stage = page.locator('#player-stage')
    const compact = await stage.boundingBox()
    expect(compact!.width).toBeGreaterThanOrEqual(200)
    expect(compact!.height).toBeGreaterThanOrEqual(200)
    await bar
      .getByRole('button', { name: 'Connect player', exact: true })
      .click()
    await bar
      .getByRole('button', { name: 'Start listening', exact: true })
      .click()
    const iframe = await page.locator('#fixture-player').elementHandle()
    const calls = await page.evaluate(
      () => Reflect.get(window, '__fixture').calls,
    )
    await bar.getByRole('button', { name: 'Expand video' }).click()
    await expect(
      bar.getByRole('button', { name: 'Compact video' }),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect
      .poll(async () => (await stage.boundingBox())!.width)
      .toBeGreaterThan(compact!.width)
    await expect(
      bar.getByRole('button', { name: 'Pause', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => Reflect.get(window, '__fixture').calls),
    ).toEqual(calls)
    await bar.getByRole('button', { name: 'Pause', exact: true }).click()
    await bar.getByRole('button', { name: 'Compact video' }).click()
    await expect(
      bar.getByRole('button', { name: 'Expand video' }),
    ).toHaveAttribute('aria-expanded', 'false')
    await expect
      .poll(async () => (await stage.boundingBox())!.width)
      .toBe(compact!.width)
    await expect(
      bar.getByRole('button', { name: 'Play', exact: true }),
    ).toBeVisible()
    expect(
      await iframe!.evaluate(
        (element) => element === document.querySelector('#fixture-player'),
      ),
    ).toBe(true)
    await expect(
      bar.getByRole('slider', { name: 'Seek playback' }),
    ).toHaveValue('42')
    expect(
      await page.evaluate(() => Reflect.get(window, '__fixture').calls),
    ).toEqual([...calls, ['pause']])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    for (const name of [
      'Previous track',
      'Play',
      'Next track',
      'Shuffle queue',
      'Repeat queue',
      'Expand video',
    ]) {
      const bounds = await bar
        .getByRole('button', { name, exact: true })
        .boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    }
    const footer = page.locator('.site-footer')
    await footer.scrollIntoViewIfNeeded()
    const footerBox = await footer.boundingBox()
    const barBox = await bar.boundingBox()
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(barBox!.y)
    await page.screenshot({
      path: `test-results/music-bar-${width}.png`,
      fullPage: true,
      scale: 'css',
    })
  })
}
