// Contract review of the semantic operations of both websites (TSK-0110; HH-API-02, HH-BASE-05, OWN-DEC-67). Each
// operation of the HH-API-02 table is mapped to the routes that implement it ("paths are proposals; what matters is
// one domain handler per operation"), and the operation's critical rules are checked against the routes' declared
// contract and the permission matrix, so a route that loses its idempotency key, expected version, rate limit or fresh
// sign-in fails here. Without a database: the routes come from the registered modules, as openapi.json does.
import { readFileSync } from 'node:fs'
import type { Db } from '@handyhub/db'
import { MATRIX, rowFor, type Action, type Condition } from '@handyhub/policy'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { buildOpenApi } from '../../src/api/openapi.js'
import { FIELD_EVENT_TYPES } from '../../src/modules/field/index.js'
import { MODULES } from '../../src/modules/index.js'
import { registerWebhookRoutes } from '../../src/providers/webhooks.js'

type Contract = {
  actors: readonly string[]
  permission: string
  kind: 'read' | 'write'
  idempotency: 'required' | 'none'
  expectedVersion: 'required' | 'none'
  rateLimit: unknown
  freshAuthMinutes: number | null
  audit: string
  cache: string
  pagination: boolean
}
type Route = Contract & { route: string }

const doc = buildOpenApi(MODULES) as { paths: Record<string, Record<string, { 'x-handyhub': Contract }>> }
const ROUTES = new Map<string, Route>(
  Object.entries(doc.paths).flatMap(([path, ops]) =>
    Object.entries(ops).map(([method, op]) => {
      const route = `${method.toUpperCase()} ${path.replace(/^\/api\/v1/, '')}`
      return [route, { route, ...op['x-handyhub'] }] as const
    }),
  ),
)

/** The operation names of the HH-API-02 table, read from the graph node (its first column). */
function contractOperations(): string[] {
  const md = readFileSync(new URL('../../../../kg/requirements/HH-API-02.md', import.meta.url), 'utf8')
  const table = md.slice(md.indexOf('| Operation |'))
  return table
    .split('\n')
    .slice(2)
    .filter((l) => l.startsWith('| '))
    .map((l) => (l.split('|')[1] ?? '').trim())
}

type Rule =
  | 'public' // guests may call it (no account, no session needed)
  | 'customer' // a customer session only
  | 'staff' // staff only
  | 'read' // a GET without side effects
  | 'idempotent' // every write route takes an idempotency key
  | 'versioned' // every write route takes the expected version
  | 'rate_limited' // every route has a rate limit
  | 'audited' // every write is audited
  | 'paginated' // a list with bounded cursor pagination
  | 'fresh_sign_in' // a fresh sign-in, by the route or by every matrix cell that allows it
  | 'fresh_verification' // the customer's fresh contact verification (HH-ID-07)
  | 'online' // the matrix allows it to workers online only

/**
 * The implementing routes of each operation and the rules of its "critical rules" column that a route contract can
 * show. Behaviour that only a request shows (for example "never a capacity, price or booking claim") is proven by the
 * tagged integration and end-to-end tests of the same requirement.
 */
