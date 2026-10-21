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
- Required Google sign-in through Auth.js, restricted to one configured owner.
- Encrypted cookie sessions, sign-out, and server-side owner checks.
- A private D1-backed library of named playlists, available across devices.
- Optional custom track labels, ordered duplicates, and explicit save/discard.
- Individual YouTube and YouTube Music track links; no external playlist import.

This is a **private playback and saved-library MVP**. Search, automatic metadata
retrieval, YouTube-account synchronization, external playlist import, and offline
music are not implemented. Custom labels take precedence in the queue; without a
label, the current track uses YouTube metadata when available and other rows show
video IDs. Saved playlists appear on another signed-in device after refreshing
the library; playback state does not synchronize between devices.

Brave Shields handles browser-level ad blocking. Side A neither removes ads nor
claims that its embedded player will behave like YouTube's first-party site.
Background playback and automatic track advancement must pass the phone test
below before proceeding to the full app.

## Requirements and local development

- Node.js 24 and the pinned pnpm version (`12.4.1`).
- Google OAuth credentials and the authentication configuration below.
- An internet connection for YouTube playback.

```sh
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
# Fill in .dev.vars as described below before starting the server.
pnpm db:migrate
pnpm dev --host localhost --port 5173 --strictPort
```

Open **http://localhost:5173** and sign in with your allowed Google account.
YouTube is contacted only when you press
**Connect player**. When it is ready, press **Start listening**. This second tap
provides an explicit playback gesture after asynchronous player initialization.

Use **+** beside the queue title to paste one URL or 11-character video ID per
line. The prototype supports up to 50 entries, including duplicates. Saving an
edited queue does not interrupt an already loaded playlist.

### Environment variables

Authentication now requires these **server-side Worker bindings**:

| Variable               | Value / how to get it                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| `AUTH_SECRET`          | Generate with `openssl rand -base64 32`; use a separate value for production. |
| `GOOGLE_CLIENT_ID`     | The client ID of a Google OAuth **Web application**, created below.           |
| `GOOGLE_CLIENT_SECRET` | The client secret from the same Google OAuth client.                          |
| `ALLOWED_GOOGLE_EMAIL` | Your full, verified Google account email. Only this exact address is allowed. |
| `AUTH_URL`             | `http://localhost:5173` locally; `https://music.yehezgun.com` in production.  |

`AUTH_URL` is an origin only: do not append `/api/auth`, query parameters, or a
callback path. Hostname and port must match the URL you open. Plain HTTP is
accepted only for loopback development. The auth secret must be at least 32
characters; use the random generation command rather than choosing a password.

Use the ignored `.dev.vars` file locally. If you already use `.env`, you can put
these values there instead; when `.dev.vars` exists, Wrangler ignores `.env`.
Never put credentials in `VITE_*`, source code, or `wrangler.jsonc`.
Missing or invalid authentication configuration returns a closed **503** response.

No YouTube Data API key is needed. D1 stores the saved library; authentication
and the local playback queue can still operate if library storage is unavailable.
Google sign-in requests only `openid email profile`; it does not import your
YouTube library. A future search milestone would need a server-side
`YOUTUBE_API_KEY`. Library playlists belong to Side A and do not access your
YouTube account's playlists. Your pending queue and active playback are local to
each device.

### Using the saved library

Open **Library**, then **New playlist**, or choose **Save current queue as
playlist** to copy the editable/pending queue into a new playlist draft. Import is
explicit; your old browser-local queue is never uploaded automatically.

- Names are required, up to 100 characters. Empty playlists can be saved.
- Paste one individual YouTube or YouTube Music track URL or video ID per line,
  then **Add tracks**. Up to 50 entries, including duplicate videos.
- A track URL with `v` and `list` saves only that track; playlist-only URLs are
  rejected. Sharing parameters do not affect the saved video ID.
- Optional custom labels are up to 200 characters. Each duplicate entry has its
  own label and position. Move tracks with the Up/Down buttons.
- **Save changes** writes the whole playlist. **Discard changes** restores the
  last saved version. Leaving a dirty draft asks before discarding it.
- **Load into queue** copies the saved version into this device's pending queue.
  Open **Your queue**, then **Start listening / Restart queue** to apply it.
  Editing, saving, loading, or deleting a playlist never restarts current playback.
- **Refresh library** retrieves saves from other devices. A stale save or delete
  is rejected, preserving your draft. Choose **Reload latest** (confirming draft
  loss) or **Save as new playlist** to keep your version separately.
- Network/storage failures retain the draft in memory for retry. Unadded text in
  Track links must be added or cleared before saving. Offline edits are not queued
  for automatic synchronization. Drafts do not survive closing or reloading the page.
- An expired session offers sign-in in another tab, so the existing tab can keep
  its draft and playback. Return and retry once signed in.

The pending queue (including labels) survives reloads in localStorage. Existing
v1 queues are read as a migration fallback and left intact. During shuffled
playback, YouTube may not distinguish identical-video occurrences; Side A falls
back to YouTube metadata or video IDs if it cannot safely identify which custom
label applies. All occurrence-specific labels remain preserved in the library.

### Library database setup

