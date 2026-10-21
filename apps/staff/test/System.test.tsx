// System health screen and configuration view (TSK-0101; HH-NFR-02, T12, T71, HH-LANG-02). Reports are synthetic.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'
import type { ConfigurationView, HealthReport } from '../src/System'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const OWNER_NAV = {
  home: 'queue',
  items: ['queue', 'requests', 'dashboard', 'health', 'settings'],
  search: [],
}
const session = (locale: 'en' | 'es' = 'en', navigation: unknown = OWNER_NAV) => ({
  staffUserId: 'u-owner',
  displayName: 'Synthetic owner',
  email: 'owner@example.test',
  locale,
  roles: ['owner'],
  mfaEnrolled: false,
  mfaRecommended: false,
  csrfToken: 'synthetic-csrf-token',
  navigation,
})

const check = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  status,
  metrics: [],
  oldestAt: null,
  latestAt: null,
  missing: [],
  note: null,
  sourceIds: [],
  link: null,
  ...extra,
})

const HEALTH: HealthReport = {
  checkedAt: '2026-10-21T12:00:00.000Z',
  environment: 'ci',
  checks: [
    check('database', 'ok'),
    check('jobs', 'failed', {
      metrics: [
        { id: 'queued', value: 0 },
        { id: 'failed', value: 1 },
      ],
    }),
    check('deliveries_email', 'failed', { metrics: [{ id: 'failed', value: 1 }], link: '/' }),
    check('callbacks_resend', 'not_configured', { missing: ['RESEND_WEBHOOK_SECRET'] }),
    check('configuration', 'not_configured', { metrics: [{ id: 'not_configured', value: 3 }], link: '/settings' }),
    check('backups', 'unknown', { note: 'backups_not_observable', sourceIds: ['OQ-PRODUCTION-HOSTING'] }),
  ] as HealthReport['checks'],
  providers: [
    { channel: 'email', mode: 'real', provider: 'resend', missing: [] },
    { channel: 'sms', mode: 'not_configured', provider: null, missing: ['SMS_PROVIDER'] },
    { channel: 'storage', mode: 'fake', provider: null, missing: [] },
  ],
  webhookSecrets: { bird: true, resend: false },
  testDestinations: { emails: 1, phones: 0 },
  failedJobs: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      automation: 'synthetic.health_probe',
      targetType: 'request',
      attempts: 3,
      maxAttempts: 3,
      errorClass: 'SyntheticProviderTimeout',
      failedAt: '2026-10-21T11:00:00.000Z',
    },
  ],
  failedDeliveries: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      messageKey: 'request.receipt',
      channel: 'email',
      audience: 'customer',
      errorCode: 'provider_rejected',
      updatedAt: '2026-10-21T11:30:00.000Z',
    },
  ],
  failedCallbacks: [],
  uploadProblems: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      state: 'rejected',
      reason: 'malformed',
      contentType: 'image/png',
      byteSize: 1200,
      uploadedAt: '2026-10-21T10:00:00.000Z',
      requestId: '00000000-0000-4000-8000-000000000004',
      reference: 'HH-7K2M9Q4D',
    },
  ],
  missingFromIntake: [],
}

const CONFIG: ConfigurationView = {
  loadedAt: '2026-10-21T12:00:00.000Z',
  entries: [
    {
      key: 'business.timezone',
      state: 'CONFIGURED',
      version: 1,
      sourceIds: ['FACT-TIMEZONE'],
      proposed: false,
      effectiveFrom: '2026-10-01T00:00:00.000Z',
      fields: [{ path: 'zone', value: 'America/Kentucky/Louisville' }],
    },
    {
      key: 'sms.help_reply',
      state: 'NOT_CONFIGURED',
      version: 1,
      sourceIds: ['HH-COM-12', 'OQ-ATTORNEY-PRIVACY'],
      proposed: false,
      effectiveFrom: null,
      fields: [],
    },
  ],
  aiModule: 'AI_DISABLED',
  variables: [
    { name: 'RESEND_API_KEY', group: 'providers', set: true, secret: true },
    { name: 'BIRD_API_KEY', group: 'providers', set: false, secret: true },
  ],
}

function api(responses: Record<string, () => Response>, locale: 'en' | 'es' = 'en') {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [prefix, answer] of Object.entries(responses)) if (url.startsWith(prefix)) return answer()
    return json(200, session(locale))
  })
}

