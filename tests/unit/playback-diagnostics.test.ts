import { expect, it } from 'vitest'
import { PlaybackDiagnostics } from '../../src/player/playback-diagnostics'

it('bounds diagnostics and exports detached event data', () => {
  const log = new PlaybackDiagnostics(3)
  for (let i = 0; i < 5; i++) log.record('state', { index: i })
  const events = log.entries()
  expect(events.map((event) => event.detail.index)).toEqual([2, 3, 4])
  events[0].detail.index = 100
  expect(log.entries()[0].detail.index).toBe(2)
  const report = log.report({
    browser: 'test',
    mode: 'browser',
    notes: 'Android test',
  })
  expect(report.events).toHaveLength(3)
  expect(report.environment.browser).toBe('test')
  expect(report.droppedEvents).toBe(2)
})
