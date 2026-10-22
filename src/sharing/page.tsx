import { Link, Script, ViteClient } from 'vite-ssr-components/hono'
import type { PlaylistDraft } from '../library/types'

export function SharedPage({
  playlist,
  unavailable = false,
}: {
  playlist?: PlaylistDraft
  unavailable?: boolean
}) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#111615" />
        <title>
          {playlist
            ? `${playlist.name} — Yehezgun-music`
            : 'Shared playlist — Yehezgun-music'}
        </title>
        <ViteClient />
        <Link href="/src/style.css" rel="stylesheet" />
        {playlist && <Script src="/src/sharing/client.tsx" />}
      </head>
      <body>
        <div class="site-shell">
          <header class="site-header">
            <a class="wordmark" href="/">
              Yehezgun-music<span class="brand-dot">.</span>
            </a>
            <span class="header-caption">A MIX WORTH SHARING</span>
          </header>
          <main class="py-8 space-y-6">
            {playlist ? (
              <>
                <div class="queue-header">
                  <div class="min-w-0 break-words">
                    <p class="eyebrow">SHARED PLAYLIST</p>
                    <h1 class="text-3xl font-bold">{playlist.name}</h1>
                    <p class="muted">
                      {playlist.entries.length} tracks · A fixed snapshot. No
                      sign-in needed.
                    </p>
                  </div>
                </div>
                <div class="workspace">
                  <aside
                    id="video-panel"
                    class="player-panel is-compact"
                    aria-label="YouTube player"
                  >
                    <div id="player-stage" class="player-stage">
                      <div class="player-placeholder">
                        <strong>Make yourself at home.</strong>
                        <span>Connect the player, then start listening.</span>
                      </div>
                    </div>
                    <p class="player-caption">
                      Played by YouTube. Ad blocking and background playback
                      depend on your browser.
                    </p>
                  </aside>
                  <section
                    class="room-panel p-4 space-y-4"
                    aria-label="Shared playlist tracks"
                  >
                    {!playlist.entries.length && (
                      <p>This shared playlist is empty.</p>
                    )}
                    <ol class="space-y-3" id="shared-tracks">
                      {playlist.entries.map((entry, index) => (
                        <li class="rounded-box border border-base-300 p-3 break-words">
                          <button
                            type="button"
                            class="btn btn-ghost w-full justify-start h-auto text-left whitespace-normal"
                            data-track-index={index}
                            disabled
                          >
                            {index + 1}.{' '}
                            {entry.label || entry.title || 'YouTube track'}
                          </button>
                          <p class="text-sm text-base-content/70">
                            {[entry.author, entry.album]
                              .filter(Boolean)
                              .join(' · ') || 'YouTube'}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
                <div id="shared-app" data-playlist={JSON.stringify(playlist)} />
                <noscript>
                  Enable JavaScript to listen. The shared track list is shown
                  above.
                </noscript>
              </>
            ) : (
              <section class="space-y-3">
                <h1 class="text-2xl font-bold">
                  {unavailable
                    ? 'Shared playlist temporarily unavailable'
                    : 'This playlist is no longer available'}
                </h1>
                <p>
                  {unavailable
                    ? 'Please try again shortly.'
                    : 'The link may be invalid or its owner may have disabled sharing.'}
                </p>
              </section>
            )}
          </main>
        </div>
      </body>
    </html>
  )
}
