// The first-response clock (TSK-0043; HH-LEAD-05, OWN-DEC-115, OWN-DEC-116, OWN-DEC-125, FACT-RESPONSE-TARGET,
// FACT-HOURS, FACT-TIMEZONE, HH-DATA-06).
//
// - Started in the submission's transaction (one clock per request), with the configured target, daily hours and
//   business time zone pinned on it. While any of the three is NOT CONFIGURED the clock has no deadline: nothing is
//   guessed, and its figures read as unavailable.
// - Stopped only by a meaningful response: a meaningful customer message whose delivery succeeded (sent or delivered),
//   or a completed customer conversation staff recorded. Opening, assigning, drafting, notes, qualification, the four
//   actions themselves, the automatic receipt, codes and access links never stop it; a failed or suppressed delivery
//   leaves it running (and a delivery that fails after it was accepted starts it again).
// - Every response and failure is an append-only event; the clock row is recomputed from them (the earliest response
//   that still stands), and the new-request queue item follows it in the same transaction.
// - It is an internal target, never a customer promise: no customer or public route reads it.
import type { Db, Tx } from '@handyhub/db'
import { addBusinessMinutes, BusinessHoursError, businessMinutesBetween } from '@handyhub/domain'
import { sql } from 'kysely'
import type { Automation } from '../../platform/automation.js'
import type { Config } from '../../platform/config/index.js'
import { syncNewRequestItem } from '../queue/index.js'

/**
 * PROPOSED: the customer messages that are a meaningful staff response (HH-LEAD-05 "a reply, a published question,
 * visit options or a published decision whose delivery succeeded", plus the published estimate and the estimate-visit
 * confirmation). The receipt, codes, access links and reminders are not responses.
 */
export const MEANINGFUL_RESPONSE_MESSAGES = [
  'staff.reply',
  'question.notice',
  'estimate_visit.options',
  'estimate_visit.confirmed',
  'decision.not_a_fit',
  'estimate.ready',
] as const

export function isMeaningfulResponse(messageKey: string): boolean {
  return (MEANINGFUL_RESPONSE_MESSAGES as readonly string[]).includes(messageKey)
}

/** The outbox events the notifications module writes when a customer delivery succeeds or fails. */
export const DELIVERY_SUCCEEDED = 'message.delivery_succeeded'
export const DELIVERY_FAILED = 'message.delivery_failed'

type Pinned = {
  target_minutes: number | null
  hours_open: string | null
  hours_close: string | null
  time_zone: string | null
  config_versions: string
  due_at: Date | null
}

/** The configuration the clock starts under, and its deadline; all NULL while any value is NOT CONFIGURED. */
function pinned(config: Config, startedAt: Date): Pinned {
  const target = config.get('response.target')
  const hours = config.get('contact.hours')
  const zone = config.get('business.timezone')
  const versions = JSON.stringify({
    'response.target': target.version,
    'contact.hours': hours.version,
    'business.timezone': zone.version,
  })
  const none = { target_minutes: null, hours_open: null, hours_close: null, time_zone: null, due_at: null }
  if (target.state !== 'CONFIGURED' || hours.state !== 'CONFIGURED' || zone.state !== 'CONFIGURED')
    return { ...none, config_versions: versions }
  try {
    const due = addBusinessMinutes(startedAt, target.value.minutes, hours.value, zone.value.zone)
    return {
      target_minutes: target.value.minutes,
      hours_open: hours.value.open,
      hours_close: hours.value.close,
      time_zone: zone.value.zone,
      config_versions: versions,
      due_at: due,
    }
  } catch (e) {
    // Hours that never open, or an unknown zone: no deadline is invented.
    if (e instanceof BusinessHoursError) return { ...none, config_versions: versions }
    throw e
  }
}

/** Starts a request's clock (idempotent: a second start leaves the first). Runs in the submission's transaction. */
export async function startResponseClock(
  tx: Tx,
  input: { requestId: string; projectId: string; receivedAt: Date },
  config: Config,
): Promise<void> {
  await tx
    .insertInto('intake.response_clocks')
    .values({
      request_id: input.requestId,
      project_id: input.projectId,
      started_at: input.receivedAt,
      ...pinned(config, input.receivedAt),
    })
    .onConflict((oc) => oc.column('request_id').doNothing())
    .execute()
}

type Stop = { at: Date; kind: 'response_sent' | 'conversation_recorded'; ref: string }