`wrangler.jsonc` declares the `DB` D1 binding named **side-a-library**. Local
development needs no remote database ID: `pnpm db:migrate` applies the checked-in
SQL migrations to local storage. Apply local migrations before using `pnpm dev`
or a manual production preview. Local library data is separate from production.

Before the first production deployment, provision the database yourself:

```sh
pnpm exec wrangler d1 create side-a-library
```

Copy the returned `database_id` into the existing `d1_databases[0]` entry in
`wrangler.jsonc`. The checked-in configuration intentionally omits a fabricated
production ID. Then run `pnpm cf-typegen`. Provisioning and production deployment
are separate actions; development and browser tests do not create remote resources.

The manual deployment workflow and `pnpm run deploy` apply pending remote
migrations **before** publishing the Worker. Their Cloudflare API token therefore
also needs account-scoped **D1 Edit** permission. Migrations explicitly use the
source `wrangler.jsonc`; publishing continues to use Vite's generated deployment
configuration. Migration failure stops deployment. The initial migration only
adds the library table/index, so it is compatible with the previous Worker.

To apply production migrations separately when preparing a release:

```sh
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.jsonc
```

This command changes the production database. It is not a dry run. Database IDs
are configuration, not secrets. Owner identity is derived from the verified Google
subject on the server; changing the allowed account does not transfer its library.

### Create the Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/), then select or
   create a project.
2. Open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**).
   Configure the app name, support email, and developer contact under **Branding**.
3. Under **Audience**, use **External** for a personal Gmail account. While the app
   is in **Testing**, add your Google account as a test user.
4. Under **Clients**, create an OAuth client with type **Web application**.
5. Add these **Authorized redirect URIs** exactly:

   ```text
   http://localhost:5173/api/auth/callback/google
   https://music.yehezgun.com/api/auth/callback/google
   ```

6. Copy its client ID and client secret into your local configuration. Set
   `ALLOWED_GOOGLE_EMAIL` to the Google account you intend to use.

For real Google sign-in in the production preview, also register
`http://localhost:4173/api/auth/callback/google`, set `AUTH_URL` to
`http://localhost:4173`, rebuild, and open the preview using **localhost**.
`localhost` and `127.0.0.1` are different origins and need separate callback
registrations if you choose to use both.

The app uses seven-day encrypted, HTTP-only cookie sessions. HTTPS uses secure
cookies. Google verification and the email allowlist are enforced at sign-in;
the identity and current allowlist are checked again on protected requests.
Changing the allowed email blocks old sessions on their next request. Sign-out
uses an Auth.js confirmation page followed by a CSRF-protected POST; it removes
this browser's session and navigates away from the player. Already-running
playback is not periodically interrupted by a background session-check timer.

### Production build and local preview

```sh
pnpm build
pnpm exec vite preview --host localhost --port 4173 --strictPort
```

Use the preview-specific `AUTH_URL` and Google redirect URI described above;
rebuild after changing local bindings because the build copies them for preview.
Service workers are registered in production builds only, so use this preview
to check caching and offline behavior. The dev server intentionally does not
register the worker.

## GitHub Actions and deployment

The production hostname is **https://music.yehezgun.com**. Wrangler configures it
as a Worker Custom Domain, so Cloudflare manages its DNS record and certificate.
The `yehezgun.com` zone must be active in the same Cloudflare account as the
Worker. Check for an existing `music` DNS record before the first deployment;
an existing CNAME prevents attaching the Custom Domain. Do not delete an existing
record until you have confirmed what it serves.

### Pull-request checks

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:

1. Install the pinned pnpm version using the frozen lockfile on Node.js 24.
2. Check formatting and TypeScript.
3. Run unit tests with `pnpm test`.
4. Build the application.

These checks need no Cloudflare credentials. Browser tests remain available
locally with `pnpm build && pnpm test:e2e`. If you enable branch protection,
select **Unit tests and build** as the required check.

### One-time deployment secret setup

Add these under GitHub **Settings → Secrets and variables → Actions**, or as
secrets in the **production** environment under **Settings → Environments**:

| Secret                  | Value                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | A Cloudflare API token allowed to deploy this Worker and configure its Custom Domain |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID containing the Worker and `yehezgun.com` zone              |

Start with Cloudflare's **Edit Cloudflare Workers** token template and scope it
to your account and the `yehezgun.com` zone. Keep the Workers script deployment
permissions and the zone's Workers Routes write permission needed to attach the
Custom Domain. Use Cloudflare's current token-template defaults for any required
supporting permissions. Never put the token in source, Wrangler config, or a
`VITE_*` variable.

### Production authentication configuration

