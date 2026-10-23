// The minimal offline copy of an assigned job packet (TSK-0079; HH-OFF-01, HH-OFF-02, T28, T49, OWN-DEC-121,
// OWN-DEC-171).
// - Taken only for the caller's own assigned jobs with a visit today or later (My Day's "my job packets"), from the
//   packet the server answered: the server already leaves out every access code (only their kind and label), the
//   address outside the visit day and anything a worker may not see. The copy also drops what it does not need: the
//   access-code entries themselves, the short-lived photo links and the deposit state (finance).
// - "Ready for offline use" is said only once the copy was written and read back with the same version and content.
// - It expires at the end of the last assigned visit's local service day (OWN-DEC-171: the address and site contact
//   go with it) and is purged then, when the job is no longer assigned to the caller, and at sign-out.
import { addLocalDays, resolveLocalTime } from '@handyhub/domain'
import type { OfflineStore, StoredPacket } from './store'

/** The packet fields the offline copy reads (a structural slice of JobPacketView). */
type PacketLike = {
  job: { id: string; projectReference: string }
  packet: { version: number; contentSha256: string }
  site: { accessCodes: unknown[] }
  evidence: { photos: { url: string | null }[] }
  dependencies: { deposit: unknown }
}

/** The copy an offline device keeps: access-code entries, photo links and the deposit (finance) left out. */
export function offlineView<V extends PacketLike>(view: V): V {
  const copy = JSON.parse(JSON.stringify(view)) as V
  copy.site.accessCodes = []
  copy.evidence.photos = copy.evidence.photos.map((p) => ({ ...p, url: null }))
  copy.dependencies.deposit = null
  return copy
}

/** The end of a local service day: midnight that starts the next day, in the visit's zone. */
export function endOfLocalDay(date: string, zone: string): Date | null {
  try {
    const next = resolveLocalTime(addLocalDays(date, 1), '00:00', zone)
    // A midnight that repeats ends the day at its first reading; one the clocks skip ends it an hour later at most.
    if (next.kind === 'unique') return next.at.instant
    if (next.kind === 'repeated') return next.earlier.instant
    const late = resolveLocalTime(addLocalDays(date, 1), next.resumesAt, zone)
    return late.kind === 'unique' ? late.at.instant : null
  } catch {
    return null
  }
}

/** When an offline copy expires: the end of the latest assigned visit's service day not yet over; null for none. */
export function copyExpiresAt(visits: readonly { localDate: string; timeZone: string }[], now: Date): Date | null {
  let latest: Date | null = null
  for (const v of visits) {
    const end = endOfLocalDay(v.localDate, v.timeZone)
    if (end && end.getTime() > now.getTime() && (!latest || end.getTime() > latest.getTime())) latest = end
  }
  return latest
}

export type OfflineState =
  | { state: 'ready'; version: number; savedAt: string; expiresAt: string }
  | { state: 'not_stored' }
  | { state: 'failed' }

/**
 * Stores the offline copy of one packet and verifies it: written, then read back with the same version, content
 * digest and view. Only then is it ready for offline use; anything else is not.
 */
export async function storeOfflineCopy<V extends PacketLike>(
  store: OfflineStore,
  view: V,
  visits: readonly { localDate: string; timeZone: string }[],
  sops: Record<string, unknown> = {},
  now = new Date(),
): Promise<OfflineState> {
  const expires = copyExpiresAt(visits, now)
  if (!expires) return { state: 'not_stored' }
  try {
    const record: StoredPacket = {
      jobId: view.job.id,
      projectReference: view.job.projectReference,
      version: view.packet.version,
      contentSha256: view.packet.contentSha256,
      savedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      view: offlineView(view),
      sops,
    }
    await store.putPacket(record)
    const back = await store.getPacket(record.jobId)
    if (
      !back ||
      back.version !== record.version ||
      back.contentSha256 !== record.contentSha256 ||
      JSON.stringify(back.view) !== JSON.stringify(record.view) ||
      JSON.stringify(back.sops) !== JSON.stringify(record.sops)
    )
      return { state: 'failed' }
    return { state: 'ready', version: back.version, savedAt: back.savedAt, expiresAt: back.expiresAt }
  } catch {
    // An answer that is not a packet, or storage that refuses it: never called ready.
    return { state: 'failed' }
  }
}

/** Removes every copy that expired or whose job is no longer assigned to the caller; answers how many went. */
export async function purgeOfflineCopies(store: OfflineStore, assignedJobIds: readonly string[], now = new Date()) {
  let removed = 0
  for (const p of await store.listPackets()) {
    if (assignedJobIds.includes(p.jobId) && new Date(p.expiresAt).getTime() > now.getTime()) continue
    await store.deletePacket(p.jobId)
    removed++
  }
  return removed
}

/** The offline copy of a job, if one is still valid now (an expired copy is purged, never shown). */
export async function readOfflineCopy(store: OfflineStore, jobId: string, now = new Date()) {
  try {
    const p = await store.getPacket(jobId)
    if (!p) return null
    if (new Date(p.expiresAt).getTime() <= now.getTime()) {
      await store.deletePacket(jobId)
      return null
    }
    return p
  } catch {
    return null
  }
}