/** The earliest response that still stands: a conversation, or a delivery whose latest event is a success. */
async function currentStop(tx: Tx, requestId: string): Promise<Stop | null> {
  const events = await tx
    .selectFrom('intake.response_events')
    .select(['kind', 'ref', 'occurred_at'])
    .where('request_id', '=', requestId)
    .orderBy('seq')
    .execute()
  const latest = new Map<string, (typeof events)[number]>()
  for (const e of events) latest.set(`${e.kind === 'conversation_recorded' ? 'c' : 'd'}:${e.ref}`, e)
  let stop: Stop | null = null
  for (const e of latest.values()) {
    if (e.kind === 'response_failed') continue
    const kind = e.kind as Stop['kind']
    if (!stop || e.occurred_at.getTime() < stop.at.getTime()) stop = { at: e.occurred_at, kind, ref: e.ref }
  }
  return stop
}

/**
 * Recomputes the clock from its events, under its row lock, and brings the new-request queue item in line. Returns
 * whether the clock is stopped now, or null when the request has no clock.
 */
export async function recomputeResponseClock(tx: Tx, requestId: string): Promise<{ stopped: boolean } | null> {
  const clock = await tx
    .selectFrom('intake.response_clocks')
    .selectAll()
    .where('request_id', '=', requestId)
    .forUpdate()
    .executeTakeFirst()
  if (!clock) return null
  const stop = await currentStop(tx, requestId)
  // A response recorded before the clock started (a skewed time) counts from the start.
  const at = stop ? new Date(Math.max(stop.at.getTime(), clock.started_at.getTime())) : null
  const measured =
    at && clock.due_at && clock.hours_open && clock.hours_close && clock.time_zone
      ? {
          business_minutes: businessMinutesBetween(
            clock.started_at,
            at,
            { open: clock.hours_open, close: clock.hours_close },
            clock.time_zone,
          ),
          within_target: at.getTime() <= clock.due_at.getTime(),
        }
      : { business_minutes: null, within_target: null }
  const next = {
    stopped_at: at,
    stop_kind: stop?.kind ?? null,
    stop_ref: stop?.ref ?? null,
    ...measured,
  }
  const same =
    (clock.stopped_at?.getTime() ?? null) === (next.stopped_at?.getTime() ?? null) &&
    clock.stop_kind === next.stop_kind &&
    clock.stop_ref === next.stop_ref &&
    clock.business_minutes === next.business_minutes &&
    clock.within_target === next.within_target
  if (!same)
    await tx
      .updateTable('intake.response_clocks')
      .set({ ...next, version: sql<number>`version + 1`, updated_at: sql<Date>`now()` })
      .where('request_id', '=', requestId)
      .execute()
  await syncNewRequestItem(tx, requestId)
  return { stopped: next.stopped_at !== null }
}

/** Records one response event (idempotent per request, kind, reference and time) and recomputes the clock. */
export async function recordResponseEvent(
  tx: Tx,
  input: {
    requestId: string
    kind: 'response_sent' | 'response_failed' | 'conversation_recorded'
    ref: string
    messageKey?: string | null
    occurredAt: Date
  },
): Promise<{ stopped: boolean } | null> {
  await tx
    .insertInto('intake.response_events')
    .values({
      request_id: input.requestId,
      kind: input.kind,
      ref: input.ref,
      message_key: input.kind === 'conversation_recorded' ? null : (input.messageKey ?? null),
      occurred_at: input.occurredAt,
    })
    .onConflict((oc) => oc.columns(['request_id', 'kind', 'ref', 'occurred_at']).doNothing())
    .execute()
  return recomputeResponseClock(tx, input.requestId)
}

/** The request a delivery's record points at: the request itself, or the project's request (PROPOSED contract). */
async function requestOfRecord(tx: Tx, recordType: string | null, recordId: string | null): Promise<string | null> {
  if (!recordId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) return null
  if (recordType === 'request') {
    const r = await tx.selectFrom('intake.requests').select('id').where('id', '=', recordId).executeTakeFirst()
    return r?.id ?? null
  }
  if (recordType === 'project') {
    const r = await tx
      .selectFrom('intake.requests')
      .select('id')
      .where('project_id', '=', recordId)
      .orderBy('submitted_at')
      .limit(1)
      .executeTakeFirst()
    return r?.id ?? null
  }
  return null
}