describe('system health screen (TSK-0101, HH-NFR-02)', () => {
  it('[HH-NFR-02][T12] shows every check with its state, the failures and links to act on them', async () => {
    const fetchImpl = api({ '/api/v1/staff/system/health': () => json(200, HEALTH) })
    const navigate = vi.fn()
    render(<App path="/staff/health" base="/staff/" fetchImpl={fetchImpl} navigate={navigate} />)
    await screen.findByRole('heading', { level: 1, name: 'System health' })
    expect(await screen.findByRole('listitem', { name: 'Database: OK' })).toBeTruthy()
    const jobs = screen.getByRole('listitem', { name: 'Background jobs: Failed' })
    expect(within(jobs).getByText('1')).toBeTruthy()
    const email = screen.getByRole('listitem', { name: 'Email deliveries: Failed' })
    expect(within(email).getByRole('link', { name: 'Open the action queue' }).getAttribute('href')).toBe('/staff/')
    expect(screen.getByRole('listitem', { name: 'Resend callbacks (email): NOT CONFIGURED' }).textContent).toContain(
      'RESEND_WEBHOOK_SECRET',
    )
    expect(screen.getByText('synthetic.health_probe')).toBeTruthy()
    expect(screen.getByText('request.receipt')).toBeTruthy()
    expect(screen.getByText('Rejected: Damaged or unreadable image')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Request HH-7K2M9Q4D' })).toBeTruthy()
    expect(screen.getByText('1 email address, 0 phone numbers')).toBeTruthy()
    // The configuration check opens the configuration view.
    fireEvent.click(screen.getByRole('link', { name: 'Open configuration' }))
    expect(navigate).toHaveBeenCalledWith('/staff/settings')
  })

  it('[T71][HH-NFR-02] what cannot be observed is unknown, never OK; a failed load shows no healthy state', async () => {
    render(
      <App
        path="/staff/health"
        base="/staff/"
        fetchImpl={api({ '/api/v1/staff/system/health': () => json(200, HEALTH) })}
        navigate={vi.fn()}
      />,
    )
    const backups = await screen.findByRole('listitem', { name: 'Backups: Unknown' })
    expect(backups.textContent).toContain('this system cannot see them')
    cleanup()

    render(
      <App
        path="/staff/health"
        base="/staff/"
        fetchImpl={api({
          '/api/v1/staff/system/health': () =>
            json(503, {
              error: { code: 'UNAVAILABLE', fieldErrors: [], message: '', requestId: 'r', retryable: true },
            }),
        })}
        navigate={vi.fn()}
      />,
    )
    expect(await screen.findByText('System health could not be loaded.')).toBeTruthy()
    expect(screen.queryByText('OK')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('[RULE-SERVER-AUTHZ] a role without the menu item is told the screen is not part of its role', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) =>
      json(200, session('en', { home: 'queue', items: ['queue'], search: [] })),
    )
    render(<App path="/staff/health" base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)
    expect(await screen.findByText('This screen is not part of your role.')).toBeTruthy()
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).not.toContain('/api/v1/staff/system/health')
  })
})

describe('configuration view (TSK-0101, HH-NFR-02)', () => {
  it('[HH-NFR-02] lists values with versions and sources, NOT CONFIGURED facts and variables by name only', async () => {
    render(
      <App
        path="/staff/settings"
        base="/staff/"
        fetchImpl={api({ '/api/v1/staff/system/configuration': () => json(200, CONFIG) })}
        navigate={vi.fn()}
      />,
    )
    await screen.findByRole('heading', { level: 1, name: 'Configuration' })
    expect(await screen.findByText('1 configured · 1 NOT CONFIGURED · 0 PROPOSED readings')).toBeTruthy()
    const zone = screen.getByRole('listitem', { name: 'Business time zone' })
    expect(within(zone).getByText('America/Kentucky/Louisville')).toBeTruthy()
    expect(within(zone).getByText('Version 1')).toBeTruthy()
    expect(within(zone).getByText('Sources: FACT-TIMEZONE')).toBeTruthy()
    const help = screen.getByRole('listitem', { name: 'Reply to a HELP text' })
    expect(within(help).getByText('NOT CONFIGURED')).toBeTruthy()
    expect(within(help).getByText('Sources: HH-COM-12, OQ-ATTORNEY-PRIVACY')).toBeTruthy()
    expect(screen.getByText('AI features: disabled')).toBeTruthy()
    expect(screen.getByText('RESEND_API_KEY')).toBeTruthy()
    expect(screen.getByText('Set · Secret')).toBeTruthy()
    expect(screen.getByText('Not set · Secret')).toBeTruthy()
  })

  it('[HH-NFR-02] reads in Spanish from the staff catalog', async () => {
    render(
      <App
        path="/staff/settings"
        base="/staff/"
        fetchImpl={api({ '/api/v1/staff/system/configuration': () => json(200, CONFIG) }, 'es')}
        navigate={vi.fn()}
      />,
    )
    await screen.findByRole('heading', { level: 1, name: 'Configuración' })
    await screen.findByText('Funciones de IA: desactivadas')
    const help = screen.getByRole('listitem', { name: 'Respuesta a un texto HELP' })
    expect(within(help).getByText('NO CONFIGURADO')).toBeTruthy()
    expect(screen.getByText('Funciones de IA: desactivadas')).toBeTruthy()
  })
})
