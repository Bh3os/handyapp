// System module (TSK-0101; HH-NFR-02, S08, S11, T12, T71, RULE-SERVER-AUTHZ): the Owner's system health report and
// configuration view. Both are reads decided by the policy on the server with dashboard.view, the Owner-only action
// of the Owner Dashboard (PROPOSED mapping: the permission matrix has no separate row for system health or for
// reading configuration; changing a value stays policy_values.change, with fresh sign-in and a reason). Every other
// role is refused. Neither response carries a secret, a destination, message text or a variable's value.
import { CONFIG_KEYS } from '../../platform/config/index.js'
import type { ProviderSettings } from '../../providers/settings.js'
import type { ApiModule, RouteDef } from '../../api/route.js'
import { configurationView, type VariableState } from './configuration.js'
import {
  collectHealth,
  HEALTH_CHECKS,
  HEALTH_METRICS,
  HEALTH_NOTES,
  HEALTH_STATUSES,
  PROVIDER_CHANNELS,
  PROVIDER_MODES,
} from './health.js'

export { collectHealth, HEALTH_CHECKS, HEALTH_METRICS, HEALTH_NOTES, HEALTH_STATUSES } from './health.js'
export type { HealthCheck, HealthReport, HealthStatus } from './health.js'
export { configurationView, flatten, variableStates } from './configuration.js'
export type { ConfigurationView, VariableState } from './configuration.js'

export type SystemDeps = {
  /** This process's provider settings; unset: providers and webhook secrets are reported as unknown. */
  providers?: ProviderSettings | null
  /** Which environment variables are set (names only); unset: reported as unknown. */
  variables?: readonly VariableState[] | null
}

const DATE = { type: 'string', format: 'date-time' } as const
const NULLABLE_DATE = { type: ['string', 'null'], format: 'date-time' } as const
const STRINGS = { type: 'array', items: { type: 'string' } } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const

const obj = (properties: Record<string, unknown>) =>
  ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties }) as const

const CHECK_SCHEMA = obj({
  id: { type: 'string', enum: [...HEALTH_CHECKS] },
  status: { type: 'string', enum: [...HEALTH_STATUSES] },
  metrics: {
    type: 'array',
    items: obj({ id: { type: 'string', enum: [...HEALTH_METRICS] }, value: { type: 'integer' } }),
  },
  oldestAt: NULLABLE_DATE,
  latestAt: NULLABLE_DATE,
  missing: STRINGS,
  note: { type: ['string', 'null'], enum: [...HEALTH_NOTES, null] },
  sourceIds: STRINGS,
  link: NULLABLE_STRING,
})

const HEALTH_SCHEMA = obj({
  checkedAt: DATE,
  environment: NULLABLE_STRING,
  checks: { type: 'array', items: CHECK_SCHEMA },
  providers: {
    type: 'array',
    items: obj({
      channel: { type: 'string', enum: [...PROVIDER_CHANNELS] },
      mode: { type: 'string', enum: [...PROVIDER_MODES] },
      provider: { type: ['string', 'null'], enum: ['resend', 'bird', 'r2', null] },
      missing: STRINGS,
    }),
  },
  webhookSecrets: obj({ bird: { type: ['boolean', 'null'] }, resend: { type: ['boolean', 'null'] } }),
  testDestinations: {
    anyOf: [{ type: 'null' }, obj({ emails: { type: 'integer' }, phones: { type: 'integer' } })],
  },
  failedJobs: {
    type: 'array',
    items: obj({
      id: { type: 'string', format: 'uuid' },
      automation: { type: 'string' },
      targetType: NULLABLE_STRING,
      attempts: { type: 'integer' },
      maxAttempts: { type: 'integer' },
      errorClass: NULLABLE_STRING,
      failedAt: DATE,
    }),
  },
  failedDeliveries: {
    type: 'array',
    items: obj({
      id: { type: 'string', format: 'uuid' },
      messageKey: { type: 'string' },
      channel: { type: 'string' },
      audience: { type: 'string' },
      errorCode: NULLABLE_STRING,
      updatedAt: DATE,
    }),
  },
  failedCallbacks: {
    type: 'array',
    items: obj({
      jobId: { type: 'string', format: 'uuid' },
      provider: NULLABLE_STRING,
      eventType: NULLABLE_STRING,
      attempts: { type: 'integer' },
      errorClass: NULLABLE_STRING,
      failedAt: DATE,
    }),
  },
  uploadProblems: {
    type: 'array',
    items: obj({
      id: { type: 'string', format: 'uuid' },
      state: { type: 'string' },
      reason: NULLABLE_STRING,
      contentType: { type: 'string' },
      byteSize: { type: 'integer' },
      uploadedAt: DATE,
      requestId: { type: ['string', 'null'], format: 'uuid' },
      reference: NULLABLE_STRING,
    }),
  },
  missingFromIntake: {
    type: 'array',
    items: obj({ requestId: { type: 'string', format: 'uuid' }, reference: { type: 'string' }, submittedAt: DATE }),
  },
})

