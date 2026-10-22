/// <reference lib="dom" />
/** @jsxImportSource hono/jsx/dom */
import { render } from 'hono/jsx/dom'
import { PlaybackController } from './player/youtube-player'
import { createPlayerConnection } from './player/connect-player'
import { App } from './ui/app'

const controller = new PlaybackController()
const connectPlayer = createPlayerConnection(controller)

controller.diagnostics.record('session-opened', {
  mode: matchMedia('(display-mode: standalone)').matches
    ? 'standalone'
    : 'browser',
  online: navigator.onLine,
})

document.addEventListener('visibilitychange', () => {
  controller.diagnostics.record('visibility', {
    visibility: document.visibilityState,
  })
  if (document.visibilityState === 'visible') controller.sync()
})
window.addEventListener('pageshow', (event) => {
  controller.diagnostics.record('pageshow', { persisted: event.persisted })
  controller.sync()
})
window.addEventListener('pagehide', () =>
  controller.diagnostics.record('pagehide'),
)
window.addEventListener('online', () =>
  controller.diagnostics.record('network', { online: true }),
)
window.addEventListener('offline', () =>
  controller.diagnostics.record('network', { online: false }),
)

// Foreground UI refresh only. Background track advancement belongs to the embedded player.
const progressTimer = window.setInterval(() => {
  if (document.visibilityState === 'visible' && controller.snapshot().started)
    controller.sync()
}, 1000)

render(
  <App controller={controller} connectPlayer={connectPlayer} />,
  document.getElementById('app')!,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      controller.diagnostics.record('service-worker', {
        scope: new URL(registration.scope).pathname,
      })
      // Updates wait until all old windows close; never reload the page during playback.
    })
    .catch((error: unknown) => {
      controller.diagnostics.record('service-worker-error', {
        message: error instanceof Error ? error.message : 'Registration failed',
      })
    })
}

if (import.meta.hot)
  import.meta.hot.dispose(() => window.clearInterval(progressTimer))
