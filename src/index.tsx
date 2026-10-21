import { Hono } from 'hono'
import { authHandler } from '@hono/auth-js'
import { configureAuth, requireOwner, type AppEnv } from './auth/middleware'
import { AuthErrorPage } from './auth/error-page'
import { renderer } from './renderer'
import { library } from './library/routes'

const app = new Hono<AppEnv>()

app.use('*', async (c, next) => {
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Cache-Control', 'private, no-store')
  await next()
  // Auth.js also sets cache headers; enforce no-store on its responses.
  c.header('Cache-Control', 'private, no-store')
})

app.use('*', configureAuth)
app.get('/api/auth/error', (c) => {
  const denied = c.req.query('error') === 'AccessDenied'
  return c.html(<AuthErrorPage denied={denied} />, denied ? 403 : 400)
})
app.use('/api/auth/*', authHandler())
app.use('*', requireOwner)
app.route('/api/playlists', library)
app.use(renderer)

app.get('/', (c) => {
  return c.render(
    <>
      <a href="#listening-room" class="skip-link">
        Skip to listening room
      </a>
      <div class="site-shell">
        <header class="site-header">
          <a class="wordmark" href="/" aria-label="Side A home">
            <span class="brand-icon" aria-hidden="true">
              a
            </span>
            side a<span class="brand-dot">.</span>
          </a>
          <span class="header-caption">YOUR OWN LITTLE LISTENING ROOM</span>
          <span class="prototype-tag">
            <span class="status-dot" /> PLAYBACK LAB{' '}
            <span class="version">01</span>
          </span>
          <a class="text-link" href="/api/auth/signout">
            Sign out
          </a>
        </header>
        <main id="listening-room">
          <section class="hero" aria-labelledby="hero-title">
            <div>
              <p class="eyebrow">
                <span class="tiny-line" /> LESS SCROLLING. MORE LISTENING.
              </p>
              <h1 id="hero-title">
                Good music.
                <br />
                <em>Less noise.</em>
              </h1>
              <p class="hero-description">
                A small space for the tracks you keep coming back to.
                <br class="desktop-break" /> Pick a queue. Press play. Make
                yourself at home.
              </p>
            </div>
            <div class="record-art" aria-hidden="true">
              <div class="record-grooves">
                <div class="record-label">
                  <span>SIDE A</span>
                  <strong>33⅓</strong>
                  <small>JUST PRESS PLAY</small>
                </div>
              </div>
              <span class="record-caption">
                MADE FOR YOUR EVERYDAY ROTATION
              </span>
            </div>
          </section>
          <div class="workspace">
            <aside
              id="video-panel"
              class="player-panel is-compact"
              aria-labelledby="player-heading"
            >
              <div class="section-heading">
                <span class="eyebrow" id="player-heading">
                  ON THE DECK
                </span>
                <span class="live-badge">YOUTUBE PLAYER</span>
              </div>
              <div id="player-stage" class="player-stage">
                <div class="player-placeholder">
                  <span class="placeholder-disc" aria-hidden="true">
                    ♪
                  </span>
                  <strong>Your next favorite moment.</strong>
                  <span>Connect the player to get started.</span>
                </div>
              </div>
              <p class="player-caption">
                Your music, played by YouTube. Use the music bar below to listen
                and expand the video whenever you like.
              </p>
              <div class="brave-note">
                <span class="note-symbol" aria-hidden="true">
                  ↗
                </span>
                <div>
                  <strong>A little better in Brave.</strong>
                  <p>
                    Ad blocking is handled by your browser’s Shields. Background
                    playback is what we’re testing.
                  </p>
                </div>
              </div>
              <div class="session-card">
                <span class="eyebrow">THE FIRST SPIN</span>
                <h2>Let the music follow you.</h2>
                <p>
                  Start the queue, switch apps, then lock your screen. Does the
                  next track keep playing?
                </p>
                <a href="#room-panel" id="open-checklist" class="text-link">
                  Open the phone checklist <span aria-hidden="true">↓</span>
                </a>
              </div>
            </aside>
            <div id="app">
              <p class="loading-message">Getting your listening room ready…</p>
            </div>
          </div>
          <noscript>
            <p class="noscript">
              Enable JavaScript to use the YouTube player and queue. This
              prototype does not require an API key.
            </p>
          </noscript>
        </main>
        <footer class="site-footer">
          <span>SMALL BY DESIGN. YOURS TO ENJOY.</span>
          <span>
            Independent playback prototype · Not affiliated with YouTube
          </span>
        </footer>
      </div>
    </>,
  )
})

export default app
