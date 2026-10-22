/// <reference lib="dom" />
import type { PlaybackController } from './youtube-player'
import { loadYouTubeAPI } from './youtube-api'

// Shared connection boundary for the private room and anonymous snapshot player.
export function createPlayerConnection(controller: PlaybackController) {
  let connecting: Promise<void> | undefined
  return function connectPlayer(): Promise<void> {
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
          error instanceof Error
            ? error.message
            : 'The player could not connect.'
        controller.diagnostics.record('connection-error', { message })
        controller.connectionFailed(message)
        throw error
      })
      .finally(() => {
        connecting = undefined
      })
    return connecting
  }
}
