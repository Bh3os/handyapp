// Playwright runs against the built server (pnpm build first), which serves the built public site, and against the
// built component gallery of @handyhub/ui (TSK-0018), served by `vite preview` on its own port.
// Local sandboxes with a pre-installed Chromium point E2E_CHROMIUM_EXECUTABLE at it; CI installs the browser pinned
// by @playwright/test instead. Traces are kept on failure; test data is synthetic only.
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { E2E_ACCESS_CODE_KEY, E2E_CODE_KEY, E2E_MFA_KEY } from './codes.js'
import { GATE_USERS } from './gate.js'
import { E2E_BIRD_WEBHOOK_SECRET, E2E_INBOUND_EMAIL_ADDRESS, E2E_RESEND_WEBHOOK_SECRET } from './inbound.js'

const executablePath = process.env['E2E_CHROMIUM_EXECUTABLE']
const port = Number(process.env['E2E_PORT'] ?? 4310)
const serverEntry = fileURLToPath(new URL('../server/dist/main.js', import.meta.url))
const migrateEntry = fileURLToPath(new URL('../../packages/db/dist/cli/migrate.js', import.meta.url))
// The registry, with a fixed set of services shown on the test site (request form, TSK-0027).
const servicesEntry = fileURLToPath(new URL('./fixtures/services.mjs', import.meta.url))
// With E2E_DATABASE_URL (a fresh, empty PostgreSQL 16 database; CI provides one) the server runs with the database:
// migrations first, then staff sign-in (TSK-0014) and every database-backed flow. Without it, those specs skip.
const databaseUrl = process.env['E2E_DATABASE_URL']
const galleryPort = Number(process.env['E2E_GALLERY_PORT'] ?? 4311)
// Two origins (TSK-0017): a second server with PUBLIC_ORIGIN and STAFF_ORIGIN on *.localhost names, which Chromium
// maps to this machine (host-resolver-rules below), so host-only cookies and host routing are exercised for real.
const splitPort = Number(process.env['E2E_SPLIT_PORT'] ?? 4312)
// The staging access gate in front of a third server (TSK-0022, OWN-DEC-73): the ZIP check must work behind it.
const gatedPort = Number(process.env['E2E_GATED_PORT'] ?? 4313)
const splitEnv = {
  PUBLIC_ORIGIN: `http://public.localhost:${splitPort}`,
  STAFF_ORIGIN: `http://staff.localhost:${splitPort}`,
}
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
      command: databaseUrl
        ? `node ${JSON.stringify(migrateEntry)} && node ${JSON.stringify(servicesEntry)} && node ${JSON.stringify(serverEntry)}`
        : `node ${JSON.stringify(serverEntry)}`,
      url: `http://127.0.0.1:${port}/`,
      env: {
        HANDYHUB_ENV: 'ci',
        PORT: String(port),
        HOST: '127.0.0.1',
        // Every spec reaches this server from 127.0.0.1, so the per-network limits (the request form's 5 an hour, the
        // staff sign-in, reset and link limits) would be shared by the whole suite. One trusted hop lets each spec
        // send its own synthetic documentation address (RFC 5737) in X-Forwarded-For; the limits themselves are
        // unchanged and still apply per address.
        TRUST_PROXY_HOPS: '1',
        // One synthetic code key for every server (TSK-0033), so the receipt specs can read a sent code back from
        // the database; without it each process would use its own random key.
        CODE_HASH_KEY: E2E_CODE_KEY,
        // TSK-0154: MFA is mandatory, so every server seals staff authenticators with one synthetic key (one database);
        // without it staff sign-in is refused (fail closed).
        MFA_ENCRYPTION_KEY: E2E_MFA_KEY,
        // The access-code store of the property record (TSK-0045); the other servers leave it NOT CONFIGURED.
        ACCESS_CODE_ENCRYPTION_KEY: E2E_ACCESS_CODE_KEY,
        ...(databaseUrl ? { DATABASE_URL: databaseUrl, TEST_EMAIL_DESTINATIONS: 'e2e-owner@example.test' } : {}),
        // TSK-0049: synthetic webhook signing secrets and receiving address, so the inbox spec can post signed
        // inbound email and texts to this server (the one that runs the jobs). The other servers keep inbound NOT
        // CONFIGURED.
        BIRD_WEBHOOK_SECRET: E2E_BIRD_WEBHOOK_SECRET,
        RESEND_WEBHOOK_SECRET: E2E_RESEND_WEBHOOK_SECRET,
        INBOUND_EMAIL_ADDRESS: E2E_INBOUND_EMAIL_ADDRESS,
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: databaseUrl
        ? `node ${JSON.stringify(migrateEntry)} && node ${JSON.stringify(serverEntry)}`
        : `node ${JSON.stringify(serverEntry)}`,
      // Any host answers the health check; every other path needs one of the two configured hosts.
      url: `http://127.0.0.1:${splitPort}/healthz`,
      env: {
        HANDYHUB_ENV: 'ci',
        PORT: String(splitPort),
        HOST: '127.0.0.1',
        // The first server runs the jobs: the fake object storage of ci lives in each process's memory, so a photo
        // uploaded there can be processed only there.
        JOB_WORKER: 'off',
        ...splitEnv,
        // One synthetic code key for every server (TSK-0033), so the receipt specs can read a sent code back from
        // the database; without it each process would use its own random key.
        CODE_HASH_KEY: E2E_CODE_KEY,
        // TSK-0154: MFA is mandatory, so every server seals staff authenticators with one synthetic key (one database);
        // without it staff sign-in is refused (fail closed).
        MFA_ENCRYPTION_KEY: E2E_MFA_KEY,
        ...(databaseUrl ? { DATABASE_URL: databaseUrl, TEST_EMAIL_DESTINATIONS: 'e2e-owner@example.test' } : {}),
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: databaseUrl
        ? `node ${JSON.stringify(migrateEntry)} && node ${JSON.stringify(serverEntry)}`
        : `node ${JSON.stringify(serverEntry)}`,
      url: `http://127.0.0.1:${gatedPort}/healthz`,
      env: {
        HANDYHUB_ENV: 'ci',
        PORT: String(gatedPort),
        HOST: '127.0.0.1',
        ACCESS_GATE_USERS: GATE_USERS,
        JOB_WORKER: 'off',
        // One synthetic code key for every server (TSK-0033), so the receipt specs can read a sent code back from
        // the database; without it each process would use its own random key.
        CODE_HASH_KEY: E2E_CODE_KEY,
        // TSK-0154: MFA is mandatory, so every server seals staff authenticators with one synthetic key (one database);
        // without it staff sign-in is refused (fail closed).
        MFA_ENCRYPTION_KEY: E2E_MFA_KEY,
        ...(databaseUrl ? { DATABASE_URL: databaseUrl, TEST_EMAIL_DESTINATIONS: 'e2e-owner@example.test' } : {}),
      },
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
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: ['--host-resolver-rules=MAP public.localhost 127.0.0.1, MAP staff.localhost 127.0.0.1'],
        },
      },
    },
  ],
})
