// Playwright runs against the built server (pnpm build first), which serves the built public site, and against the
// built component gallery of @handyhub/ui (TSK-0018), served by `vite preview` on its own port.
// Local sandboxes with a pre-installed Chromium point E2E_CHROMIUM_EXECUTABLE at it; CI installs the browser pinned
// by @playwright/test instead. Traces are kept on failure; test data is synthetic only.
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env['E2E_CHROMIUM_EXECUTABLE']
const port = Number(process.env['E2E_PORT'] ?? 4310)
const serverEntry = fileURLToPath(new URL('../server/dist/main.js', import.meta.url))
const galleryPort = Number(process.env['E2E_GALLERY_PORT'] ?? 4311)
const uiDir = fileURLToPath(new URL('../../packages/ui', import.meta.url))
const viteBin = fileURLToPath(new URL('../../packages/ui/node_modules/vite/bin/vite.js', import.meta.url))

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
  // Screenshot baselines (TSK-0018) are rendered by the same Chromium build in CI and locally; the small tolerance
  // absorbs anti-aliasing differences between machines, not layout or colour changes.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' } },
  webServer: [
    {
      command: `node ${JSON.stringify(serverEntry)}`,
      url: `http://127.0.0.1:${port}/`,
      env: { PORT: String(port), HOST: '127.0.0.1' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `node ${JSON.stringify(viteBin)} preview --config gallery/vite.config.ts --port ${galleryPort}`,
      cwd: uiDir,
      url: `http://127.0.0.1:${galleryPort}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) },
    },
  ],
})
