// Personal packet acknowledgments and where they stand (TSK-0072; HH-DATA-08, HH-WORK-10, HH-PKT-02, HH-CHG-03,
// HH-STAFF-02, T27, T44, T51, ENT-Acknowledgment, ENT-JobPacket, ENT-StaffUser, OWN-DEC-121, RULE-SAFETY-GATES,
// RULE-SERVER-AUTHZ).
// - A worker acknowledges the job's latest packet version themselves: the caller is the worker, never an ID a client
//   sends, and only while the caller is assigned to the job (an active confirmed reservation on a live visit, inside
//   its access window). The database refuses any other insert too (migration 0064).
// - Where an acknowledgment stands is read from the server's records only: the person's latest acknowledgment, whether
//   the database recorded its end (a critical version, the end of the assignment, a disabled account; once each), and
//   the job's critical versions (a critical version ends it even before that end is recorded). Nobody inherits one.
// - An acknowledgment never releases a hold and is not the Start Job gate: TSK-0073 reads packetAcknowledgment()
//   inside the start transaction next to every other check (RULE-SAFETY-GATES).
import type { Db, Tx } from '@handyhub/db'
import {
  acknowledgmentState,
  packetChanges,
  type AcknowledgmentInvalidation,
  type AcknowledgmentState,
  type PacketChange,
  type PacketContent,
} from '@handyhub/domain'
import { jobAssignmentsOf } from './assignments.js'
import { refreshJobPacket, type PacketRow } from './content.js'

type Reader = Db | Tx

export type AcknowledgmentRecord = {
  id: string
  version: number
  acknowledgedAt: Date
  invalidation: { reason: AcknowledgmentInvalidation; version: number | null; invalidatedAt: Date } | null
}

export type AcknowledgmentStatus = {
  state: AcknowledgmentState
  assigned: boolean
  acknowledgment: { version: number; acknowledgedAt: Date } | null
  invalidation: AcknowledgmentRecord['invalidation']
  /** What changed from the acknowledged version to the current one (empty when it is the current one). */
  changesSince: PacketChange[]
}

/** The staff members assigned to the job right now, each once (inside their access window). */
export async function assignedNow(db: Reader, jobId: string, now = new Date()): Promise<string[]> {
  return (await assignedNowOf(db, [jobId], now)).get(jobId) ?? []
}

/** assignedNow() for several jobs in one statement, by job (TSK-0105, My job packets). */
export async function assignedNowOf(
  db: Reader,
  jobIds: readonly string[],
  now = new Date(),
): Promise<Map<string, string[]>> {
  const t = now.getTime()
  const out = new Map<string, string[]>()
  for (const [jobId, rows] of await jobAssignmentsOf(db, jobIds))
    out.set(jobId, [
      ...new Set(rows.filter((a) => a.from.getTime() <= t && t < a.to.getTime()).map((a) => a.staffUserId)),
    ])
  return out
}

/** A person's latest acknowledgment of a job, with its recorded end (null: never acknowledged). */
export async function latestAcknowledgment(
  db: Reader,
  jobId: string,
  staffUserId: string,
): Promise<AcknowledgmentRecord | null> {
  return (await latestAcknowledgmentsOf(db, [jobId], staffUserId)).get(jobId) ?? null
}

/** latestAcknowledgment() of one person for several jobs in one statement, by job (TSK-0105, My job packets). */
export async function latestAcknowledgmentsOf(
  db: Reader,
  jobIds: readonly string[],
  staffUserId: string,
): Promise<Map<string, AcknowledgmentRecord>> {
  const out = new Map<string, AcknowledgmentRecord>()
  if (jobIds.length === 0) return out
  const rows = await db
    .selectFrom('work.job_packet_acknowledgments as a')
    .leftJoin('work.job_packet_acknowledgment_invalidations as i', 'i.acknowledgment_id', 'a.id')
    .select([
      'a.job_id',
      'a.id',
      'a.version',
      'a.acknowledged_at',
      'i.reason',
      'i.version as invalidated_by_version',
      'i.invalidated_at',
    ])
    .distinctOn('a.job_id')
    .where('a.job_id', 'in', [...jobIds])
    .where('a.staff_user_id', '=', staffUserId)
    .orderBy('a.job_id')
    .orderBy('a.acknowledged_at', 'desc')
    .orderBy('a.version', 'desc')
    .execute()
  for (const r of rows)
    out.set(r.job_id, {
      id: r.id,
      version: r.version,
      acknowledgedAt: r.acknowledged_at,
      invalidation:
        r.reason && r.invalidated_at
          ? {
              reason: r.reason as AcknowledgmentInvalidation,
              version: r.invalidated_by_version ?? null,
              invalidatedAt: r.invalidated_at,
            }
          : null,
    })
  return out
}

async function criticalVersions(db: Reader, jobId: string): Promise<number[]> {
  return (await criticalVersionsOf(db, [jobId])).get(jobId) ?? []
}