/**
 * The clock's consumer of delivery outcomes (HH-AUTO-01): a meaningful customer message whose delivery succeeded
 * stops the clock of the request it is about; a failure is recorded and leaves (or puts) the clock running. The
 * delivery row is read as it is now, and an outcome it no longer has is dropped; the event's time is when the provider
 * took the message.
 */
export function responseClockAutomation(): Automation {
  return {
    name: 'requests.response_clock',
    trigger: { kind: 'event', eventTypes: [DELIVERY_SUCCEEDED, DELIVERY_FAILED] },
    identity: 'system.requests',
    inputs: { description: 'the delivery id and the time of its outcome; the delivery row as it is now', version: 1 },
    idempotency: 'one response event per request, kind, delivery and time; the clock is recomputed from the events',
    effect: 'records the response or failure and stops or restarts the first-response clock',
    retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'request.response_clock_updated' },
    handle: async ({ tx, job }) => {
      const deliveryId = job.target.id
      const at = typeof job.payload['at'] === 'string' ? new Date(job.payload['at']) : null
      if (!deliveryId || !at || Number.isNaN(at.getTime())) return 'cancelled'
      // FOR SHARE waits for a delivery transition still in flight (it holds the row FOR UPDATE), so the state read here
      // stays current until this job commits.
      const d = await tx
        .selectFrom('platform.message_deliveries')
        .select(['id', 'message_key', 'audience', 'record_type', 'record_id', 'state'])
        .where('id', '=', deliveryId)
        .forShare()
        .executeTakeFirst()
      if (!d || d.audience !== 'customer' || !isMeaningfulResponse(d.message_key)) return 'cancelled'
      // Each transition writes its outcome event with the new state, so the job of the latest transition always agrees
      // with the delivery. A job the delivery has moved past (retried or run out of order) records nothing: a stale
      // success after a bounce would otherwise stop the clock on a failed delivery (OWN-DEC-116).
      const succeeded = d.state === 'sent' || d.state === 'delivered'
      if ((job.eventType === DELIVERY_SUCCEEDED) !== succeeded) return 'cancelled'
      const requestId = await requestOfRecord(tx, d.record_type, d.record_id)
      if (!requestId) return 'cancelled'
      const r = await recordResponseEvent(tx, {
        requestId,
        kind: job.eventType === DELIVERY_SUCCEEDED ? 'response_sent' : 'response_failed',
        ref: d.id,
        messageKey: d.message_key,
        occurredAt: at,
      })
      return r ? 'done' : 'cancelled'
    },
  }
}

/**
 * Customer response figures for the Owner Dashboard (OWN-DEC-125, HH-FIN-18), from these same records: requests
 * received in [from, to), how many have a first meaningful response, the average and median time to it in business
 * minutes, and the share answered within the target. PROPOSED definitions: the share counts requests whose outcome is
 * known (answered, or past the target unanswered); requests whose clock was NOT CONFIGURED are unavailable, never
 * zero; a figure with nothing to measure is null ("unavailable").
 */
export async function responseReport(db: Db | Tx, range: { from: Date; to: Date }, now: Date = new Date()) {
  const rows = await db
    .selectFrom('intake.response_clocks')
    .select(['request_id', 'due_at', 'stopped_at', 'business_minutes', 'within_target'])
    .where('started_at', '>=', range.from)
    .where('started_at', '<', range.to)
    .execute()
  const measurable = rows.filter((r) => r.due_at !== null)
  const answered = measurable.filter((r) => r.business_minutes !== null)
  const decided = measurable.filter((r) => r.stopped_at !== null || (r.due_at as Date).getTime() <= now.getTime())
  const within = answered.filter((r) => r.within_target === true).length
  const minutes = answered.map((r) => r.business_minutes as number).sort((a, b) => a - b)
  const median =
    minutes.length === 0
      ? null
      : minutes.length % 2
        ? (minutes[(minutes.length - 1) / 2] as number)
        : Math.round(((minutes[minutes.length / 2 - 1] as number) + (minutes[minutes.length / 2] as number)) / 2)
  return {
    received: rows.length,
    notConfigured: rows.length - measurable.length,
    answered: answered.length,
    awaiting: measurable.length - answered.length,
    withinTarget: within,
    /** Basis points (0-10000) of decided requests answered within the target; null when none is decided. */
    withinTargetShareBps: decided.length ? Math.round((within * 10_000) / decided.length) : null,
    averageBusinessMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
    medianBusinessMinutes: median,
  }
}
