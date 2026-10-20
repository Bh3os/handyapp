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

export type PoolOptions = { max?: number; applicationName?: string }

export function createPool(databaseUrl: string, options: PoolOptions = {}): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'handyapp',
    options: '-c TimeZone=UTC',
    types: typeParsers as pg.CustomTypesConfig,
  })
}

export function createDb(databaseUrl: string, options: PoolOptions = {}): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: createPool(databaseUrl, options) }) })
}