/** The critical packet versions of several jobs in one statement, by job (a job with none is left out). */
export async function criticalVersionsOf(db: Reader, jobIds: readonly string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  if (jobIds.length === 0) return out
  const rows = await db
    .selectFrom('work.job_packets')
    .select(['job_id', 'version'])
    .where('job_id', 'in', [...jobIds])
    .where('critical', '=', true)
    .execute()
  for (const r of rows) out.set(r.job_id, [...(out.get(r.job_id) ?? []), r.version])
  return out
}

/** Where one person's acknowledgment of the job's packet stands against `row` (the latest version). */
export async function acknowledgmentStatus(
  db: Reader,
  row: PacketRow,
  staffUserId: string,
  assigned: boolean,
  critical?: number[],
): Promise<AcknowledgmentStatus> {
  const latest = await latestAcknowledgment(db, row.jobId, staffUserId)
  const state = acknowledgmentState({
    assigned,
    latest: latest ? { version: latest.version, invalidated: latest.invalidation !== null } : null,
    criticalVersions: critical ?? (await criticalVersions(db, row.jobId)),
  })
  let changesSince: PacketChange[] = []
  if (latest && latest.version !== row.version) {
    const before = await db
      .selectFrom('work.job_packets')
      .select('content')
      .where('job_id', '=', row.jobId)
      .where('version', '=', latest.version)
      .executeTakeFirst()
    if (before) changesSince = packetChanges(before.content as unknown as PacketContent, row.content)
  }
  return {
    state,
    assigned,
    acknowledgment: latest ? { version: latest.version, acknowledgedAt: latest.acknowledgedAt } : null,
    invalidation: latest?.invalidation ?? null,
    changesSince,
  }
}

/** Every worker assigned to the job now, with where their own acknowledgment stands (names from the packet). */
export async function teamAcknowledgments(db: Reader, row: PacketRow, now = new Date()) {
  const assigned = await assignedNow(db, row.jobId, now)
  const names = new Map(row.content.assignment.visits.flatMap((v) => v.team.map((w) => [w.staffUserId, w.name])))
  const critical = await criticalVersions(db, row.jobId)
  const out = []
  for (const staffUserId of assigned.sort()) {
    const s = await acknowledgmentStatus(db, row, staffUserId, true, critical)
    out.push({
      staffUserId,
      name: names.get(staffUserId) ?? null,
      state: s.state,
      version: s.acknowledgment?.version ?? null,
      acknowledgedAt: s.acknowledgment?.acknowledgedAt ?? null,
      invalidation: s.invalidation ? s.invalidation.reason : null,
    })
  }
  return out
}

/**
 * For the Start Job gate (TSK-0073) and anything else that must know whether a worker has reviewed the job's current
 * packet: brings the packet up to date first (in the caller's transaction when given one), then answers where the
 * worker's own acknowledgment stands. `satisfied` only when it stands for a version no critical change followed.
 */
export async function packetAcknowledgment(db: Db | Tx, jobId: string, staffUserId: string, now = new Date()) {
  const row = await refreshJobPacket(db, jobId, now)
  if (!row) return null
  const assigned = (await assignedNow(db, jobId, now)).includes(staffUserId)
  const status = await acknowledgmentStatus(db, row, staffUserId, assigned)
  return { packetVersion: row.version, ...status, satisfied: status.state === 'acknowledged' }
}

/**
 * Records the caller's own acknowledgment of `row` (the latest version, under the job's packet lock), or returns
 * the standing one of that version: acknowledging the same version twice adds nothing.
 */
export async function acknowledge(
  tx: Tx,
  input: { row: PacketRow; staffUserId: string; requestId: string },
): Promise<{ id: string; version: number; acknowledgedAt: Date; created: boolean }> {
  const { row } = input
  const standing = await latestAcknowledgment(tx, row.jobId, input.staffUserId)
  if (standing && standing.version === row.version && standing.invalidation === null)
    return { id: standing.id, version: standing.version, acknowledgedAt: standing.acknowledgedAt, created: false }
  const inserted = await tx
    .insertInto('work.job_packet_acknowledgments')
    .values({
      packet_id: row.id,
      job_id: row.jobId,
      version: row.version,
      staff_user_id: input.staffUserId,
      kind: 'packet',
      content_sha256: row.contentSha256,
      scope_version: row.content.scope.version,
      sop_version_ids: JSON.stringify(
        row.content.sop.packages.flatMap((p) => (p.sopVersionId ? [p.sopVersionId] : [])),
      ),
      request_id: input.requestId.slice(0, 200),
    })
    .returning(['id', 'version', 'acknowledged_at'])
    .executeTakeFirstOrThrow()
  return { id: inserted.id, version: inserted.version, acknowledgedAt: inserted.acknowledged_at, created: true }
}
