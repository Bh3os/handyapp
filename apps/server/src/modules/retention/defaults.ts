// The retention job's finders for the provisional defaults (TSK-0138; OWN-DEC-177, FACT-RETENTION-SCHEDULE,
// HH-PRIV-01, HH-STAFF-02, ENT-RetentionReview, ENT-StaffUser, ENT-ConsentPreference, ENT-ProjectAccessGrant,
// OQ-RETENTION-REVIEW, OQ-RETENTION-DEFAULTS-DETAILS). Like the finders of scan.ts they only read: each returns the
// records whose configured period has ended and that have no entry yet; the scan opens the entries. Nothing here
// deletes, archives, revokes or changes a record (OWN-DEC-177: "Do not activate irreversible automatic deletion").
// - Staff accounts: a disabled account, from its departure (the time it was disabled). Offboarding itself is
//   immediate and is not the job's work (modules/staff disable: sessions revoked, links invalidated, password and
//   authenticator removed). A re-enabled account is not due; a later departure starts a new period.
// - Consent records: the history of one permission (purpose, channel, destination) whose latest record is a
//   withdrawal, from that withdrawal (PROPOSED reading of "the last relevant use": once withdrawn, nothing may be sent
//   under it). Never while the permission is granted again, and (PROPOSED) never while the destination is on file for a
//   contact, an open customer account or a staff member: the withdrawal is what stops messages to it.
// - Expired sessions and access links: rows that ended (expired, used, superseded or revoked), batched per kind and per
//   calendar month of their end in the business time zone (PROPOSED: the owner reviews a month of one kind at once, not
//   a row per sign-in); the batch is due once the configured days have passed after that month. The rows store token
//   hashes and timestamps only, never a usable token.
// Periods here are calendar periods in the business time zone (business.timezone; UTC only when it is NOT CONFIGURED),
// so a daylight-saving change never moves a period end by an hour.
import type { Db, Tx } from '@handyhub/db'
import { sql, type RawBuilder } from 'kysely'
import type { CaseCounts } from './schedule.js'

/** One record (or one batch of rows) whose period has ended. */
export type Candidate = {
  record_type: string
  record_id: string
  record_ref: string
  project_id: string | null
  started_at: Date
  ends_at: Date
  /** The rows a batch or a history stands for; null for one record. */
  record_count?: number | null
  /** Open cases that concern a record without a project (a staff member's reports, TSK-0093). */
  cases?: CaseCounts | null
}

export type FindInput = {
  years: number | null
  days: number | null
  now: Date
  limit: number
  /** The business time zone the calendar periods are counted in. */
  zone: string
  /** session.timings.staffSessionIdleMinutes: when an unrevoked staff session ended; null when NOT CONFIGURED. */
  staffIdleMinutes: number | null
}

export type Finder = (tx: Tx, input: FindInput) => Promise<Candidate[]>

const interval = (p: { years: number | null; days: number | null }) =>
  p.years !== null ? sql`make_interval(years => ${p.years})` : sql`make_interval(days => ${p.days ?? 0})`

/** The period end of an instant: its local time in the zone plus whole calendar years or days, back to an instant. */
export const zonedEnd = (start: RawBuilder<unknown>, p: FindInput) =>
  sql<Date>`((${start} AT TIME ZONE ${p.zone}::text) + ${interval(p)}) AT TIME ZONE ${p.zone}::text`

/** The open cases a staff member reported (TSK-0093): an account that is evidence in a case is not deleted. */
export async function reportedCases(tx: Db | Tx, staffIds: readonly string[]): Promise<Map<string, CaseCounts>> {
  const out = new Map<string, CaseCounts>()
  if (staffIds.length === 0) return out
  const rows = await tx
    .selectFrom('quality.cases')
    .select(['reported_by', 'kind', sql<string>`count(*)::text`.as('n')])
    .where('reported_by', 'in', [...staffIds])
    .where('state', '<>', 'closed')
    .groupBy(['reported_by', 'kind'])
    .execute()
  for (const r of rows) {
    const e = out.get(r.reported_by) ?? { complaints: 0, disputes: 0, incidents: 0 }
    if (r.kind === 'complaint') out.set(r.reported_by, { ...e, complaints: e.complaints + Number(r.n) })
    else if (r.kind === 'dispute') out.set(r.reported_by, { ...e, disputes: e.disputes + Number(r.n) })
    else out.set(r.reported_by, { ...e, incidents: e.incidents + Number(r.n) })
  }
  return out
}

