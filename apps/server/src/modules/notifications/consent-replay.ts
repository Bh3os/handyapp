// Suppressions re-applied after a restore (TSK-0106; HH-PRIV-03 "deletions and suppressions are re-applied after any
// backup restore", HH-NFR-03, T72, HH-COM-05, HH-COM-12). A restored database loses the consent withdrawals recorded
// after its backup (a STOP, a carrier or provider opt-out, a withdrawal staff recorded): without them a text could go
// to a number that said STOP. The operator exports them from the damaged or live database (exportConsentWithdrawals,
// with the backup's time) and applies them to the restored one before the controlled resume:
// - a withdrawal the restored database already holds (same record, or re-applied before) is `present`;
// - a destination already withdrawn for that purpose is `already_withdrawn` (nothing to add);
// - otherwise the withdrawal is appended again (consent records are append-only) with its original source and safe
//   evidence, plus `restoreOf` (the original record) and `originalRecordedAt`, recorded by `system.restore`.
// PROPOSED (no owner decision covers it): only withdrawals are replayed, never an opt-in. A START or opt-in recorded
// after the backup is not restored from a file: the person opts in again. Replaying only withdrawals can never make
// a text permitted that was not, so the replay errs on the side of not texting.
// The export holds destinations (an email address or a phone number), personal data: it is kept as privately as the
// backups and deleted once the restore is complete (docs/runbooks/restore.md).
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { CONSENT_PURPOSES, currentConsent, type ConsentPurpose, type ConsentSource } from './consent.js'
import type { Channel } from './message-types.js'

export const CONSENT_REAPPLY_BY = 'system.restore'

export type ExportedWithdrawal = {
  id: string
  purpose: ConsentPurpose
  channel: Channel
  destination: string
  subjectKind: 'customer_contact' | 'staff_user' | null
  subjectId: string | null
  source: ConsentSource
  evidence: Record<string, unknown>
  recordedAt: string
}

export type WithdrawalReapplyResult = {
  id: string
  purpose: ConsentPurpose
  channel: Channel
  outcome: 'reapplied' | 'present' | 'already_withdrawn'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SOURCES: readonly ConsentSource[] = [
  'request_form',
  'portal',
  'sms_keyword',
  'provider_suppression',
  'staff_recorded',
]

/** Every consent withdrawal recorded at or after `since` (all when omitted), oldest first. */
export async function exportConsentWithdrawals(db: Db | Tx, since?: Date): Promise<ExportedWithdrawal[]> {
  let q = db
    .selectFrom('platform.consent_records')
    .select(['id', 'purpose', 'channel', 'destination', 'subject_kind', 'subject_id', 'source', 'evidence'])
    .select(sql<Date>`recorded_at`.as('recorded_at'))
    .where('granted', '=', false)
  if (since) q = q.where('recorded_at', '>=', since)
  const rows = await q.orderBy('seq').execute()
  return rows.map((r) => {
    const evidence = (typeof r.evidence === 'string' ? JSON.parse(r.evidence) : r.evidence) as Record<string, unknown>
    // A re-applied withdrawal keeps the original's identity, so exporting twice never doubles the work.
    const original = typeof evidence?.['restoreOf'] === 'string' ? (evidence['restoreOf'] as string) : null
    return {
      id: original ?? r.id,
      purpose: r.purpose as ConsentPurpose,
      channel: r.channel as Channel,
      destination: r.destination,
      subjectKind: (r.subject_kind as ExportedWithdrawal['subjectKind']) ?? null,
      subjectId: r.subject_id ?? null,
      source: r.source as ConsentSource,
      evidence: evidence ?? {},
      recordedAt: new Date(r.recorded_at).toISOString(),
    }
  })
}

/** Parses exported withdrawals; refuses anything that is not one. */
export function parseExportedWithdrawals(value: unknown): ExportedWithdrawal[] {
  if (!Array.isArray(value)) throw new Error('the consent withdrawals export is a JSON list')
  return value.map((v, i) => {
    const e = v as Record<string, unknown>
    const bad =
      typeof e['id'] !== 'string' ||
      !UUID.test(e['id']) ||
      !(CONSENT_PURPOSES as readonly unknown[]).includes(e['purpose']) ||
      (e['channel'] !== 'email' && e['channel'] !== 'sms') ||
      typeof e['destination'] !== 'string' ||
      e['destination'].length < 3 ||
      e['destination'].length > 320 ||
      !(SOURCES as readonly unknown[]).includes(e['source']) ||
      (e['subjectKind'] !== null && e['subjectKind'] !== 'customer_contact' && e['subjectKind'] !== 'staff_user') ||
      (e['subjectId'] !== null && typeof e['subjectId'] !== 'string') ||
      typeof e['evidence'] !== 'object' ||
      e['evidence'] === null ||
      Array.isArray(e['evidence']) ||
      typeof e['recordedAt'] !== 'string' ||
      Number.isNaN(Date.parse(e['recordedAt']))
    if (bad) throw new Error(`entry ${i + 1} of the consent withdrawals export is not an exported withdrawal`)
    return e as unknown as ExportedWithdrawal
  })
}

/** Applies each exported withdrawal again (see the header). Runs inside the restore's transaction. */
export async function reapplyConsentWithdrawals(
  tx: Tx,
  entries: readonly ExportedWithdrawal[],
  options: { operator?: string } = {},
): Promise<WithdrawalReapplyResult[]> {
  if (!tx.isTransaction) throw new Error('reapplyConsentWithdrawals runs inside a transaction (withTx)')
  const by = options.operator ? `${CONSENT_REAPPLY_BY}:${options.operator}`.slice(0, 200) : CONSENT_REAPPLY_BY
  const out: WithdrawalReapplyResult[] = []
  for (const e of entries) {
    const base = { id: e.id, purpose: e.purpose, channel: e.channel }
    const present = await tx
      .selectFrom('platform.consent_records')
      .select('id')
      .where((w) => w.or([w('id', '=', e.id), w(sql`evidence->>'restoreOf'`, '=', e.id)]))
      .limit(1)
      .executeTakeFirst()
    if (present) {
      out.push({ ...base, outcome: 'present' })
      continue
    }
    if ((await currentConsent(tx, e.channel, e.destination, e.purpose)) === 'withdrawn') {
      out.push({ ...base, outcome: 'already_withdrawn' })
      continue
    }
    await tx
      .insertInto('platform.consent_records')
      .values({
        purpose: e.purpose,
        channel: e.channel,
        destination: e.destination,
        subject_kind: e.subjectKind,
        subject_id: e.subjectId,
        granted: false,
        disclosure_version: null,
        source: e.source,
        evidence: JSON.stringify({ ...e.evidence, restoreOf: e.id, originalRecordedAt: e.recordedAt }),
        recorded_by: by,
      })
      .execute()
    out.push({ ...base, outcome: 'reapplied' })
  }
  return out
}