const CONFIGURATION_SCHEMA = obj({
  loadedAt: DATE,
  entries: {
    type: 'array',
    items: obj({
      key: { type: 'string', enum: Object.keys(CONFIG_KEYS) },
      state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
      version: { type: ['integer', 'null'] },
      sourceIds: STRINGS,
      proposed: { type: 'boolean' },
      effectiveFrom: NULLABLE_DATE,
      fields: {
        type: 'array',
        items: obj({ path: { type: 'string' }, value: { type: ['string', 'number', 'boolean'] } }),
      },
    }),
  },
  aiModule: { type: 'string', enum: ['AI_DISABLED'] },
  variables: {
    anyOf: [
      { type: 'null' },
      {
        type: 'array',
        items: obj({
          name: { type: 'string' },
          group: { type: 'string', enum: ['server', 'providers'] },
          set: { type: 'boolean' },
          secret: { type: 'boolean' },
        }),
      },
    ],
  },
})

const COMMON = {
  actors: ['staff'],
  permission: 'dashboard.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: 'test/integration/system.test.ts',
} as const satisfies Partial<RouteDef>

export function systemModule(deps: SystemDeps = {}): ApiModule {
  const health: RouteDef = {
    ...COMMON,
    method: 'GET',
    path: '/staff/system/health',
    operationId: 'getSystemHealth',
    summary: 'System health',
    description:
      'Owner only (dashboard.view). Health checks read from recorded data: the database and migrations; the job ' +
      'queue (queued, running, retrying, overdue, interrupted and permanently failed jobs) and pending outbox ' +
      'events with their age; email and text deliveries; Bird and Resend callbacks; request photo uploads and ' +
      'processing; the request-to-intake integrity check; configuration values NOT CONFIGURED. What the system ' +
      'cannot observe (backups, the last restore drill, scheduling conflicts, error tracking) is unknown or not ' +
      'configured, never ok. Provider modes and missing variable names only: no secret, destination, payload, ' +
      'message text or variable value. The newest 20 failed jobs, failed deliveries, failed callbacks, upload ' +
      'problems and requests missing from intake are listed. Reads only.',
    schema: { response: { 200: HEALTH_SCHEMA } },
    handler: async (ctx) => ({ body: await collectHealth(ctx.db, { providers: deps.providers ?? null }) }),
  }
  const configuration: RouteDef = {
    ...COMMON,
    method: 'GET',
    path: '/staff/system/configuration',
    operationId: 'getSystemConfiguration',
    summary: 'Configuration view',
    description:
      'Owner only (dashboard.view). Every configuration key with its active version: the value as path and value ' +
      'pairs (money in integer cents), or NOT CONFIGURED with the open question it cites; the source ids; whether ' +
      'the value is a PROPOSED reading; the AI module state (always disabled). Environment variables are listed by ' +
      'name with whether they are set; their values are never read into the response. Changing a value is a ' +
      'separate action (policy_values.change). Reads only.',
    schema: { response: { 200: CONFIGURATION_SCHEMA } },
    handler: async (ctx) => ({ body: await configurationView(ctx.db, deps.variables ?? null) }),
  }
  return { name: 'system', routes: [health, configuration] }
}