/** A disabled staff account, from its departure; no entry yet for this departure. */
export const findStaffAccounts: Finder = async (tx, p) => {
  const end = zonedEnd(sql.ref('u.disabled_at'), p)
  const { rows } = await sql<Candidate>`
    SELECT 'staff_account' AS record_type, u.id AS record_id,
           left(u.id::text, 8) AS record_ref, NULL::uuid AS project_id,
           u.disabled_at AS started_at, ${end} AS ends_at
      FROM identity.staff_users u
     WHERE u.status = 'disabled'
       AND u.disabled_at IS NOT NULL
       AND ${end} <= ${p.now}::timestamptz
       AND NOT EXISTS (SELECT 1 FROM privacy.retention_reviews rv
                        WHERE rv.record_type = 'staff_account' AND rv.record_id = u.id AND rv.period_ends_at = ${end})
     ORDER BY u.disabled_at, u.id
     LIMIT ${p.limit}`.execute(tx)
  const cases = await reportedCases(
    tx,
    rows.map((r) => r.record_id),
  )
  return rows.map((r) => ({ ...r, cases: cases.get(r.record_id) ?? { complaints: 0, disputes: 0, incidents: 0 } }))
}

/** The destination is on file: a contact, an open customer account, a staff member or a staff escalation phone. */
export const destinationOnFile = (destination: RawBuilder<unknown>) => sql<boolean>`(
     EXISTS (SELECT 1 FROM crm.contacts k WHERE k.email_normalized = ${destination} OR k.phone_e164 = ${destination})
  OR EXISTS (SELECT 1 FROM identity.customer_accounts a WHERE a.state = 'active'
              AND (lower(a.sign_in_email) = ${destination} OR a.sign_in_phone = ${destination}))
  OR EXISTS (SELECT 1 FROM identity.staff_users s WHERE lower(s.email) = ${destination})
  OR EXISTS (SELECT 1 FROM identity.staff_escalation_phones e WHERE e.phone = ${destination}))`

/** A withdrawn permission's history, from the withdrawal; never while granted again or while its destination is on file. */
export const findConsentHistories: Finder = async (tx, p) => {
  const end = zonedEnd(sql.ref('l.recorded_at'), p)
  const { rows } = await sql<Candidate>`
    WITH latest AS (
      SELECT DISTINCT ON (c.destination, c.purpose, c.channel)
             c.id, c.seq, c.destination, c.purpose, c.channel, c.granted, c.recorded_at
        FROM platform.consent_records c
       ORDER BY c.destination, c.purpose, c.channel, c.seq DESC)
    SELECT 'consent_history' AS record_type, l.id AS record_id,
           ('Consent #' || l.seq::text || ' ' || l.purpose || ' by ' || l.channel || ', withdrawn') AS record_ref,
           NULL::uuid AS project_id, l.recorded_at AS started_at, ${end} AS ends_at,
           (SELECT count(*) FROM platform.consent_records h WHERE h.destination = l.destination
              AND h.purpose = l.purpose AND h.channel = l.channel)::int AS record_count
      FROM latest l
     WHERE NOT l.granted
       AND ${end} <= ${p.now}::timestamptz
       AND NOT ${destinationOnFile(sql.ref('l.destination'))}
       AND NOT EXISTS (SELECT 1 FROM privacy.retention_reviews rv
                        WHERE rv.record_type = 'consent_history' AND rv.record_id = l.id)
     ORDER BY l.recorded_at, l.id
     LIMIT ${p.limit}`.execute(tx)
  return rows
}

