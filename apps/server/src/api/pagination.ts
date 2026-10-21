// Bounded cursor pagination (TSK-0010; HH-API-05). A list has a stable sort, a page size capped at MAX_PAGE_SIZE and
// an opaque cursor holding the sort key of the last row. The caller's role and record-scope filters are applied in
// the query before paging, so a cursor never reaches rows outside the scope.
import { ApiError } from './errors.js'

/** PROPOSED engineering defaults (no owner decision needed): 25 per page, at most 100. */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export type PageRequest = { limit: number; after: unknown[] | undefined }
export type Page<T> = { items: T[]; nextCursor: string | null }

/** Query-string fields every paginated route accepts. */
export const PAGE_QUERY_PROPERTIES = {
  limit: { type: 'integer', minimum: 1 },
  cursor: { type: 'string', minLength: 1, maxLength: 512 },
} as const

export function encodeCursor(key: unknown[]): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): unknown[] {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (Array.isArray(value)) return value
  } catch {
    // fall through
  }
  throw new ApiError('VALIDATION_FAILED', {
    fieldErrors: [{ field: 'querystring.cursor', code: 'invalid', message: '' }],
  })
}

const INVALID_CURSOR = () =>
  new ApiError('VALIDATION_FAILED', {
    fieldErrors: [{ field: 'querystring.cursor', code: 'invalid', message: '' }],
  })

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:([+-])(\d{2})(?::?(\d{2}))?|Z)$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * True for PostgreSQL's text form of a timestamptz (as a cursor built from `<column>::text` holds it) whose date, time
 * and offset all exist, so the value never fails the `::timestamptz` cast: "2026-02-30" or "25:00" are refused here.
 */
export function isCursorInstant(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = INSTANT.exec(v)
  if (!m) return false
  const n = (i: number) => Number(m[i] ?? '0')
  const [year, month, day] = [n(1), n(2), n(3)]
  // Day 0 of the next month is the last day of this one (years 1-99 map to 1901-1999, which share their leap years).
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days &&
    n(4) <= 23 &&
    n(5) <= 59 &&
    n(6) <= 59 &&
    n(8) <= 15 &&
    n(9) <= 59
  )
}

/**
 * The [instant, id] key of a newest-first list's cursor, both parts checked strictly: a crafted cursor is a 400
 * VALIDATION_FAILED on querystring.cursor, never a database error.
 */
export function instantIdCursor(after: unknown[]): [instant: string, id: string] {
  const [at, id] = after
  if (after.length !== 2 || !isCursorInstant(at) || typeof id !== 'string' || !UUID.test(id)) throw INVALID_CURSOR()
  return [at, id]
}

/** The page request from a query string: a larger limit is capped, not refused. */
export function pageRequest(query: { limit?: number; cursor?: string } | undefined): PageRequest {
  const limit = Math.min(Math.max(query?.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  return { limit, after: query?.cursor === undefined ? undefined : decodeCursor(query.cursor) }
}

/** Builds a page from rows fetched with `limit + 1`: the extra row only says another page exists. */
export function toPage<T>(rows: T[], page: PageRequest, keyOf: (row: T) => unknown[]): Page<T> {
  const items = rows.slice(0, page.limit)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > page.limit && last !== undefined ? encodeCursor(keyOf(last)) : null }
}

/** Response schema of a page of `item`. */
export function pageSchema(item: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'nextCursor'],
    properties: { items: { type: 'array', items: item }, nextCursor: { type: ['string', 'null'] } },
  }
}
