/// <reference lib="dom" />
import type { YouTubePlayer } from './youtube-player'

interface PlayerOptions {
  width: string
  height: string
  playerVars: { origin: string; playsinline: number; autoplay: number }
  events: {
    onReady: (event: { target: YouTubePlayer }) => void
    onStateChange: (event: { data: number }) => void
    onError: (event: { data: number }) => void
    onAutoplayBlocked: () => void
  }
}

interface YouTubeAPI {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeAPI
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YouTubeAPI> | undefined

export function loadYouTubeAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YouTubeAPI>((resolve, reject) => {
    const script = document.createElement('script')
    const previousCallback = window.onYouTubeIframeAPIReady
    const cleanup = () => {
      window.clearTimeout(timeout)
      window.onYouTubeIframeAPIReady = previousCallback
    }
    const fail = () => {
      cleanup()
      script.remove()
      apiPromise = undefined
      reject(
        new Error(
          'YouTube could not connect. Check your connection and Brave settings, then retry.',
        ),
      )
    }
    const timeout = window.setTimeout(fail, 15000)
    window.onYouTubeIframeAPIReady = () => {
      cleanup()
      if (window.YT?.Player) resolve(window.YT)
      else fail()
      previousCallback?.()
    }
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = fail
    document.head.appendChild(script)
  })
  return apiPromise
}
