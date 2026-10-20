// Table types generated from the migrated database (TSK-0004). `pnpm db:types` migrates a scratch database, reads the
// catalog with introspect() and writes src/schema.ts with renderSchema(); an integration test fails when the committed
// file differs from what the migrations produce, so the types never drift from the SQL.
import pg from 'pg'

export type CatalogColumn = {
  schema: string
  table: string
  /** pg_class.relkind: r table, p partitioned table, v view, m materialized view. */
  kind: string
  column: string
  /** Type name after resolving domains; array types start with '_'. */
  type: string
  /** For arrays: the element type name (after resolving domains); otherwise null. */
  elementType: string | null
  notNull: boolean
  hasDefault: boolean
  /** pg_attribute.attidentity: '' none, 'a' always, 'd' by default. */
  identity: string
  /** pg_attribute.attgenerated: '' none, 's' stored. */
  generated: string
}

export type CatalogEnum = { schema: string; name: string; labels: string[] }
export type Catalog = { columns: CatalogColumn[]; enums: CatalogEnum[] }

const COLUMNS_SQL = `
SELECT n.nspname AS schema, c.relname AS table, c.relkind::text AS kind, a.attname AS column,
       COALESCE(NULLIF(bt.typname, ''), t.typname) AS type_name,
       COALESCE(ebt.typname, et.typname) AS element_type,
       a.attnotnull AS not_null, a.atthasdef AS has_default,
       a.attidentity::text AS identity, a.attgenerated::text AS generated
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid
LEFT JOIN pg_type bt ON t.typtype = 'd' AND bt.oid = t.typbasetype
LEFT JOIN pg_type et ON et.oid = COALESCE(bt.typelem, t.typelem) AND COALESCE(bt.typcategory, t.typcategory) = 'A'
LEFT JOIN pg_type ebt ON et.typtype = 'd' AND ebt.oid = et.typbasetype
WHERE c.relkind IN ('r', 'p', 'v', 'm') AND NOT c.relispartition
  AND a.attnum > 0 AND NOT a.attisdropped
  AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
ORDER BY n.nspname, c.relname, a.attnum`

const ENUMS_SQL = `
SELECT n.nspname AS schema, t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
GROUP BY n.nspname, t.typname
ORDER BY n.nspname, t.typname`

type ColumnRow = {
  schema: string
  table: string
  kind: string
  column: string
  type_name: string
  element_type: string | null
  not_null: boolean
  has_default: boolean
  identity: string
  generated: string
}

export async function introspect(databaseUrl: string): Promise<Catalog> {
  const client = new pg.Client({ connectionString: databaseUrl, application_name: 'handyapp-typegen' })
  await client.connect()
  try {
    const columns = (await client.query<ColumnRow>(COLUMNS_SQL)).rows.map((r) => ({
      schema: r.schema,
      table: r.table,
      kind: r.kind,
      column: r.column,
      type: r.type_name,
      elementType: r.element_type,
      notNull: r.not_null,
      hasDefault: r.has_default,
      identity: r.identity,
      generated: r.generated,
    }))
    const enums = (await client.query<CatalogEnum>(ENUMS_SQL)).rows
    return { columns, enums }
  } finally {
    await client.end()
  }
}

// Select types as node-postgres returns them with ./client.ts's parsers; insert and update types accept what pg sends.
const SCALARS: Record<string, string> = {
  bool: 'boolean',
  int2: 'number',
  int4: 'number',
  float4: 'number',
  float8: 'number',
  oid: 'number',
  int8: 'Int8',
  numeric: 'Numeric',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  char: 'string',
  name: 'string',
  citext: 'string',
  uuid: 'string',
  inet: 'string',
  cidr: 'string',
  macaddr: 'string',
  time: 'string',
  timetz: 'string',
  date: 'string',
  timestamptz: 'Timestamp',
  timestamp: 'Timestamp',
  json: 'Json',
  jsonb: 'Json',
  bytea: 'Buffer',
}

