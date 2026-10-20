# Side A: agent notes

## Scope and verification

- This is a YouTube playback prototype, not the full music app: no catalog search, named playlists, D1, Google-account sync, or offline media yet. See `README.md` for the current acceptance gate.
- Brave Shields supplies ad blocking. Browser tests mock the YouTube API; they cannot prove ad-free or Android background playback. Validate a Brave tab and installed PWA separately on a real phone: 20+ minutes locked, at least three track transitions.

## Commands and test prerequisites

- Use Node.js 24 and the pinned `pnpm@12.4.1`; install with `pnpm install --frozen-lockfile`. `pnpm-workspace.yaml` configures dependency build permissions, not multiple app packages.
- Match CI with `pnpm format:check && pnpm typecheck && pnpm test && pnpm build`. `pnpm test` runs only `tests/unit/**/*.test.ts`; there is no separate lint script.
- Focus a unit test: `pnpm exec vitest run tests/unit/youtube-player.test.ts -t 'does not autoplay'`.
- Browser tests require a fresh build: `pnpm build && pnpm test:e2e`. Playwright starts its own production preview on port **4173** and refuses to reuse an existing server; free that port first.
- Focus a browser test after building: `pnpm exec playwright test tests/browser/playback.spec.ts --grep 'offline'`.
- Playwright prefers the standard macOS Brave executable; otherwise run `pnpm exec playwright install chromium`. `PLAYWRIGHT_EXECUTABLE_PATH` overrides the browser for tests only.
- To inspect PWA behavior manually: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173`. `pnpm dev` intentionally does not register the service worker. Phone installation requires HTTPS, not a plain HTTP LAN URL.

## Rendering and playback boundaries

- `src/index.tsx` serves the Hono shell; `src/renderer.tsx` loads CSS/client entries through `Link`, `Script`, and `ViteClient` from `vite-ssr-components/hono`. Keep those component names for Vite entry discovery.
- Use Hono JSX, not React. The root JSX runtime is `hono/jsx`; client TSX files use `/** @jsxImportSource hono/jsx/dom */`. Browser files add `/// <reference lib="dom" />` because the root TS config includes only `ESNext` libraries.
- `src/client.tsx` owns the player lifecycle. `#player-stage` is outside the rerendered `#app` root: keep it mounted when changing views or editing queues.
- `PlaybackController` in `src/player/youtube-player.ts` is the player boundary. Load the whole queue into YouTube; do not call `nextVideo()` on normal `ENDED` events or use timers to advance tracks. The existing timer refreshes foreground UI only.
- Preserve explicit connection/start gestures and autoplay-blocked feedback. Queue edits save locally but apply to the player only after **Restart queue**; they must not interrupt current playback.
- Preserve the visible player and `strict-origin-when-cross-origin` referrer policy. Derive the player origin from `location.origin`, not the production hostname; suppressing the referrer can cause YouTube error 153.
- Pass string values (`'true'` / `'false'`) for client JSX ARIA states. Hono boolean attributes can produce empty attributes rather than valid ARIA values.

## PWA and deployment gotchas

- `public/sw.js` caches first-party shell assets only. It is not a background audio service. Bump its cache version when changing the precached shell; preserve waiting updates rather than forcing reloads during playback.
- Keep the offline fallback's `new Response(...)` normalization: Cloudflare can redirect `/offline.html` to `/offline`, and returning that cached redirected response directly breaks offline navigation.
- Vite builds both client assets and the Worker. Edit `wrangler.jsonc`, not generated `dist/` or `.wrangler/deploy/` files; Wrangler follows the generated deployment configuration after a build.
- No application runtime secrets are required yet. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` authenticate deployment only, via GitHub repository or `production` environment secrets.
- Production is `music.yehezgun.com`, configured as a Worker Custom Domain. `.github/workflows/deploy.yml` is manual-only (`workflow_dispatch`); retain that behavior. PRs and pushes to `main` run checks, not deployments.
- Use **`pnpm run deploy`**, not `pnpm deploy` (a pnpm built-in). It publishes for real; validate without publishing using `pnpm build && pnpm exec wrangler deploy --dry-run`. See `README.md` for domain/token setup and manual workflow instructions.
