// Playwright runs against the built server (pnpm build first), which serves the built public site.
// Local sandboxes with a pre-installed Chromium point E2E_CHROMIUM_EXECUTABLE at it; CI installs the browser pinned
// by @playwright/test instead. Traces are kept on failure; test data is synthetic only.
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env['E2E_CHROMIUM_EXECUTABLE']
const port = Number(process.env['E2E_PORT'] ?? 4310)
const serverEntry = fileURLToPath(new URL('../server/dist/main.js', import.meta.url))

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  // No retries: a test that passes only on a retry is not stable enough to count as evidence.
  retries: 0,
  forbidOnly: Boolean(process.env['CI']),
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node ${JSON.stringify(serverEntry)}`,
    url: `http://127.0.0.1:${port}/`,
    env: { HANDYHUB_ENV: 'ci', PORT: String(port), HOST: '127.0.0.1' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) },
    },
  ],
})
