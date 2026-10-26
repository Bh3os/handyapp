// A valid sample of a route's input schema (TSK-0108; HH-TEST-02, RULE-SYNTHETIC-DATA): the smallest instance that
// passes the JSON schema, so a request reaches the authorization decision instead of a validation error. Only the
// keywords the route contracts use are read; a pattern the table below does not know fails the test that asked for
// it, so a new input format is added here deliberately, never guessed. Every value is synthetic.
import type { JsonSchema } from '../../src/api/route.js'

const UUID = '00000000-0000-4000-8000-000000000108'

/** A value for each pattern the route contracts use (each one matches its pattern; the test checks that). */
const PATTERNS: Record<string, string> = {
  '^[A-Za-z0-9._-]{1,40}$': 'synthetic-0108',
  '^SVC-[A-Z]{2}-[0-9]{2}$': 'SVC-DW-01',
  '^[a-z][a-z0-9_]{0,63}$': 'synthetic',
  '^[a-z][a-z0-9_]{0,23}$': 'synthetic',
  '^[A-Za-z]{2}$': 'KY',
  '^[0-9]{5}(-[0-9]{4})?$': '40000',
  '^[0-9]{4}-[0-9]{2}-[0-9]{2}$': '2031-01-15',
  '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$': 'synthetic-0108@example.test',
  '^[0-9 ()+.-]+$': '(502) 555-0108',
  '^[A-Za-z0-9_-]{43}$': 'A'.repeat(43),
  '^HH-[0-9A-HJKMNP-TV-Z]{8}$': 'HH-0000TEST',
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$': UUID,
  '^[0-9a-f-]{36}$': UUID,
  '^[a-z][a-z0-9-]{0,38}[0-9]$': 'synthetic-1',
  '^[Hh][Hh]-[0-9A-Za-z]{0,8}$': 'HH-0000TEST',
  '^\\d{4}-\\d{2}-\\d{2}$': '2031-01-15',
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$': UUID,
  '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$': 'synthetic.key',
  '^[1-9][0-9]{0,3}$': '1',
  '^[0-9a-f]{64}$': 'a'.repeat(64),
  '^[1-9][0-9]{0,5}$': '1',
  '^[0-9a-fA-F-]{36}$': UUID,
  '^\\s*[^\\s@]+@[^\\s@]+\\.[^\\s@]+\\s*$': 'synthetic-0108@example.test',
  '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$': 'America/Kentucky/Louisville',
  '^\\s*[A-Za-z]{2}\\s*$': 'KY',
  '^\\s*[0-9]{5}(-[0-9]{4})?\\s*$': '40000',
  '^([01]\\d|2[0-3]):[0-5]\\d$': '09:00',
  '^[+-]\\d{2}:\\d{2}$': '-05:00',
  '^(([01]\\d|2[0-3]):[0-5]\\d|24:00)$': '17:00',
  '^[0-9]{1,4}$': '1',
  '^[1-6]\\.[0-9]{1,3}$': '1.0',
  '^[a-z][a-z0-9_]{0,59}$': 'synthetic',
  '^[1-9][0-9]{0,17}$': '1',
  '^[0-9]+\\.[0-9]+$': '1.0',
  '^[0-9]{4,10}$': '0108',
}

export class UnknownSchemaPattern extends Error {
  override name = 'UnknownSchemaPattern'
}

function sampleString(s: JsonSchema): string {
  // '\S' (not blank) is free text: sized to the length limits below.
  if (typeof s['pattern'] === 'string' && s['pattern'] !== '\\S') {
    const value = PATTERNS[s['pattern']]
    if (value === undefined) throw new UnknownSchemaPattern(`no sample for the pattern ${s['pattern']}`)
    return value
  }
  switch (s['format']) {
    case 'uuid':
      return UUID
    case 'date-time':
      return '2031-01-15T15:00:00.000Z'
    case 'date':
      return '2031-01-15'
  }
  const min = typeof s['minLength'] === 'number' ? s['minLength'] : 0
  const max = typeof s['maxLength'] === 'number' ? s['maxLength'] : Infinity
  const text = 'Synthetic authorization suite text.'
  return text.length < min ? text.padEnd(min, 'x') : text.slice(0, Math.max(min, Math.min(max, text.length)))
}

/** The smallest valid instance of `schema` (required properties only), or undefined for "no value". */
export function sample(schema: JsonSchema | undefined): unknown {
  if (!schema) return undefined
  if ('const' in schema) return schema['const']
  if (Array.isArray(schema['enum'])) return schema['enum'][0]
  const alternatives = (schema['anyOf'] ?? schema['oneOf']) as JsonSchema[] | undefined
  if (alternatives) return sample(alternatives.find((a) => a['type'] !== 'null') ?? alternatives[0])
  const type = Array.isArray(schema['type'])
    ? (schema['type'] as string[]).find((t) => t !== 'null')
    : (schema['type'] as string | undefined)
  switch (type) {
    case 'object': {
      const props = (schema['properties'] ?? {}) as Record<string, JsonSchema>
      const out: Record<string, unknown> = {}
      for (const name of (schema['required'] ?? []) as string[]) out[name] = sample(props[name])
      return out
    }
    case 'array': {
      const min = typeof schema['minItems'] === 'number' ? schema['minItems'] : 0
      const item = schema['items'] as JsonSchema | undefined
      // uniqueItems with an enum: distinct values in order; otherwise copies of the one sample.
      const values = Array.isArray(item?.['enum']) ? (item['enum'] as unknown[]) : undefined
      return Array.from({ length: min }, (_, i) => (values ? values[i % values.length] : sample(item)))
    }
    case 'integer':
    case 'number':
      return typeof schema['minimum'] === 'number' ? schema['minimum'] : 1
    case 'boolean':
      return false
    case 'string':
      return sampleString(schema)
    default:
      return undefined
  }
}

/** A path with each `:param` replaced by its sample (or the synthetic UUID when the schema says nothing). */
export function samplePath(path: string, params: JsonSchema | undefined, given: Record<string, string> = {}): string {
  const props = (params?.['properties'] ?? {}) as Record<string, JsonSchema>
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) =>
    encodeURIComponent(given[name] ?? String(props[name] ? sample(props[name]) : UUID)),
  )
}

/** The required query parameters' samples (or the given values) as `?a=1&b=2`, or '' when there are none. */
export function sampleQuery(querystring: JsonSchema | undefined, given?: Record<string, string>): string {
  const values = given ?? ((sample(querystring) ?? {}) as Record<string, unknown>)
  const qs = new URLSearchParams(Object.entries(values).map(([k, v]): [string, string] => [k, String(v)])).toString()
  return qs ? `?${qs}` : ''
}

export const SAMPLE_UUID = UUID