// Element types whose arrays node-postgres parses into JS arrays; other arrays arrive as the raw literal string.
const PARSED_ARRAYS = new Set([
  'bool',
  'int2',
  'int4',
  'int8',
  'float4',
  'float8',
  'oid',
  'numeric',
  'text',
  'varchar',
  'bpchar',
  'char',
  'name',
  'uuid',
  'inet',
  'cidr',
  'date',
  'timestamptz',
  'timestamp',
])
const ARRAY_ELEMENT: Record<string, string> = {
  int8: 'string',
  numeric: 'string',
  timestamptz: 'Date',
  timestamp: 'Date',
}

const HELPERS: Record<string, string> = {
  Int8: 'export type Int8 = ColumnType<string, bigint | number | string, bigint | number | string>',
  Numeric: 'export type Numeric = ColumnType<string, number | string, number | string>',
  Timestamp: 'export type Timestamp = ColumnType<Date, Date | string, Date | string>',
  Json: [
    'export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }',
    '/** json and jsonb: parsed on select; written as JSON text (JSON.stringify) so arrays are not sent as SQL arrays. */',
    'export type Json = ColumnType<JsonValue, string, string>',
  ].join('\n'),
}

function pascal(s: string): string {
  return s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

function tableKey(schema: string, table: string): string {
  return schema === 'public' ? table : `${schema}.${table}`
}

function quoteKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function literal(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** Renders src/schema.ts from a catalog. Deterministic: same catalog, same text. */
export function renderSchema(catalog: Catalog): string {
  const enumNames = new Map<string, string>()
  for (const e of catalog.enums) enumNames.set(e.name, pascal(e.schema === 'public' ? e.name : `${e.schema}_${e.name}`))
  const used = new Set<string>()
  const kysely = new Set<string>()

  const scalar = (type: string): string => {
    const e = enumNames.get(type)
    if (e) return e
    const s = SCALARS[type]
    if (!s) return 'unknown'
    if (HELPERS[s]) used.add(s)
    return s
  }

  const columnType = (c: CatalogColumn): string => {
    let t: string
    if (c.elementType !== null) {
      const el = c.elementType
      if (PARSED_ARRAYS.has(el)) t = `${ARRAY_ELEMENT[el] ?? scalar(el)}[]`
      else if (enumNames.has(el)) t = 'string'
      else t = 'unknown'
    } else t = scalar(c.type)
    const isView = c.kind === 'v' || c.kind === 'm'
    if (!c.notNull || isView) t = `${t} | null`
    if (isView) return t
    if (c.identity === 'a' || c.generated === 's') {
      kysely.add('GeneratedAlways')
      return `GeneratedAlways<${t}>`
    }
    if (c.identity === 'd' || c.hasDefault) {
      kysely.add('Generated')
      return `Generated<${t}>`
    }
    return t
  }

  const tables = new Map<string, { name: string; key: string; lines: string[] }>()
  for (const c of catalog.columns) {
    const key = tableKey(c.schema, c.table)
    let entry = tables.get(key)
    if (!entry) {
      entry = { name: `${pascal(c.schema === 'public' ? c.table : `${c.schema}_${c.table}`)}Table`, key, lines: [] }
      tables.set(key, entry)
    }
    entry.lines.push(`  ${quoteKey(c.column)}: ${columnType(c)}`)
  }

  const blocks: string[] = []
  for (const e of catalog.enums)
    blocks.push(`export type ${enumNames.get(e.name)} = ${e.labels.map(literal).join(' | ')}`)
  const sorted = [...tables.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  for (const t of sorted) blocks.push(`export interface ${t.name} {\n${t.lines.join('\n')}\n}`)
  blocks.push(`export interface Database {\n${sorted.map((t) => `  ${quoteKey(t.key)}: ${t.name}`).join('\n')}\n}`)

  if (used.size) kysely.add('ColumnType')
  const header = [
    '// Generated by `pnpm db:types` from packages/db/migrations (TSK-0004). Do not edit by hand: add a migration, then',
    '// run `pnpm db:types`. An integration test fails when this file differs from what the migrations produce.',
  ]
  if (kysely.size) header.push(`import type { ${[...kysely].sort().join(', ')} } from 'kysely'`)
  const helpers = ['Int8', 'Numeric', 'Timestamp', 'Json'].filter((h) => used.has(h)).map((h) => HELPERS[h])
  return [header.join('\n'), ...helpers, ...blocks].join('\n\n') + '\n'
}
