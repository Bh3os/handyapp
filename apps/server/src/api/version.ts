// Expected versions (TSK-0010; HH-API-04). A critical write names the version it was based on in If-Match ("3" or
// W/"3"); a missing one is PRECONDITION_REQUIRED and a stale one is STALE_VERSION with the current values, so nothing
// is overwritten. Responses carry the record version as an ETag.
import { ApiError } from './errors.js'

const IF_MATCH = /^(?:W\/)?"(\d{1,9})"$/

export function parseIfMatch(header: string | string[] | undefined): number {
  const value = Array.isArray(header) ? header[0] : header
  const m = value === undefined ? null : IF_MATCH.exec(value.trim())
  if (!m) throw new ApiError('PRECONDITION_REQUIRED')
  return Number(m[1])
}

/** Refuses the write when the record moved on since the caller read it. */
export function assertVersion(expected: number, current: number, values?: Record<string, unknown>): void {
  if (expected !== current)
    throw new ApiError('STALE_VERSION', { current: { version: current, ...(values ? { values } : {}) } })
}

export const etag = (version: number) => `"${version}"`
