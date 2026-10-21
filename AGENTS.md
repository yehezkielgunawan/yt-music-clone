# Yehezgun-music: agent notes

## Scope and verification

- This is a private, Google-authenticated YouTube playback and saved-library MVP. Named playlists use D1; catalog search, YouTube-account sync, external playlist import, and offline media are not implemented. See `README.md` for the current acceptance gate.
- `src/library/` owns playlist validation, owner-scoped persistence/API, and client editor state. Keep saved playlists, drafts, pending queues, and active playback snapshots separate. Saving/loading/deleting a playlist must not interrupt playback; Start/Restart applies pending queues. D1 writes/deletes use revision checks; never silently overwrite a conflict.
- Brave Shields supplies ad blocking. Browser tests mock the YouTube API; they cannot prove ad-free or Android background playback. Validate a Brave tab and installed PWA separately on a real phone: 20+ minutes locked, at least three track transitions.

## Commands and test prerequisites

- Use Node.js 24 and the pinned `pnpm@12.4.1`; install with `pnpm install --frozen-lockfile`. `pnpm-workspace.yaml` configures dependency build permissions, not multiple app packages.
- Match CI with `pnpm format:check && pnpm typecheck && pnpm test && pnpm build`. `pnpm test` runs only `tests/unit/**/*.test.ts`; there is no separate lint script.
- Focus a unit test: `pnpm exec vitest run tests/unit/youtube-player.test.ts -t 'does not autoplay'`.
- Browser tests require a fresh build: `pnpm build && pnpm test:e2e`. Playwright starts its own production preview on port **4173** and refuses to reuse an existing server; free that port first.
- Run `pnpm db:migrate` before local development/manual preview. Browser tests migrate their own temporary local D1 storage; never point them at development or production data.
- Focus a browser test after building: `pnpm exec playwright test tests/browser/playback.spec.ts --grep 'offline'`.
- Playwright prefers the standard macOS Brave executable; otherwise run `pnpm exec playwright install chromium`. `PLAYWRIGHT_EXECUTABLE_PATH` overrides the browser for tests only. Its preview launcher temporarily supplies test-only bindings in the built `.dev.vars` and restores them on exit; authentication uses real encrypted test cookies, with no app bypass.
- To inspect PWA behavior manually: configure `AUTH_URL=http://localhost:4173` and the matching Google callback, then `pnpm build && pnpm exec vite preview --host localhost --port 4173 --strictPort`. `pnpm dev` intentionally does not register the service worker. Phone installation requires HTTPS, not a plain HTTP LAN URL.

## Rendering and playback boundaries

- `src/index.tsx` serves the Hono shell; `src/renderer.tsx` loads CSS/client entries through `Link`, `Script`, and `ViteClient` from `vite-ssr-components/hono`. Keep those component names for Vite entry discovery.
- Use Hono JSX, not React. The root JSX runtime is `hono/jsx`; client TSX files use `/** @jsxImportSource hono/jsx/dom */`. Browser files add `/// <reference lib="dom" />` because the root TS config includes only `ESNext` libraries.
- `src/client.tsx` owns the player lifecycle. `#player-stage` is outside the rerendered `#app` root: keep it mounted when changing views or editing queues.
- `PlaybackController` in `src/player/youtube-player.ts` is the player boundary. Load the whole queue into YouTube; do not call `nextVideo()` on normal `ENDED` events or use timers to advance tracks. The existing timer refreshes foreground UI only.
- Preserve explicit connection/start gestures and autoplay-blocked feedback. Queue edits save locally but apply to the player only after **Restart queue**; they must not interrupt current playback.
- Preserve the visible player and `strict-origin-when-cross-origin` referrer policy. Derive the player origin from `location.origin`, not the production hostname; suppressing the referrer can cause YouTube error 153.
- Pass string values (`'true'` / `'false'`) for client JSX ARIA states. Hono boolean attributes can produce empty attributes rather than valid ARIA values.
- `src/auth/` owns Auth.js configuration and server-side owner enforcement. Keep `/api/auth/*` public and register it before the private-route gate. Only verified Google identities matching `ALLOWED_GOOGLE_EMAIL` are allowed; session reads must recheck that policy. Keep the React-only Auth.js client entry out of this Hono JSX app.

## PWA and deployment gotchas

- `public/sw.js` precaches public installation assets and the offline fallback only. Never precache `/`, protected HTML, or auth/API responses. It is not a background audio service. Bump its cache version when changing the precache; preserve waiting updates rather than forcing reloads during playback.
- Keep the offline fallback's `new Response(...)` normalization: Cloudflare can redirect `/offline.html` to `/offline`, and returning that cached redirected response directly breaks offline navigation.
- Vite builds both client assets and the Worker. Edit `wrangler.jsonc`, not generated `dist/` or `.wrangler/deploy/` files; Wrangler follows the generated deployment configuration after a build.
- Required runtime bindings are `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_GOOGLE_EMAIL`, and `AUTH_URL`; see `.dev.vars.example` and `README.md`. Use Worker secrets in production. `AUTH_URL` pins the exact origin (no auth path); missing/invalid auth configuration must fail closed. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` authenticate deployment only, via GitHub repository or `production` environment secrets.
- Generate `CloudflareBindings` with `pnpm cf-typegen` after binding changes; `worker-configuration.d.ts` is generated and excluded from formatting.
- Production is `music.yehezgun.com`, configured as a Worker Custom Domain. `.github/workflows/deploy.yml` is manual-only (`workflow_dispatch`); retain that behavior. PRs and pushes to `main` run checks, not deployments.
- Use **`pnpm run deploy`**, not `pnpm deploy` (a pnpm built-in). It publishes for real; validate without publishing using `pnpm build && pnpm exec wrangler deploy --dry-run`. See `README.md` for domain/token setup and manual workflow instructions.
