// The correction history of a correction request (TSK-0152; OWN-DEC-201 I3, HH-PRIV-03, HH-PRIV-05, HH-DATA-09,
// RULE-SERVER-AUTHZ). "Preserve correction history where legally and operationally required. Never silently rewrite
// immutable approval, accounting, or audit records."
// - Editable records are corrected in their own screens, which keep each change with the values before and after, the
//   reason, who and when: customer and contact details (crm.record_changes, TSK-0044) and property details
//   (crm.property_changes). The request shows the changes made to the requester's customer and its properties since the
//   request was received (fields and times, never the values), up to the decision.
// - Records that are never rewritten (signed approvals, issued invoices, payments, receipts, refunds, audit entries and
//   the other protected records) are corrected only by a new entry beside them: the Owner records the record's kind and
//   reference and the correction on the request (privacy.request_corrections, append-only, audited). The record keeps
//   its content; the database refuses any change to it as before.
// - Completing a correction request needs at least one of the two (CORRECTION_NOT_RECORDED); a request with nothing to
//   correct is declined with the Owner's reason.
import type { Db, Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'

type Reader = Db | Tx

/** The kinds of record corrected by a new entry (PROPOSED list of the records the software never rewrites). */
export const CORRECTION_RECORD_KINDS = [
  'estimate_approval',
  'estimate_version',
  'invoice',
  'payment',
  'receipt',
  'refund',
  'audit_entry',
  'job_record',
  'message',
  'other',
] as const
export type CorrectionRecordKind = (typeof CORRECTION_RECORD_KINDS)[number]
export const CORRECTION_MAX = 2000
export const CORRECTION_REF_MAX = 160

export type CorrectionHistory = {
  /** Changes of editable records in their own screens since the request was received (fields only). */
  changes: { record: 'customer' | 'contact' | 'property'; fields: string[]; changedAt: string }[]
  /** Corrections recorded as new entries beside records that are never rewritten. */
  entries: {
    id: string
    recordKind: CorrectionRecordKind
    recordRef: string
    correction: string
    recordedAt: string
    recordedBy: { id: string; name: string | null }
  }[]
}

/** The correction history of one request, read now (changes up to its decision once decided). */
export async function correctionHistory(
  db: Reader,
  r: { id: string; customer_id: string; submitted_at: Date; decided_at: Date | null },
): Promise<CorrectionHistory> {
  let records = db
    .selectFrom('crm.record_changes')
    .select(['record_type', 'fields', 'changed_at'])
    .where('customer_id', '=', r.customer_id)
    .where('changed_at', '>=', r.submitted_at)
  if (r.decided_at) records = records.where('changed_at', '<=', r.decided_at)
  let properties = db
    .selectFrom('crm.property_changes as c')
    .innerJoin('crm.customer_properties as cp', 'cp.property_id', 'c.property_id')
    .select(['c.detail', 'c.changed_at'])
    .where('cp.customer_id', '=', r.customer_id)
    .where('c.changed_at', '>=', r.submitted_at)
  if (r.decided_at) properties = properties.where('c.changed_at', '<=', r.decided_at)
  const entries = await db
    .selectFrom('privacy.request_corrections as e')
    .leftJoin('identity.staff_users as u', 'u.id', 'e.recorded_by')
    .select([
      'e.id',
      'e.record_kind',
      'e.record_ref',
      'e.correction',
      'e.recorded_at',
      'e.recorded_by',
      'u.display_name',
    ])
    .where('e.privacy_request_id', '=', r.id)
    .orderBy('e.seq')
    .execute()
  const changes = [
    ...(await records.execute()).map((c) => ({
      record: c.record_type as 'customer' | 'contact',
      fields: [...c.fields],
      at: new Date(c.changed_at),
    })),
    ...(await properties.execute()).map((c) => ({
      record: 'property' as const,
      fields: [c.detail],
      at: new Date(c.changed_at),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime())
  return {
    changes: changes.map((c) => ({ record: c.record, fields: c.fields, changedAt: c.at.toISOString() })),
    entries: entries.map((e) => ({
      id: e.id,
      recordKind: e.record_kind as CorrectionRecordKind,
      recordRef: e.record_ref,
      correction: e.correction,
      recordedAt: new Date(e.recorded_at).toISOString(),
      recordedBy: { id: e.recorded_by, name: e.display_name },
    })),
  }
}

/** A correction recorded as a new entry on a correction request under review (the caller locked the request). */
export async function recordCorrection(
  tx: Tx,
  input: {
    request: { id: string; kind: string; state: string }
    recordKind: CorrectionRecordKind
    recordRef: string
    correction: string
    staffUserId: string
    requestId: string
  },
): Promise<{ id: string }> {
  const r = input.request
  if (r.kind !== 'correction')
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'kind', code: 'NOT_A_CORRECTION', message: '' }] })
  if (r.state === 'received')
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code: 'REVIEW_NOT_STARTED', message: '' }] })
  if (r.state !== 'under_review')
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code: 'ALREADY_DECIDED', message: '' }] })
  return tx
    .insertInto('privacy.request_corrections')
    .values({
      privacy_request_id: r.id,
      record_kind: input.recordKind,
      record_ref: input.recordRef.trim(),
      correction: input.correction.trim(),
      recorded_by: input.staffUserId,
      request_id: input.requestId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
}

/** Completing a correction request: at least one change or new entry is recorded. */
export function correctionRecorded(h: CorrectionHistory): ApiError | null {
  if (h.changes.length + h.entries.length > 0) return null
  return new ApiError('VALIDATION_FAILED', {
    fieldErrors: [{ field: 'corrections', code: 'CORRECTION_NOT_RECORDED', message: '' }],
  })
}
