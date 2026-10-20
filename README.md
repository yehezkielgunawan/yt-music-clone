# Side A

A small, mobile-first listening room built with Hono JSX, Vite, Tailwind CSS,
daisyUI, and Cloudflare Workers. The first milestone tests a persistent YouTube
queue in **Brave on Android**, including playback while the phone is locked.

## What works in this milestone

- One persistent, visible YouTube embedded player.
- A three-track sample queue, replaceable with YouTube links or video IDs.
- Play/pause, previous/next, seeking, shuffle, and playlist repeat.
- Queue editing without interrupting playback; **Restart queue** applies edits.
- The saved test queue survives reloads on the same browser origin/device.
- Phone-test checklist and JSON diagnostic export (latest 300 session events).
- Installable PWA, app icons, and an offline fallback.

This is the **playback proof**, not the full catalog/playlist product yet. Search,
multiple named playlists, D1 persistence, account synchronization, and offline
music are not implemented. Titles and artist names appear for the current track
when YouTube supplies them; other rows show video IDs until played.

Brave Shields handles browser-level ad blocking. Side A neither removes ads nor
claims that its embedded player will behave like YouTube's first-party site.
Background playback and automatic track advancement must pass the phone test
below before proceeding to the full app.

## Requirements and local development

- Node.js 24+ and pnpm.
- An internet connection for YouTube playback.

```sh
pnpm install
pnpm dev
```

Open the local address printed by Vite. YouTube is contacted only when you press
**Connect player**. When it is ready, press **Start listening**. This second tap
provides an explicit playback gesture after asynchronous player initialization.

Use **+** beside the queue title to paste one URL or 11-character video ID per
line. The prototype supports up to 50 entries, including duplicates. Saving an
edited queue does not interrupt an already loaded playlist.

### Environment variables

**None are required for the application in this milestone.** Do not create an
`.env` file or a YouTube API key just to run playback. The IFrame Player API does
not require a Data API key.

For a later search milestone, a server-side `YOUTUBE_API_KEY` would be needed.
That integration is not present yet. D1 would be a Worker binding rather than a
browser environment variable. Never expose future secrets through `VITE_*`.

### Production build and local preview

```sh
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4173
```

Service workers are registered in production builds only, so use this preview
to check caching and offline behavior. The dev server intentionally does not
register the worker.

## Test on your Android phone

For the actual installed-app test, use an **HTTPS deployment**. Opening a LAN
address such as `http://192.168.x.x` is not a substitute: it is normally not a
secure context, so service workers and installation may be unavailable.

The existing deploy command builds and publishes to Cloudflare:

```sh
pnpm run deploy
```

You must authenticate Wrangler with your Cloudflare account first. No account
credentials belong in this repository. Deployment has not been performed by the
coding agent.

1. Open the deployed HTTPS address **in Brave**, with Shields enabled. Record
   your Brave version and Shields setting.
2. Enable Brave's background video/audio playback setting. Its exact name and
   location can vary by version; check **Settings → Media → Background play**.
3. Press **Connect player**, then **Start listening**. Keep the embedded player
   unobstructed while foregrounded. Start playback before locking the phone.
4. Turn on **Repeat** so the sample queue can continue beyond its three tracks.
   Prefer short, finite videos rather than live streams for transition testing.
5. Switch to another app and verify the current track continues.
6. Lock the phone for at least 20 minutes. Verify **at least three track
   transitions**, not just continued playback of the first track.
7. Test any available lock-screen/headphone controls. Return to Side A and verify
   its displayed track matches what is playing.
8. Open **Phone test**, mark only what you observed, record phone/Android/Brave
   versions, Shields configuration, battery settings and interruptions, then
   export the test report.
9. Install from Side A's **Install** button or Brave's **⋮ → Add to Home screen /
   Install app**, and repeat as a separate test. Confirm the installed app is
   hosted by Brave rather than another browser. Use a fresh report/session for
   each run.

**Acceptance gate:** regular-tab and installed-PWA behavior must be recorded
separately. A consistent failure to advance tracks with the screen locked blocks
the full-app milestone. JavaScript logs may be delayed or absent while the
browser is suspended, so use your actual listening observations as well.

The service worker caches first-party application assets, not YouTube media. It
is **not** an always-running audio service. Closing the session, force-stopping
Brave, or Android terminating the browser can stop playback. Do not use wake-lock
or silent-audio tricks to conceal those limits.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

Unit tests cover URL validation, queue ordering and duplicates, bounded
diagnostics, explicit-start behavior, and the player API boundary. Browser tests
run against the production preview and verify the mobile UI, persistent iframe,
queue edits, retryable failures, diagnostic downloads, installation assets, and
offline fallback.

Browser tests use a **controlled YouTube API fixture**, not actual video media.
Passing them does not establish ad blocking or Android background playback.

The Playwright configuration uses the standard macOS Brave executable when
available. Otherwise, install Playwright Chromium with
`pnpm exec playwright install chromium`. An optional **test-tooling-only**
`PLAYWRIGHT_EXECUTABLE_PATH` can select another Chromium-family executable. It is
not an application environment variable or a requirement for deployment.

## Project layout

```text
src/
  index.tsx                     Hono route and server-rendered shell
  renderer.tsx                  HTML metadata and Vite asset entries
  client.tsx                    Persistent player lifecycle and browser events
  player/
    youtube-api.ts              Lazy API loading with timeout and retry
    youtube-player.ts           Player adapter and observable playback state
    queue.ts                    YouTube input validation and sample queue
    playback-diagnostics.ts     Bounded, local session event log
  ui/
    app.tsx                     Queue editor, controls, checklist, and reports
    icon.tsx                    Small inline SVG icon set
  style.css                     Responsive listening-room styling
public/
  manifest.webmanifest          Install metadata
  sw.js                         First-party cache and offline navigation fallback
  offline.html                  Connection-required screen
  icons/                        SVG, 192px PNG, and maskable 512px PNG
tests/
  unit/                         Pure behavior and player-boundary tests
  browser/                      Production-browser integration tests
```

To regenerate the dependency-free PNG icons:

```sh
python3 scripts/generate-icons.py
```

Queue IDs are stored in localStorage. Diagnostics, checklist answers, and notes
stay in memory until you download a report; nothing is uploaded to our Worker.
Reports include your user agent, selected video IDs, notes, and player events.
Connecting/playing communicates with YouTube and is subject to its own data
handling. There is no custom login or Google-account access in this prototype.

Updates install in the background and wait for old app windows to close; Side A
does not automatically reload during playback. Change the service worker cache
version when changing its precached shell. The YouTube origin referrer is kept
using `strict-origin-when-cross-origin` to avoid player identification error 153.
