// The Owner's dismissal of a reservation flag (TSK-0151; OWN-DEC-200 H7, OWN-DEC-123, HH-STAFF-07, RULE-SAFETY-GATES).
// - A working-hours or equipment flag is discretionary: the Owner may keep the appointment as it is, with a written
//   reason (work.reservation_flag_dismissals, migration 0098). Every open flag of that cause on the reservation is
//   dismissed at once; the visit's action-queue item is updated or resolved by the database in the same transaction.
// - A time-off flag (employee protection) or a disabled-account flag (PROPOSED: legal) is a mandatory restriction: the
//   server refuses it (CONFLICT MANDATORY_RESTRICTION, @handyhub/domain mandatoryRestriction) and so does the database.
// - A dismissal changes nothing else: the reservation, the visit, the Start Work gate and every hold stay as they are.
//   A later availability change that flags the reservation again is a new flag.
// - Every read of the flags (the staff record, the visit record, the board, the day's capacity) leaves out the
//   dismissed ones (`notDismissed`).
import type { Tx } from '@handyhub/db'
import { mandatoryRestriction } from '@handyhub/domain'
import { sql, type SqlBool } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** A filter of `work.reservation_flags` (unaliased) to the flags the Owner has not dismissed. */
export const notDismissed = sql<SqlBool>`NOT EXISTS (SELECT 1 FROM work.reservation_flag_dismissals d
  WHERE d.flag_id = work.reservation_flags.id)`

/**
 * Dismisses every open flag of one cause on a reservation (the policy already checked the Owner). Refusals: NOT_FOUND,
 * CONFLICT (MANDATORY_RESTRICTION: never waived by an override; FLAG_NOT_OPEN: nothing of this cause to dismiss;
 * RESERVATION_ENDED).
 */
export async function dismissFlags(
  tx: Tx,
  input: { actorId: string; reservationId: string; cause: string; reason: string },
): Promise<{ visitId: string; dismissed: number }> {
  const refusal = mandatoryRestriction(input.cause)
  if (refusal !== null)
    throw new ApiError('CONFLICT', {
      fieldErrors: [
        {
          ...field('body.cause', 'MANDATORY_RESTRICTION'),
          message: `A mandatory ${refusal.replace('_', '-')} restriction is never waived by an override.`,
        },
      ],
    })
  if (input.reason.trim() === '')
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.reason', 'required')] })
  const r = await tx
    .selectFrom('work.reservations')
    .select(['id', 'visit_id', 'ended_at', 'ends_at'])
    .where('id', '=', input.reservationId)
    .forUpdate()
    .executeTakeFirst()
  if (!r) throw new ApiError('NOT_FOUND')
  if (r.ended_at !== null || new Date(r.ends_at).getTime() <= Date.now())
    throw new ApiError('CONFLICT', { fieldErrors: [field('reservation', 'RESERVATION_ENDED')] })
  const open = await tx
    .selectFrom('work.reservation_flags')
    .select('id')
    .where('reservation_id', '=', r.id)
    .where('cause', '=', input.cause)
    .where(notDismissed)
    .execute()
  if (!open.length) throw new ApiError('CONFLICT', { fieldErrors: [field('body.cause', 'FLAG_NOT_OPEN')] })
  await tx
    .insertInto('work.reservation_flag_dismissals')
    .values(open.map((f) => ({ flag_id: f.id, dismissed_by: input.actorId, reason: input.reason.trim() })))
    .execute()
  return { visitId: r.visit_id, dismissed: open.length }
}

/** The open (not dismissed) flags of a reservation, by cause. */
export async function openFlagsOf(tx: Tx, reservationId: string): Promise<string[]> {
  const rows = await tx
    .selectFrom('work.reservation_flags')
    .select('cause')
    .where('reservation_id', '=', reservationId)
    .where(notDismissed)
    .orderBy('flagged_at')
    .execute()
  return [...new Set(rows.map((f) => f.cause))]
}
