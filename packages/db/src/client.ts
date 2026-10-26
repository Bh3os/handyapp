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
  /**
   * TSK-0107: told when an idle pooled connection is lost (a PostgreSQL restart or failover, pg_terminate_backend). The
   * pool has already dropped it; the next query opens a new one. Only the error's code should be logged: pg attaches
   * the client, with its connection settings, to the error.
   */
  onConnectionLost?: (err: Error & { code?: string }) => void
}

/**
 * A pg pool that survives lost connections (TSK-0107, HH-NFR-03): without a listener, the 'error' event of a pool or
 * a client whose server process ended is thrown, and ends the whole Node process.
 * - An idle connection: pg-pool removes it and emits 'error' on the pool, reported to onConnectionLost.
 * - A connection in use: its running or next query fails (so its transaction never commits) and the connection is
 *   removed when it is released; its client's own 'error' event only needs a listener, the caller sees the failure.
 */
export function createPool(databaseUrl: string, options: PoolOptions = {}): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'handyapp',
    options: '-c TimeZone=UTC',
    types: typeParsers as pg.CustomTypesConfig,
  })
  pool.on('error', (err) => options.onConnectionLost?.(err))
  pool.on('connect', (client) => client.on('error', () => undefined))
  return pool
}

export function createDb(databaseUrl: string, options: PoolOptions = {}): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: createPool(databaseUrl, options) }) })
}
