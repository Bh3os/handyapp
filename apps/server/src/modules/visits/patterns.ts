// Repeated short-notice cancellations and no-shows flag the customer's next estimate booking for the Owner's review
// (TSK-0140; OWN-DEC-163 7, FACT-CANCELLATION-RULES, ENT-QueueItem, RULE-HUMAN-REVIEW).
// - Cancellations and no-shows are recorded where they happen (work.visit_changes with the notice; work.visit_outcomes
//   'no_access' and 'customer_absent', PROPOSED as the no-shows). When an estimate visit is booked (staff confirmation
//   or the customer's choice of an offered window), the customer's short-notice cancellations (@handyhub/domain
//   isShortNoticeCancellation) and no-shows of the last cancellation.repeat_review.withinDays calendar days in the
//   business zone are counted across their projects; at cancellation.repeat_review.count or more, the Owner's
//   cancellation_pattern_review item opens for the booked visit. It never charges a fee and never blocks the booking.
// - cancellation.repeat_review is NOT CONFIGURED (no number is decided, OQ-CANCELLATION-RULES-DETAILS): nothing is
//   counted or flagged until the Owner sets it. The item resolves when the visit is no longer booked (migration 0115).
import type { Tx } from '@handyhub/db'
import { addLocalDays, isShortNoticeCancellation, isWorkVisitPurpose, localDateOf } from '@handyhub/domain'
import { sql } from 'kysely'
import { loadConfig } from '../../platform/config/index.js'
import { openQueueItem } from '../queue/items.js'

export const PATTERN_REVIEW_QUEUE_TYPE = 'cancellation_pattern_review'
/** PROPOSED: the visit outcomes that count as the customer failing to attend (OWN-DEC-163 7). */
export const NO_SHOW_OUTCOMES = ['no_access', 'customer_absent'] as const

/** The customer's short-notice cancellations and no-shows since `since` (a local date in the business zone). */
export async function cancellationPattern(
  tx: Tx,
  customerId: string,
  since: string,
  zone: string,
  noticeHours: number,
): Promise<{ shortNotice: number; noShows: number }> {
  const cancellations = await tx
    .selectFrom('work.visit_changes as c')
    .innerJoin('crm.projects as p', 'p.id', 'c.project_id')
    .select(['c.initiator', 'c.notice_minutes', 'c.outcome'])
    .where('p.customer_id', '=', customerId)
    .where('c.kind', '=', 'canceled')
    .where(sql<boolean>`(c.changed_at AT TIME ZONE ${zone})::date >= ${since}::date`)
    .execute()
  const shortNotice = cancellations.filter((c) =>
    isShortNoticeCancellation(
      { initiator: c.initiator, noticeMinutes: c.notice_minutes ?? 0, kind: c.outcome ?? '' },
      { noticeHours },
    ),
  ).length
  const noShows = await tx
    .selectFrom('work.visit_outcomes as o')
    .innerJoin('crm.projects as p', 'p.id', 'o.project_id')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('p.customer_id', '=', customerId)
    .where('o.kind', 'in', [...NO_SHOW_OUTCOMES])
    .where(sql<boolean>`(o.recorded_at AT TIME ZONE ${zone})::date >= ${since}::date`)
    .executeTakeFirst()
  return { shortNotice, noShows: Number(noShows?.n ?? 0) }
}

/** Called when a visit is booked: an estimate booking of a customer with the repeat pattern opens the Owner's item. */
export async function flagCancellationPattern(tx: Tx, v: { id: string; purpose: string }): Promise<boolean> {
  if (isWorkVisitPurpose(v.purpose)) return false
  const config = await loadConfig(tx)
  const review = config.get('cancellation.repeat_review')
  const rules = config.get('cancellation.rules')
  const zone = config.get('business.timezone')
  if (review.state !== 'CONFIGURED' || rules.state !== 'CONFIGURED' || zone.state !== 'CONFIGURED') return false
  const visit = await tx
    .selectFrom('work.visits as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select(['v.project_id', 'p.customer_id', 'p.reference'])
    .where('v.id', '=', v.id)
    .executeTakeFirstOrThrow()
  const now = (await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)).rows[0]?.now ?? new Date()
  const since = addLocalDays(localDateOf(new Date(now), zone.value.zone), -review.value.withinDays)
  const found = await cancellationPattern(tx, visit.customer_id, since, zone.value.zone, rules.value.noticeHours)
  if (found.shortNotice + found.noShows < review.value.count) return false
  await openQueueItem(tx, {
    type: PATTERN_REVIEW_QUEUE_TYPE,
    subjectId: v.id,
    reason: 'repeat_short_notice_cancellations',
    projectId: visit.project_id,
    reference: visit.reference,
    status: 'confirmed',
  })
  return true
}
