// OpenAPI contract (TSK-0010; HH-API-01). Generated from the registered routes, never hand-written:
// `pnpm --filter @handyhub/server openapi` writes apps/server/openapi.json and a unit test fails when the committed
// file differs from the routes. Each operation carries its policy metadata under x-handyhub.
import { ERROR_CODES, ERROR_SCHEMA } from './errors.js'
import { PAGE_QUERY_PROPERTIES } from './pagination.js'
import { API_PREFIX } from './register.js'
import type { ApiModule, JsonSchema, RouteDef } from './route.js'

type Parameter = { name: string; in: 'path' | 'query' | 'header'; required: boolean; schema: JsonSchema }

function parameters(route: RouteDef): Parameter[] {
  const out: Parameter[] = []
  const props = (s: JsonSchema | undefined) => (s?.['properties'] ?? {}) as Record<string, JsonSchema>
  const required = (s: JsonSchema | undefined) => new Set((s?.['required'] ?? []) as string[])
  const params = route.schema.params
  for (const [name, schema] of Object.entries(props(params))) out.push({ name, in: 'path', required: true, schema })
  const query = route.schema.querystring
  const queryProps = { ...props(query), ...(route.pagination ? PAGE_QUERY_PROPERTIES : {}) }
  for (const [name, schema] of Object.entries(queryProps))
    out.push({ name, in: 'query', required: required(query).has(name), schema: schema as JsonSchema })
  if (route.idempotency === 'required')
    out.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', pattern: '^[A-Za-z0-9._:-]{8,128}$' },
    })
  if (route.expectedVersion === 'required')
    out.push({ name: 'If-Match', in: 'header', required: true, schema: { type: 'string', pattern: '^(W/)?"[0-9]+"$' } })
  return out
}

/** The error statuses an operation can answer, from what it declares. */
function errorStatuses(route: RouteDef): number[] {
  const codes = new Set<keyof typeof ERROR_CODES>([
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'RATE_LIMITED',
    'INTERNAL',
    'UNAVAILABLE',
  ])
  if (route.actors.includes('staff')) codes.add('FORBIDDEN')
  if (!route.actors.includes('guest')) codes.add('UNAUTHENTICATED')
  if (route.kind === 'write') codes.add('CONFLICT').add('PAYLOAD_TOO_LARGE').add('UNSUPPORTED_MEDIA_TYPE')
  if (route.idempotency === 'required') codes.add('IDEMPOTENCY_KEY_REQUIRED').add('IDEMPOTENCY_CONFLICT')
  if (route.permission === 'authentication') codes.add('INVALID_CREDENTIALS').add('LINK_INVALID')
  if (route.freshAuthMinutes !== undefined) codes.add('FRESH_AUTH_REQUIRED')
  if (route.expectedVersion === 'required') codes.add('PRECONDITION_REQUIRED').add('STALE_VERSION')
  return [...new Set([...codes].map((c) => ERROR_CODES[c].status))].sort((a, b) => a - b)
}

const openApiPath = (path: string) => `${API_PREFIX}${path}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}')

export function buildOpenApi(modules: readonly ApiModule[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}
  const routes = modules
    .flatMap((m) => m.routes.map((r) => ({ module: m.name, route: r })))
    .sort((a, b) => `${a.route.path} ${a.route.method}`.localeCompare(`${b.route.path} ${b.route.method}`))
  for (const { module, route } of routes) {
    const responses: Record<string, unknown> = {}
    for (const [status, schema] of Object.entries(route.schema.response))
      responses[status] = { description: 'Success', content: { 'application/json': { schema } } }
    for (const status of errorStatuses(route))
      responses[String(status)] = {
        description: 'Error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      }
    ;(paths[openApiPath(route.path)] ??= {})[route.method.toLowerCase()] = {
      operationId: route.operationId,
      summary: route.summary,
      description: route.description,
      tags: [module],
      parameters: parameters(route),
      ...(route.schema.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: route.schema.body } } } }
        : {}),
      ...(route.binaryBody
        ? {
            requestBody: {
              required: true,
              content: Object.fromEntries(
                route.binaryBody.contentTypes.map((t) => [t, { schema: { type: 'string', format: 'binary' } }]),
              ),
            },
          }
        : {}),
      responses,
      'x-handyhub': {
        actors: route.actors,
        permission: route.permission,
        kind: route.kind,
        idempotency: route.idempotency,
        expectedVersion: route.expectedVersion,
        rateLimit: route.rateLimit,
        freshAuthMinutes: route.freshAuthMinutes ?? null,
        csrf: route.method === 'GET' ? 'not_required' : 'required_with_staff_session',
        audit: route.audit,
        pagination: route.pagination,
        cache: 'private, no-store',
        test: route.test,
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'HandyApp API',
      version: '1',
      description:
        'Generated from the registered routes (TSK-0010, HH-API-01). Errors use one envelope (HH-API-03); private responses are not cached.',
    },
    servers: [{ url: '/' }],
    paths,
    components: { schemas: { Error: ERROR_SCHEMA } },
  }
}

/** The contract as committed: stable, two-space JSON with a final newline. */
export function renderOpenApi(modules: readonly ApiModule[]): string {
  return `${JSON.stringify(buildOpenApi(modules), null, 2)}\n`
}