/** The kinds of expired sessions and access links, and when a row of each ended (the earliest of its end times). */
export const EXPIRED_KINDS = [
  'expired_staff_sessions',
  'expired_customer_sessions',
  'expired_guest_links',
  'expired_staff_links',
  'expired_receipt_links',
  'expired_upload_links',
  'expired_verification_codes',
] as const
export type ExpiredKind = (typeof EXPIRED_KINDS)[number]

/** The table of each kind and the expression of when one of its rows ended (alias `t`). */
export function expiredKind(
  kind: ExpiredKind,
  staffIdleMinutes: number | null,
): { table: string; ended: RawBuilder<Date> } {
  switch (kind) {
    case 'expired_staff_sessions':
      // Revoked, or idle past session.timings (a session nobody used again is never marked revoked).
      return {
        table: 'identity.staff_sessions',
        ended:
          staffIdleMinutes === null
            ? sql<Date>`t.revoked_at`
            : sql<Date>`COALESCE(t.revoked_at, t.last_seen_at + make_interval(mins => ${staffIdleMinutes}))`,
      }
    case 'expired_customer_sessions':
      return {
        table: 'identity.customer_sessions',
        ended: sql<Date>`LEAST(t.expires_at, t.revoked_at, t.last_seen_at + make_interval(mins => t.idle_minutes))`,
      }
    case 'expired_guest_links':
      return { table: 'identity.project_access_grants', ended: sql<Date>`LEAST(t.expires_at, t.revoked_at)` }
    case 'expired_staff_links':
      return {
        table: 'identity.staff_links',
        ended: sql<Date>`LEAST(t.expires_at, t.consumed_at, t.invalidated_at)`,
      }
    case 'expired_receipt_links':
      return { table: 'intake.receipt_capabilities', ended: sql<Date>`LEAST(t.expires_at, t.revoked_at)` }
    case 'expired_upload_links':
      return { table: 'intake.upload_capabilities', ended: sql<Date>`LEAST(t.expires_at, t.consumed_at)` }
    case 'expired_verification_codes':
      return {
        table: 'identity.verification_codes',
        ended: sql<Date>`LEAST(t.expires_at, t.consumed_at, t.superseded_at)`,
      }
  }
}

/**
 * The months whose rows of each kind all ended at least the configured days ago, one entry per kind and month. The
 * entry's id is derived from the kind and the month, so a repeated run finds the same entry and opens nothing twice.
 */
export const findExpiredBatches: Finder = async (tx, p) => {
  const out: Candidate[] = []
  for (const kind of EXPIRED_KINDS) {
    if (out.length >= p.limit) break
    const k = expiredKind(kind, p.staffIdleMinutes)
    const ends = sql<Date>`((b.month + interval '1 month' + make_interval(days => ${p.days ?? 0}))
                            AT TIME ZONE ${p.zone}::text)`
    const id = sql<string>`md5(${kind}::text || ':' || to_char(b.month, 'YYYY-MM'))::uuid`
    const { rows } = await sql<Candidate>`
      SELECT ${kind}::text AS record_type, ${id} AS record_id,
             (to_char(b.month, 'YYYY-MM') || ' (' || b.n::text || ')') AS record_ref, NULL::uuid AS project_id,
             (b.month AT TIME ZONE ${p.zone}::text) AS started_at, ${ends} AS ends_at, b.n::int AS record_count
        FROM (SELECT date_trunc('month', ${k.ended} AT TIME ZONE ${p.zone}::text) AS month, count(*) AS n
                FROM ${sql.table(k.table)} t
               WHERE ${k.ended} <= ${p.now}::timestamptz
               GROUP BY 1) b
       WHERE ${ends} <= ${p.now}::timestamptz
         AND NOT EXISTS (SELECT 1 FROM privacy.retention_reviews rv WHERE rv.record_type = ${kind} AND rv.record_id = ${id})
       ORDER BY b.month
       LIMIT ${p.limit - out.length}`.execute(tx)
    out.push(...rows)
  }
  return out
}
