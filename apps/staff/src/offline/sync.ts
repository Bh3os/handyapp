// The staff app's sync queue (TSK-0080; HH-OFF-05, HH-OFF-06, HH-OFF-07, T27, T51, T52, OWN-DEC-121).
// - Each draft the phone saved is uploaded on its own, oldest first, with the UUID the phone generated: the server
//   ingests it once however often it is resent, so retries never duplicate a timestamp.
// - A draft is "Saved on this phone" until an upload starts, "Pending upload" while uploads have not reached an
//   answer, then "Synced", "Needs review" (the server kept it for the Owner, never applied) or "Upload failed" (the
//   server refused the upload itself; the draft stays on the phone).
// - Sync retries by itself: when the connection returns, when the app opens, and every half minute while anything is
//   waiting. Without a connection or a session it stops and keeps everything; nothing unsynced is ever erased.
// - The Owner may upload what another account's phone holds (a disabled or reassigned worker's drafts): the server
//   keeps it for review only.
import { call, type Fetch } from '../api'
import type { OfflineStore, StoredDraft } from './store'

const TYPE_OF: Record<string, string> = {
  'on-my-way': 'tap_on_my_way',
  arrived: 'tap_arrived',
  finished: 'tap_finished',
}
/** Settled drafts (synced or kept for review) stay listed this long, then leave the phone. */
export const SETTLED_KEEP_MS = 12 * 3600_000
/** The event that tells screens the drafts changed (a sync ran). */
export const DRAFTS_CHANGED = 'hh-offline-drafts-changed'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The event UUID of a draft: its id, or the UUID form of a TSK-0079 draft's 32-hex request key. */
export function clientIdOf(d: StoredDraft): string | null {
  if (UUID_RE.test(d.id)) return d.id.toLowerCase()
  const h = /^staff-([0-9a-f]{32})$/i.exec(d.id)?.[1]
  return h
    ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toLowerCase()
    : null
}

/** Whose draft this is: the account that recorded it (TSK-0079 drafts: the signed-in account). */
export const ownerOf = (d: StoredDraft, signedIn: string) => d.staffUserId ?? signedIn

/** Drafts not yet on the server: what sign-out and an app update warn about (HH-OFF-07, T52). */
export const isUnsynced = (d: StoredDraft) =>
  d.state === 'saved_on_phone' || d.state === 'pending_upload' || d.state === 'failed'

export type SyncSummary = {
  synced: number
  review: number
  failed: number
  /** Still waiting (no connection, or the server could not answer). */
  waiting: number
  /** The session ended: nothing more is uploaded until someone signs in. */
  signedOut: boolean
}

type Answer = {
  clientId: string
  state: 'synchronized' | 'needs_review' | 'reviewed'
  outcome: string
  detail: string | null
}

let running: Promise<SyncSummary> | null = null

/**
 * Uploads the waiting drafts of the signed-in account (and, with `recover`, another account's drafts for the Owner's
 * review). One run at a time: a second call waits for the first.
 */
export function syncDrafts(
  store: OfflineStore,
  fetchImpl: Fetch,
  signedIn: string,
  options: { recover?: boolean; now?: () => Date } = {},
): Promise<SyncSummary> {
  if (running) return running
  running = run(store, fetchImpl, signedIn, options).finally(() => {
    running = null
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(DRAFTS_CHANGED))
  })
  return running
}

async function run(
  store: OfflineStore,
  fetchImpl: Fetch,
  signedIn: string,
  options: { recover?: boolean; now?: () => Date },
): Promise<SyncSummary> {
  const now = options.now ?? (() => new Date())
  const out: SyncSummary = { synced: 0, review: 0, failed: 0, waiting: 0, signedOut: false }
  let drafts: StoredDraft[]
  try {
    drafts = await store.listDrafts()
  } catch {
    return out
  }
  // Settled drafts leave the phone after a while: the server has them.
  for (const d of drafts)
    if (!isUnsynced(d) && d.settledAt && now().getTime() - new Date(d.settledAt).getTime() > SETTLED_KEEP_MS)
      await store.deleteDraft(d.id).catch(() => undefined)
  const queue = drafts
    .filter((d) => isUnsynced(d) && d.kind === 'tap')
    .filter((d) => (ownerOf(d, signedIn) === signedIn) !== Boolean(options.recover))
    .sort((a, b) => a.deviceRecordedAt.localeCompare(b.deviceRecordedAt))
  let stopped = false
  for (const d of queue) {
    if (stopped) {
      out.waiting++
      continue
    }
    const clientId = clientIdOf(d)
    const type = TYPE_OF[String(d.payload['tap'])]
    if (!clientId || !type || !d.visitId) {
      await store.putDraft({ ...d, state: 'failed', problem: 'NOT_UPLOADABLE' }).catch(() => undefined)
      out.failed++
      continue
    }
    const attempt = (d.attempts ?? 0) + 1
    await store.putDraft({ ...d, state: 'pending_upload', attempts: attempt }).catch(() => undefined)
    const owner = ownerOf(d, signedIn)
    const r = await call<Answer>(fetchImpl, '/staff/field-events', {
      method: 'POST',
      // One key per attempt: the event's UUID is what makes a resent event the same event.
      headers: { 'idempotency-key': `${clientId}-${attempt}` },
      body: {
        clientId,
        type,
        visitId: d.visitId,
        deviceRecordedAt: d.deviceRecordedAt,
        attempt,
        ...(owner !== signedIn ? { actorId: owner } : {}),
      },
    })
    if (r.ok) {
      const review = r.data.state !== 'synchronized'
      await store
        .putDraft({
          ...d,
          state: review ? 'needs_review' : 'synced',
          attempts: attempt,
          problem: review ? (r.data.detail ?? r.data.outcome.toUpperCase()) : null,
          settledAt: now().toISOString(),
        })
        .catch(() => undefined)
      if (review) out.review++
      else out.synced++
      continue
    }
    if (r.status === 0 || r.status >= 500 || r.status === 429) {
      // No answer: it stays "Pending upload" and the next run sends it again (the same UUID).
      out.waiting++
      stopped = true
      continue
    }
    if (r.status === 401) {
      out.waiting++
      out.signedOut = true
      stopped = true
      continue
    }
    await store
      .putDraft({ ...d, state: 'failed', attempts: attempt, problem: r.error.fieldErrors[0]?.code ?? r.error.code })
      .catch(() => undefined)
    out.failed++
  }
  return out
}

let signedInStaff: string | null = null
/** The signed-in staff member, whom a draft saved now belongs to (App sets it with the session). */
export function setSignedInStaff(id: string | null): void {
  signedInStaff = id
}
export function currentStaff(): string | null {
  return signedInStaff
}