const OPERATIONS: Record<string, { routes: readonly string[]; rules: readonly Rule[]; note?: string }> = {
  'Active services': { routes: ['GET /public/services'], rules: ['public', 'read'] },
  'Coverage check': { routes: ['GET /public/coverage'], rules: ['public', 'read'] },
  'Create draft': { routes: ['POST /public/request-drafts'], rules: ['public', 'rate_limited', 'audited'] },
  'Issue upload': {
    routes: [
      'POST /public/request-drafts/photos',
      'POST /customer/projects/{reference}/questions/{questionId}/uploads',
    ],
    rules: ['rate_limited', 'audited'],
  },
  'Finalize upload': {
    routes: ['POST /public/request-drafts/photos'],
    rules: ['public', 'rate_limited'],
    note: 'the bytes are sent to the server, which validates content, type and size on receipt: one step, no separate completion call',
  },
  'Submit request': { routes: ['POST /public/requests'], rules: ['public', 'idempotent', 'rate_limited', 'audited'] },
  'Send verification': {
    routes: [
      'POST /public/access/codes',
      'POST /public/request-receipt/contact/codes',
      'POST /customer/session/verification/codes',
    ],
    rules: ['rate_limited', 'audited'],
  },
  'Verify/exchange': { routes: ['POST /public/access/exchange'], rules: ['public', 'rate_limited', 'audited'] },
  'Account enrollment': {
    routes: ['POST /customer/account/enrollment', 'POST /customer/account/enrollment/codes'],
    rules: ['customer', 'rate_limited', 'audited'],
  },
  'Account project list': { routes: ['GET /customer/projects'], rules: ['customer', 'read'] },
  'Project view': {
    routes: ['GET /customer/projects/{reference}', 'GET /customer/projects/{reference}/overview'],
    rules: ['customer', 'read'],
  },
  'Project messages': {
    routes: ['GET /customer/projects/{reference}/messages', 'POST /customer/projects/{reference}/messages'],
    rules: ['customer', 'idempotent'],
  },
  'Estimate review': {
    routes: ['GET /customer/projects/{reference}/estimates/{number}/versions/{version}'],
    rules: ['customer', 'read'],
  },
  'Approve estimate': {
    routes: ['POST /customer/projects/{reference}/estimates/{number}/versions/{version}/approve'],
    rules: ['customer', 'idempotent', 'rate_limited', 'audited', 'fresh_verification'],
  },
  'Ask estimate change': {
    routes: ['POST /customer/projects/{reference}/estimates/{number}/versions/{version}/request-changes'],
    rules: ['customer', 'idempotent', 'audited'],
  },
  'Request reschedule or cancellation': {
    routes: [
      'POST /customer/projects/{reference}/appointments/{number}/reschedule-request',
      'POST /customer/projects/{reference}/appointments/{number}/cancellation-request',
    ],
    rules: ['customer', 'idempotent', 'audited'],
  },
  'Invoice view': {
    routes: [
      'GET /customer/projects/{reference}/payments',
      'GET /customer/projects/{reference}/invoices/{number}/document',
    ],
    rules: ['customer', 'read'],
  },
  'Staff sign-in, sign-out, password reset, MFA enrolment': {
    routes: [
      'POST /staff/auth/sign-in',
      'POST /staff/auth/sign-out',
      'POST /staff/auth/password/forgot',
      'POST /staff/auth/password/set',
      'POST /staff/auth/mfa/enroll',
      'POST /staff/auth/mfa/confirm',
      'POST /staff/auth/mfa/verify',
    ],
    rules: ['audited'],
  },
  'Staff intake': { routes: ['GET /staff/requests'], rules: ['staff', 'read', 'paginated'] },
  'Qualify request': {
    routes: ['PUT /staff/requests/{requestId}/qualification'],
    rules: ['staff', 'idempotent', 'versioned', 'audited'],
  },
  'Draft/revise estimate': {
    routes: [
      'PUT /staff/estimate-versions/{versionId}/draft',
      'POST /staff/estimate-versions/{versionId}/revise',
      'POST /staff/projects/{projectId}/uploaded-estimates',
    ],
    rules: ['staff', 'idempotent', 'audited'],
  },
  'Publish estimate': {
    routes: ['POST /staff/estimate-versions/{versionId}/publish'],
    rules: ['staff', 'idempotent', 'versioned', 'audited'],
  },
  'Confirm visit': {
    routes: ['POST /staff/visits/{visitId}/confirm'],
    rules: ['staff', 'idempotent', 'versioned', 'audited'],
  },
  'Reassign/reschedule': {
    routes: ['POST /staff/visits/{visitId}/reassign', 'POST /staff/visits/{visitId}/window'],
    rules: ['staff', 'idempotent', 'versioned', 'audited'],
  },
  'Job packet': { routes: ['GET /staff/jobs/{jobId}/packet'], rules: ['staff', 'read'] },
  'Reveal access secret': {
    routes: ['POST /staff/properties/{propertyId}/access-codes/{codeId}/reveal'],
    rules: ['staff', 'rate_limited', 'audited', 'online'],
  },
  Readiness: { routes: ['GET /staff/visits/{visitId}/start-gate'], rules: ['staff', 'read'] },
  'Start/pause/resume': {
    routes: [
      'POST /staff/visits/{visitId}/start',
      'POST /staff/visits/{visitId}/resume',
      'POST /staff/jobs/{jobId}/checklist/steps/pause',
    ],
    rules: ['staff', 'idempotent', 'audited'],
  },
  'Stop/report issue': {
    routes: ['POST /staff/jobs/{jobId}/hazard-reports', 'POST /staff/jobs/{jobId}/issue-reports'],
    rules: ['staff', 'idempotent', 'audited'],
  },
  'Sync field events': { routes: ['POST /staff/field-events'], rules: ['staff', 'idempotent', 'audited'] },
  'Propose change': { routes: ['POST /staff/jobs/{jobId}/change-orders'], rules: ['staff', 'idempotent', 'audited'] },
  'Accept change': {
    routes: [
      'POST /customer/projects/{reference}/change-orders/{number}/versions/{version}/approve',
      'POST /staff/change-orders/{changeOrderId}/in-person/approve',
    ],
    rules: ['idempotent', 'audited', 'fresh_verification'],
  },
  'Submit completion': { routes: ['POST /staff/jobs/{jobId}/completion'], rules: ['staff', 'idempotent', 'audited'] },
  'Review QA': {
    routes: ['POST /staff/jobs/{jobId}/quality-review/actions/decide'],
    rules: ['staff', 'idempotent', 'versioned', 'audited'],
  },
  'Issue invoice': {
    routes: ['POST /staff/invoices/{invoiceId}/issue', 'PUT /staff/invoices/{invoiceId}/payment-link'],
    rules: ['staff', 'idempotent', 'audited'],
  },
  'Record payment': {
    routes: [
      'POST /staff/invoices/{invoiceId}/payments',
      'POST /staff/jobs/{jobId}/deposit/payments',
      'POST /staff/jobs/{jobId}/collection',
    ],
    rules: ['staff', 'idempotent', 'audited'],
  },
  'Reconcile/correct': {
    routes: [
      'POST /staff/payments/{paymentId}/reconcile',
      'POST /staff/payments/{paymentId}/returned',
      'POST /staff/payments/{paymentId}/correction',
      'POST /staff/payments/{paymentId}/adjustments',
    ],
    rules: ['staff', 'idempotent', 'audited'],
  },
  'Unified inbox': {
    routes: [
      'GET /staff/inbox/conversations',
      'GET /staff/inbox/needs-linking',
      'POST /staff/inbox/messages/{messageId}/link',
      'POST /staff/inbox/projects/{projectId}/replies',
    ],
    rules: ['staff', 'idempotent', 'audited'],
  },
  'Provider callbacks': {
    routes: [],
    rules: [],
    note: 'POST /webhooks/bird and /webhooks/resend sit outside the API (raw body for the signature); checked below',
  },
  'Reports/export': {
    routes: ['GET /staff/dashboard', 'POST /staff/dashboard/exports', 'POST /staff/accounting/exports'],
    rules: ['staff', 'audited', 'fresh_sign_in', 'rate_limited'],
  },
}

