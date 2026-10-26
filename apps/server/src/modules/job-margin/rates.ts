// The labor cost rate the Owner enters per worker (TSK-0131; OWN-DEC-189, OWN-DEC-69, OWN-DEC-188, HH-FIN-17,
// HH-FIN-20, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ). Migration 0116 keeps the records true.
// - A rate is integer cents per hour from a local date (business time zone), with the employee burden per hour where
//   the Owner knows it (null: not known). No rate exists until the Owner enters one: no default, no payroll. A later
//   entry replaces the rate from its own date; the earlier stays for the visits before it (rateOn).
// - Only the Owner reads or enters rates (labor_rate.manage); the job cost report shows the cost each one gives.
import type { Db, Tx } from '@handyhub/db'
import { laborRateProblem, rateOn, type LaborRate } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'

type Reader = Db | Tx

const dateText = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const invalid = (field: string, code: string) =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })

/** The rates of some workers, oldest entry first (a later entry wins a tie of dates). */
export async function laborRatesOf(db: Reader, staffUserIds: readonly string[]): Promise<LaborRate[]> {
  const want = [...new Set(staffUserIds)]
  if (!want.length) return []
  const rows = await db
    .selectFrom('finance.labor_cost_rates')
    .select(['staff_user_id', 'effective_on', 'rate_cents', 'burden_cents'])
    .where('staff_user_id', 'in', want)
    .orderBy('seq')
    .execute()
  return rows.map((r) => ({
    staffUserId: r.staff_user_id,
    effectiveOn: dateText(r.effective_on),
    rateCents: r.rate_cents,
    burdenCents: r.burden_cents,
  }))
}

export type RateInput = {
  staffUserId: string
  effectiveOn: string
  rateCents: number
  burdenCents: number | null
  reason: string
}

/** The Owner enters a worker's rate from a date (the database accepts it only from a live Owner). */
export async function recordLaborRate(tx: Tx, actor: StaffActor, input: RateInput) {
  const problem = laborRateProblem(input)
  if (problem === 'RATE_INVALID') throw invalid('body.rateCents', problem)
  if (problem === 'BURDEN_INVALID') throw invalid('body.burdenCents', problem)
  const who = await tx
    .selectFrom('identity.staff_users')
    .select('id')
    .where('id', '=', input.staffUserId)
    .executeTakeFirst()
  if (!who) throw invalid('body.staffUserId', 'NOT_A_STAFF_MEMBER')
  const row = await tx
    .insertInto('finance.labor_cost_rates')
    .values({
      staff_user_id: input.staffUserId,
      effective_on: input.effectiveOn,
      rate_cents: input.rateCents,
      burden_cents: input.burdenCents,
      reason: input.reason.trim(),
      entered_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id: row.id }
}

/**
 * Every staff member who is not disabled (and anyone with a rate), with the rate in force on `today` (a local date in
 * the business zone) and each rate entry, newest first.
 */
export async function laborRatesView(db: Reader, today: string) {
  const people = await db
    .selectFrom('identity.staff_users as u')
    .select(['u.id', 'u.display_name', 'u.status'])
    .where((eb) =>
      eb.or([
        eb('u.status', '<>', 'disabled'),
        eb.exists(
          eb.selectFrom('finance.labor_cost_rates as r').select('r.id').whereRef('r.staff_user_id', '=', 'u.id'),
        ),
      ]),
    )
    .orderBy('u.display_name')
    .orderBy('u.id')
    .execute()
  const ids = people.map((p) => p.id)
  const roles = ids.length
    ? await db
        .selectFrom('identity.role_grants')
        .select(['staff_user_id', 'name'])
        .where('staff_user_id', 'in', ids)
        .where('kind', '=', 'role')
        .where('ended_at', 'is', null)
        .orderBy('name')
        .execute()
    : []
  const entries = ids.length
    ? await db
        .selectFrom('finance.labor_cost_rates as r')
        .leftJoin('identity.staff_users as e', 'e.id', 'r.entered_by')
        .select([
          'r.id',
          'r.staff_user_id',
          'r.effective_on',
          'r.rate_cents',
          'r.burden_cents',
          'r.reason',
          'r.entered_by',
          'r.entered_at',
          'e.display_name as entered_by_name',
        ])
        .where('r.staff_user_id', 'in', ids)
        .orderBy('r.seq', 'desc')
        .execute()
    : []
  return {
    today,
    workers: people.map((p) => {
      const own = entries.filter((e) => e.staff_user_id === p.id)
      const inForce = rateOn(
        [...own].reverse().map((e) => ({
          staffUserId: p.id,
          effectiveOn: dateText(e.effective_on),
          rateCents: e.rate_cents,
          burdenCents: e.burden_cents,
        })),
        p.id,
        today,
      )
      return {
        staffUserId: p.id,
        name: p.display_name,
        status: p.status,
        roles: roles.filter((r) => r.staff_user_id === p.id).map((r) => r.name),
        inForce: inForce
          ? { effectiveOn: inForce.effectiveOn, rateCents: inForce.rateCents, burdenCents: inForce.burdenCents }
          : null,
        rates: own.map((e) => ({
          id: e.id,
          effectiveOn: dateText(e.effective_on),
          rateCents: e.rate_cents,
          burdenCents: e.burden_cents,
          reason: e.reason,
          enteredBy: { id: e.entered_by, name: e.entered_by_name },
          enteredAt: new Date(e.entered_at).toISOString(),
        })),
      }
    }),
  }
}
export type LaborRatesView = Awaited<ReturnType<typeof laborRatesView>>
