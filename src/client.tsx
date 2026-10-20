/// <reference lib="dom" />
/** @jsxImportSource hono/jsx/dom */
import { render } from 'hono/jsx/dom'
import { PlaybackController } from './player/youtube-player'
import { loadYouTubeAPI } from './player/youtube-api'
import { App } from './ui/app'

const controller = new PlaybackController()
let connecting: Promise<void> | undefined

function connectPlayer(): Promise<void> {
  if (controller.snapshot().ready) return Promise.resolve()
  if (connecting) return connecting
  connecting = (async () => {
    controller.diagnostics.record('connect-requested')
    const api = await loadYouTubeAPI()
    const stage = document.getElementById('player-stage')!
    const host = document.createElement('div')
    stage.replaceChildren(host)
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        player.destroy()
        reject(
          new Error(
            'The embedded player did not become ready. Check your connection, then retry.',
          ),
        )
      }, 20000)
      const player = new api.Player(host, {
        width: '100%',
        height: '100%',
        playerVars: { origin: location.origin, playsinline: 1, autoplay: 0 },
        events: {
          onReady: ({ target }) => {
            window.clearTimeout(timeout)
            stage
              .querySelector('iframe')
              ?.setAttribute('title', 'YouTube music player')
            controller.attach(target)
            resolve()
          },
          onStateChange: ({ data }) => controller.stateChanged(data),
          onError: ({ data }) => controller.failed(data),
          onAutoplayBlocked: () => controller.autoplayBlocked(),
        },
      })
    })
  })()
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'The player could not connect.'
      controller.diagnostics.record('connection-error', { message })
      controller.connectionFailed(message)
      throw error
    })
    .finally(() => {
      connecting = undefined
    })
  return connecting
}

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
