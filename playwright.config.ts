import { existsSync } from 'node:fs'
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const brave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  (existsSync(brave) ? brave : undefined)

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Pixel 7'],
    browserName: 'chromium',
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/preview-tests.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