/** The matrix rules that allow an action, over every role. */
const allowingRules = (action: string) => {
  const row = rowFor(action)
  return row ? Object.values(row.cells).flatMap((c) => c.rules[action as Action] ?? []) : []
}
const conditionsOf = (action: string): Condition[] => allowingRules(action).flatMap((r) => r.conditions ?? [])

/** Why a route breaks a rule, or null when it keeps it. Write-only rules hold vacuously for reads. */
function broken(r: Route, rule: Rule): string | null {
  const write = r.kind === 'write'
  switch (rule) {
    case 'public':
      return r.actors.includes('guest') ? null : 'guests cannot call it'
    case 'customer':
      return r.actors.length === 1 && r.actors[0] === 'customer' ? null : `actors ${r.actors.join(',')}`
    case 'staff':
      return r.actors.length === 1 && r.actors[0] === 'staff' ? null : `actors ${r.actors.join(',')}`
    case 'read':
      return r.kind === 'read' && r.route.startsWith('GET ') ? null : 'not a read'
    case 'idempotent':
      return !write || r.idempotency === 'required' ? null : 'no idempotency key'
    case 'versioned':
      return !write || r.expectedVersion === 'required' ? null : 'no expected version'
    case 'rate_limited':
      return r.rateLimit !== 'none' || !write ? null : 'no rate limit'
    case 'audited':
      return !write || r.audit !== 'none' ? null : 'not audited'
    case 'paginated':
      return r.pagination ? null : 'not paginated'
    case 'fresh_sign_in': {
      if (!write) return null
      const rules = allowingRules(r.permission)
      return r.freshAuthMinutes !== null || (rules.length > 0 && rules.every((x) => x.fresh))
        ? null
        : 'no fresh sign-in'
    }
    case 'fresh_verification': {
      if (r.actors.includes('customer'))
        return conditionsOf(r.permission).includes('customer_fresh_verification') ? null : 'no fresh verification'
      // In person (staff capture): the customer is identified by a one-time code to the verified contact instead.
      return null
    }
    case 'online':
      return conditionsOf(r.permission).includes('online') ? null : 'not online-only'
  }
}

