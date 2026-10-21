import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { preview } from 'vite'
import testEnv from '../tests/fixtures/auth-env.json' with { type: 'json' }

// Cloudflare preview reads the build's copied .dev.vars, not just process.env.
// Isolate browser tests from real OAuth credentials without adding an app bypass.
const varsPath = new URL('../dist/yt_music_clone/.dev.vars', import.meta.url)
const previous = existsSync(varsPath) ? readFileSync(varsPath) : undefined
const databasePath = mkdtempSync(join(tmpdir(), 'side-a-browser-tests-'))
process.env.SIDE_A_TEST_STORAGE = databasePath
writeFileSync(
  varsPath,
  Object.entries(testEnv)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n'),
)
Object.assign(process.env, testEnv)
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'

let restored = false
function restore() {
  if (restored) return
  restored = true
  if (previous) writeFileSync(varsPath, previous)
  else unlinkSync(varsPath)
  rmSync(databasePath, { recursive: true, force: true })
}
process.on('exit', restore)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    restore()
    process.exit(0)
  })
}

try {
  execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--persist-to',
      databasePath,
      '--config',
      'wrangler.jsonc',
    ],
    { stdio: 'inherit' },
  )
  const server = await preview({
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  })
  server.printUrls()
} catch (error) {
  restore()
  throw error
}
