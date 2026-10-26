// The Owner's escalation number and the recorded escalation actions (TSK-0129; HH-PKT-09, HH-WORK-13,
// FACT-SVC-ESCALATION-PATH, ENT-StaffUser, OWN-DEC-172, OWN-DEC-208, RULE-NO-INVENTED-FACTS, RULE-SAFETY-GATES).
// - The number every packet and Stop Work shows is the one an active Owner account entered in its own staff profile
//   (identity.staff_escalation_phones, 0099); PROPOSED: with more than one active Owner holding a number, the one
//   entered last. None: NOT CONFIGURED, and Call Owner says to call 911 in an emergency. Nothing waits for it.
// - A tap (Call Owner, Call 911, "I could not reach the Owner") is recorded once per phone UUID; the call itself is a
//   phone link and never waits for this record. A visit or report the server cannot place on the job is left out,
//   never refused: a record of an emergency call is never lost over a detail.
import type { Db, Tx } from '@handyhub/db'
import { displayOwnerPhone, ownerContactOf, type EscalationAction, type OwnerContact } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'

type Reader = Db | Tx

/** The Owner's escalation contact in force: the number an active Owner entered, or NOT CONFIGURED. */
export async function ownerEscalationContact(db: Reader): Promise<OwnerContact> {
  const row = await db
    .selectFrom('identity.staff_escalation_phones as p')
    .innerJoin('identity.staff_users as u', 'u.id', 'p.staff_user_id')
    .select('p.phone')
    .where('p.phone', 'is not', null)
    .where('u.status', '=', 'active')
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('identity.role_grants as g')
          .select('g.id')
          .whereRef('g.staff_user_id', '=', 'p.staff_user_id')
          .where('g.kind', '=', 'role')
          .where('g.name', '=', 'owner')
          .where('g.ended_at', 'is', null)
          .where('g.effective_from', '<=', sql<Date>`now()`),
      ),
    )
    .orderBy('p.updated_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  return ownerContactOf(row?.phone)
}

export type OwnPhone = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  /** +1 and ten digits, as stored; null while NOT CONFIGURED. */
  phone: string | null
  display: string | null
  /** The row's version (0: never entered), for If-Match. */
  version: number
  updatedAt: Date | null
}

/** The escalation number on the caller's own staff profile. */
export async function ownEscalationPhone(db: Reader, staffUserId: string): Promise<OwnPhone> {
  const row = await db
    .selectFrom('identity.staff_escalation_phones')
    .select(['phone', 'version', 'updated_at'])
    .where('staff_user_id', '=', staffUserId)
    .executeTakeFirst()
  const phone = row?.phone ?? null
  return {
    state: phone ? 'CONFIGURED' : 'NOT_CONFIGURED',
    phone,
    display: phone ? displayOwnerPhone(phone) : null,
    version: row?.version ?? 0,
    updatedAt: row?.updated_at ?? null,
  }
}

/** Enters or clears the number on the caller's own profile, at the version shown (STALE_VERSION otherwise). */
export async function setOwnEscalationPhone(
  tx: Tx,
  staffUserId: string,
  phone: string | null,
  expectedVersion: number,
): Promise<{ before: OwnPhone; after: OwnPhone }> {
  // One writer per account: the advisory lock covers the first entry, before any row exists to lock.
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`escalation_phone:${staffUserId}`}, 0))`.execute(tx)
  const before = await ownEscalationPhone(tx, staffUserId)
  if (expectedVersion !== before.version) throw new ApiError('STALE_VERSION', { current: { version: before.version } })
  if (before.version === 0)
    await tx.insertInto('identity.staff_escalation_phones').values({ staff_user_id: staffUserId, phone }).execute()
  else
    await tx
      .updateTable('identity.staff_escalation_phones')
      .set({ phone })
      .where('staff_user_id', '=', staffUserId)
      .execute()
  return { before, after: await ownEscalationPhone(tx, staffUserId) }
}

export type EscalationCallInput = {
  clientId: string
  action: EscalationAction
  visitId?: string
  reportId?: string
  deviceRecordedAt: string
}

export type EscalationCallRow = {
  client_id: string
  job_id: string
  visit_id: string | null
  report_id: string | null
  action: string
  actor_id: string
  device_recorded_at: Date
  received_at: Date
}

/**
 * Records one tap, once per phone UUID. The same UUID again answers the record already made; a UUID another account
 * or another job already used is a conflict (never a second record, never someone else's).
 */
export async function recordEscalationCall(
  tx: Tx,
  actor: StaffActor,
  job: { id: string; projectId: string },
  input: EscalationCallInput,
): Promise<{ row: EscalationCallRow; alreadyRecorded: boolean }> {
  const visit = input.visitId
    ? await tx
        .selectFrom('work.visits')
        .select('id')
        .where('id', '=', input.visitId)
        .where('job_id', '=', job.id)
        .executeTakeFirst()
    : undefined
  const report = input.reportId
    ? await tx
        .selectFrom('work.issue_reports')
        .select('id')
        .where('id', '=', input.reportId)
        .where('job_id', '=', job.id)
        .executeTakeFirst()
    : undefined
  const device = new Date(input.deviceRecordedAt)
  const inserted = await tx
    .insertInto('work.escalation_calls')
    .values({
      client_id: input.clientId,
      job_id: job.id,
      project_id: job.projectId,
      visit_id: visit?.id ?? null,
      report_id: report?.id ?? null,
      action: input.action,
      actor_id: actor.userId,
      device_recorded_at: Number.isNaN(device.getTime()) ? new Date() : device,
    })
    .onConflict((oc) => oc.column('client_id').doNothing())
    .returningAll()
    .executeTakeFirst()
  if (inserted) return { row: inserted, alreadyRecorded: false }
  const existing = await tx
    .selectFrom('work.escalation_calls')
    .selectAll()
    .where('client_id', '=', input.clientId)
    .executeTakeFirstOrThrow()
  if (existing.actor_id !== actor.userId || existing.job_id !== job.id || existing.action !== input.action)
    throw new ApiError('CONFLICT', {
      fieldErrors: [{ field: 'body.clientId', code: 'ESCALATION_CALL_EXISTS', message: '' }],
    })
  return { row: existing, alreadyRecorded: true }
}

/** A job's recorded escalation actions, newest first: all for the Owner, the caller's own for everyone else. */
export async function escalationCalls(db: Reader, actor: StaffActor, jobId: string) {
  let q = db
    .selectFrom('work.escalation_calls as c')
    .innerJoin('identity.staff_users as u', 'u.id', 'c.actor_id')
    .select([
      'c.client_id',
      'c.action',
      'c.visit_id',
      'c.report_id',
      'c.actor_id',
      'u.display_name',
      'c.device_recorded_at',
      'c.received_at',
    ])
    .where('c.job_id', '=', jobId)
  if (!actor.roles.includes('owner')) q = q.where('c.actor_id', '=', actor.userId)
  const rows = await q.orderBy('c.device_recorded_at', 'desc').orderBy('c.client_id').limit(200).execute()
  return rows.map((r) => ({
    clientId: r.client_id,
    action: r.action as EscalationAction,
    visitId: r.visit_id,
    reportId: r.report_id,
    recordedBy: { id: r.actor_id, name: r.display_name },
    deviceRecordedAt: r.device_recorded_at.toISOString(),
    receivedAt: r.received_at.toISOString(),
  }))
}