Set all five application bindings from the table above on the **yt-music-clone**
Worker in Cloudflare **Workers & Pages → Settings → Variables and Secrets**.
Use the **Secret** type (including for the owner email and origin, as declared by
this project's required-secret configuration). Production `AUTH_URL` must be
`https://music.yehezgun.com`. Generate a fresh production `AUTH_SECRET`; do not
reuse the public credentials in `tests/fixtures/auth-env.json`.

Alternatively, set each value at Wrangler's interactive prompt:

```sh
pnpm exec wrangler secret put AUTH_SECRET
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put ALLOWED_GOOGLE_EMAIL
pnpm exec wrangler secret put AUTH_URL
```

These commands change the live Worker and deploy a new version immediately.
Run them yourself when ready to configure production. Application bindings live
on the Worker; adding them only as GitHub Actions secrets does not provide them
to the running application. The two `CLOUDFLARE_*` GitHub secrets still serve only
to authenticate deployment. The manual deployment workflow remains unchanged.

### Manual production deployment

`.github/workflows/deploy.yml` has **only** a `workflow_dispatch` trigger. Merging
a PR or pushing a commit does not deploy the application.

1. Push the commits and merge the workflow files into the repository's default
   branch so GitHub exposes the manual workflow.
2. Add the two secrets above.
3. Open **Actions → Deploy to Cloudflare → Run workflow**.
4. Select the branch to deploy (`main` for the normal production release) and run
   it. The workflow checks out that selected revision, repeats formatting,
   type checks, unit tests, and the build, then deploys with the locked Wrangler
   dependency. Production deploy jobs are serialized instead of cancelling an
   in-flight deployment.
5. Open **https://music.yehezgun.com** after deployment and certificate activation.

The workflow uses the GitHub environment named `production`. You can optionally
configure its deployment branch rules or required reviewers in GitHub. No such
remote settings are created by these repository changes. If Cloudflare Workers
Builds is already connected to this repository, disable its automatic builds if
you want _all_ production deployments to remain manual.

For an authenticated local deployment, the existing command still works:

```sh
pnpm run deploy
```

Configure the five application bindings before deploying the authenticated
version. Builds and unit tests do not need real Google credentials; a build may
warn about missing local secrets, but the deployed application must have them.
Repository changes and dry-run validation do not publish the Worker or create
its DNS record.

## Test on your Android phone

For the actual installed-app test, use an **HTTPS deployment**. Opening a LAN
address such as `http://192.168.x.x` is not a substitute: it is normally not a
secure context, so service workers and installation may be unavailable.

Use the manual deployment workflow above, or authenticate Wrangler locally
before running `pnpm run deploy`. Deployment has not been performed by the
coding agent.

1. Open the deployed HTTPS address **in Brave**, with Shields enabled. Record
   your Brave version and Shields setting.
2. Enable Brave's background video/audio playback setting. Its exact name and
   location can vary by version; check **Settings → Media → Background play**.
3. Sign in with your allowed Google account. Press **Connect player**, then
   **Start listening**. Keep the embedded player
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
diagnostics, explicit-start behavior, the player API boundary, Google owner
policy, encrypted sessions, OAuth initiation, CSRF-protected logout, and public-only
service-worker caching. Browser tests
run against the production preview and verify the mobile UI, persistent iframe,
queue edits, retryable failures, diagnostic downloads, installation assets, and
offline fallback.

Browser tests use a **controlled YouTube API fixture**, not actual video media.
Passing them does not establish ad blocking or Android background playback.
Authentication tests use real Auth.js encryption with public, test-only credentials
and session cookies. `scripts/preview-tests.mjs` temporarily substitutes the built
preview's `.dev.vars` and restores it on normal exit; it does not change your
source `.env` or `.dev.vars`. There is no production authentication bypass.
These tests do not establish a successful real Google OAuth callback. After setup,
manually check owner sign-in, denial of another account, sign-out, reload, and
installed-PWA sign-in on the deployed HTTPS origin.

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
  auth/                         Google configuration, owner middleware, and retry page
  library/                      Playlist contracts, validation, D1 repository, API, client state
  client.tsx                    Persistent player lifecycle and browser events
  player/
    youtube-api.ts              Lazy API loading with timeout and retry
    youtube-player.ts           Player adapter and observable playback state
    queue.ts                    YouTube input validation and sample queue
    queue-storage.ts            Labeled pending queues and v1 storage migration
    playback-diagnostics.ts     Bounded, local session event log
  ui/
    app.tsx                     Queue editor, controls, checklist, and reports
    library.tsx                 Named playlist list and editor
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

Pending queue entries and labels are stored in localStorage. Saving a library
playlist uploads its name, ordered video IDs, entry IDs, and custom labels to the
Worker, which stores them in D1 under your verified Google identity. Diagnostics,
checklist answers, and notes stay in memory until you download a report; they are
not uploaded to the Worker.
Reports include your user agent, selected video IDs, notes, and player events.
Connecting/playing communicates with YouTube and is subject to its own data
handling. Google sign-in communicates with Google for authentication; the Worker
processes your basic identity and sets an encrypted session cookie. Side A does
not access your YouTube account's music data.

Only public installation assets and the offline fallback are precached; protected
HTML, library API, and authentication responses are never cached. The v2 service worker deletes
legacy shell caches on activation. After updating from the unauthenticated
prototype, close all Side A windows so the waiting worker can activate.

Updates install in the background and wait for old app windows to close; Side A
does not automatically reload during playback. Change the service worker cache
version when changing its precached shell. The YouTube origin referrer is kept
using `strict-origin-when-cross-origin` to avoid player identification error 153.
