// Kysely over a `pg` pool (TSK-0004, HH-ARC-01; ARCH-STACK). Table types come from the generated ./schema.ts.
// - Sessions run in UTC so timestamptz values never depend on the server's time zone.
// - `date` columns come back as 'YYYY-MM-DD' strings, never as a local-midnight Date.
// - `bigint` and `numeric` keep the pg default (strings) so no value loses precision (RULE-MONEY-CENTS).
import { Kysely, PostgresDialect, type Transaction } from 'kysely'
import pg from 'pg'
import type { Database } from './schema.js'

export type { Database } from './schema.js'
export type Db = Kysely<Database>
export type Tx = Transaction<Database>

const DATE_OID = 1082
const DATE_ARRAY_OID = 1182
const TEXT_ARRAY_OID = 1009

type Parser = (value: string) => unknown
// pg's typings only accept its built-in OID enum; any OID is valid at runtime.
const defaultParser = pg.types.getTypeParser as unknown as (oid: number, format: 'text' | 'binary') => Parser

/** pg type parsers: the defaults, except dates (and date arrays) stay as their ISO text. */
export const typeParsers = {
  getTypeParser(oid: number, format?: 'text' | 'binary'): Parser {
    if (oid === DATE_OID) return (value: string) => value
    if (oid === DATE_ARRAY_OID) return defaultParser(TEXT_ARRAY_OID, 'text')
    return defaultParser(oid, format ?? 'text')
  },
}

export type PoolOptions = {
  max?: number
  applicationName?: string
  /** How long a caller waits for a free connection before failing; unset: forever (pg's default). */
  connectionTimeoutMillis?: number
}

/**
 * The server's wait for a free connection (TSK-0109, docs/security/review-2026.md AVAIL-1). A write route holds a
 * transaction's connection while its handler also uses the pool (rate counts, accounts, audit in its own
 * transaction), so as many parallel requests as the pool has connections each waited forever for a second one and
 * the API stopped answering until a restart; ten parallel sign-ins needed no session. With a limit the waiting
 * requests fail, their transactions roll back and the pool recovers. PROPOSED engineering value.
 */
export const SERVER_POOL_CONNECT_TIMEOUT_MS = 10_000

export function createPool(databaseUrl: string, options: PoolOptions = {}): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: options.max ?? 10,
    ...(options.connectionTimeoutMillis !== undefined
      ? { connectionTimeoutMillis: options.connectionTimeoutMillis }
      : {}),
    application_name: options.applicationName ?? 'handyapp',
    options: '-c TimeZone=UTC',
    types: typeParsers as pg.CustomTypesConfig,
  })
}

export function createDb(databaseUrl: string, options: PoolOptions = {}): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: createPool(databaseUrl, options) }) })
}