describe('semantic operation contracts of both websites (TSK-0110, HH-API-02)', () => {
  it('[HH-API-02] every operation of the contract table is mapped, and only those', () => {
    expect(Object.keys(OPERATIONS).sort()).toEqual(contractOperations().sort())
  })

  it('[HH-API-02] every mapped route exists in the registered API', () => {
    const missing = Object.values(OPERATIONS).flatMap((o) => o.routes.filter((r) => !ROUTES.has(r)))
    expect(missing).toEqual([])
  })

  it("[HH-API-02][HH-API-04] each operation's critical rules hold on every route that implements it", () => {
    const problems = Object.entries(OPERATIONS).flatMap(([name, op]) =>
      op.routes.flatMap((route) =>
        op.rules.flatMap((rule) => {
          const why = broken(ROUTES.get(route) as Route, rule)
          return why ? [`${name}: ${route} breaks ${rule} (${why})`] : []
        }),
      ),
    )
    expect(problems).toEqual([])
  })

  it('[HH-API-02][HH-API-05][HH-ID-08] no response of either website may be kept by a shared cache', () => {
    expect([...ROUTES.values()].filter((r) => r.cache !== 'private, no-store').map((r) => r.route)).toEqual([])
  })
})

describe('truth checks at the API boundary (TSK-0110, HH-BASE-05)', () => {
  it('[HH-BASE-05][OWN-DEC-67] no payment session, checkout or card-provider route exists; callbacks are Bird and Resend only', async () => {
    const card = [...ROUTES.keys()].filter((r) => /square|stripe|checkout|payment[-_]?session|webhook/i.test(r))
    expect(card).toEqual([])
    // The provider callbacks are registered outside the API: list what they register.
    const app = Fastify({ logger: false })
    const registered: string[] = []
    app.addHook('onRoute', (r) => {
      for (const m of [r.method].flat()) registered.push(`${m} ${r.url}`)
    })
    await registerWebhookRoutes(app, { db: {} as Db, secrets: { bird: null, resend: null } })
    await app.ready()
    expect(registered.filter((r) => !r.startsWith('HEAD ')).sort()).toEqual([
      'POST /webhooks/bird',
      'POST /webhooks/resend',
    ])
    await app.close()
  })

  it('[HH-BASE-05][HH-FIN-09] a customer or guest can read money but never record, clear, reconcile or waive it', () => {
    const finance = new Set<string>(MATRIX.filter((r) => r.section === 'Finance').flatMap((r) => r.actions))
    const customerMoney = [...ROUTES.values()].filter((r) => !r.actors.includes('staff') && finance.has(r.permission))
    expect(customerMoney.length).toBeGreaterThan(0)
    expect(customerMoney.filter((r) => r.kind !== 'read').map((r) => r.route)).toEqual([])
    // Every customer and guest finance permission the matrix grants is a read.
    for (const r of customerMoney) expect(r.permission).toBe('payment.view')
  })

  it('[HH-BASE-05][HH-INT-02] a guest can only send a request or authenticate: no public write books, prices or approves', () => {
    const guestWrites = [...ROUTES.values()].filter((r) => r.actors.includes('guest') && r.kind === 'write')
    expect([...new Set(guestWrites.map((r) => r.permission))].sort()).toEqual(['authentication', 'request.submit'])
  })

  it('[HH-BASE-05][RULE-SAFETY-GATES] Start Work and resume are online-only for everyone, so a checked box offline never starts', () => {
    for (const action of ['work.start', 'work.resume']) {
      const rules = allowingRules(action)
      expect(rules.length, action).toBeGreaterThan(0)
      for (const r of rules) {
        expect(r.conditions ?? [], action).toContain('online')
        expect(r.gate, action).toBe('start_work')
      }
    }
  })

  it('[T50][HH-OFF-04] a phone can queue only field taps and checklist steps; every critical action needs the server', () => {
    expect([...FIELD_EVENT_TYPES].sort()).toEqual(['checklist_step', 'tap_arrived', 'tap_finished', 'tap_on_my_way'])
    // Start, resume, approvals, payments, quality submission and invoices are separate routes, each answered by the
    // server at once: none is a field event the phone could replay later.
    const critical = [
      'POST /staff/visits/{visitId}/start',
      'POST /staff/visits/{visitId}/resume',
      'POST /staff/change-orders/{changeOrderId}/in-person/approve',
      'POST /staff/invoices/{invoiceId}/payments',
      'POST /staff/jobs/{jobId}/collection',
      'POST /staff/jobs/{jobId}/completion',
      'POST /staff/invoices/{invoiceId}/issue',
    ]
    for (const r of critical) expect(ROUTES.get(r)?.kind, r).toBe('write')
  })
})
