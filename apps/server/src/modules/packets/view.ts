// The job packet as staff read it (TSK-0069; HH-PKT-01, HH-PKT-02, HH-PKT-07, HH-OFF-02, T43, T44, ENT-JobPacket,
// OWN-DEC-121, OWN-DEC-40, OWN-DEC-80, OWN-DEC-81, OWN-DEC-82, RULE-NO-INVENTED-FACTS, RULE-SAFETY-GATES).
// - One stored packet version with its freshness (version, first generated and last updated, checked now, whether it
//   is the latest) and "What changed since you reviewed this?": the changes from the version this staff member last
//   viewed to this one (none when they never viewed it: the whole packet is new to them).
// - The sections of HH-PKT-01, read from the version's content; the service address is read by the content's address
//   version (never copied into the packet), photos get short-lived signed URLs, and the SOP pre-work and completion
//   evidence and the stop-work section come from the exact SOP versions the content names (immutable, verbatim).
// - Access codes: only their kind, label and last confirmation, with the note that a code is revealed separately,
//   online, on the visit date, in the audited flow (POST .../reveal). No access code is in any packet, view or export.
// - What no record holds is said, never filled in: materials are not recorded yet (TSK-0071), no approved care notes
//   exist (OWN-DEC-81: shown only after the Owner approves them), and the Owner's escalation contact is NOT
//   CONFIGURED (FACT-SVC-ESCALATION-PATH keeps it an owner decision).
import type { Db, Tx } from '@handyhub/db'
import {
  itemText,
  packetChanges,
  type PacketChange,
  type PacketContent,
  type SopContent,
  type SopStep,
} from '@handyhub/domain'
import type { ObjectStorage } from '../../providers/index.js'
import type { PacketRow } from './content.js'

type Reader = Db | Tx

/** PROPOSED: signed photo links in a packet last 5 minutes, like request photos (PHOTO_URL_SECONDS). */
export const PACKET_PHOTO_URL_SECONDS = 300

/** The stages whose evidence is pre-work evidence, and those that make the completion preview (HH-WORK-11 order). */
const PRE_WORK_STAGES = ['site_preparation', 'setup_checks'] as const
const COMPLETION_STAGES = ['quality_checks', 'cleanup_waste', 'final_checks'] as const

export type LastViewed = { version: number; viewedAt: Date } | null

export type PacketAddress = { street: string; unit: string | null; city: string; state: string; zip: string }

/** One line of the address, as a maps app reads it. */
export const addressLine = (a: PacketAddress) =>
  [[a.street, a.unit].filter(Boolean).join(' '), a.city, `${a.state} ${a.zip}`].join(', ')

/**
 * PROPOSED (OQ-PACKET-DETAILS): the plain directions link of HH-PKT-01 opens the address in a maps app through a
 * public directions URL; nothing is sent anywhere until the worker taps it.
 */
export const directionsUrl = (a: PacketAddress) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressLine(a))}`

export async function packetAddress(db: Reader, content: PacketContent): Promise<PacketAddress | null> {
  const a = await db
    .selectFrom('crm.property_addresses')
    .select(['street', 'unit', 'city', 'state', 'zip'])
    .where('property_id', '=', content.site_access.propertyId)
    .where('address_version', '=', content.site_access.addressVersion)
    .executeTakeFirst()
  if (a) return a
  // A property recorded before address versions were kept: its current address, when it is still that version.
  const p = await db
    .selectFrom('crm.properties')
    .select(['street', 'unit', 'city', 'state', 'zip'])
    .where('id', '=', content.site_access.propertyId)
    .where('address_version', '=', content.site_access.addressVersion)
    .executeTakeFirst()
  return p ?? null
}

type EvidenceItem = {
  workPackageId: string
  serviceCode: string
  stage: string
  itemId: string
  text: string
  evidence: string[]
  line: number | null
}
type StopWorkGroup = {
  workPackageId: string
  serviceCode: string
  items: { id: string; text: string; line: number | null }[]
}

/** The pre-work evidence, the completion preview and the stop-work section of the pinned SOP versions. */
export async function sopDerived(db: Reader, content: PacketContent) {
  const ids = content.sop.packages.flatMap((p) => (p.sopVersionId ? [p.sopVersionId] : []))
  const rows = ids.length
    ? await db.selectFrom('catalog.sop_versions').select(['id', 'content']).where('id', 'in', ids).execute()
    : []
  const byId = new Map(rows.map((r) => [r.id, r.content as unknown as SopContent]))
  const preWork: EvidenceItem[] = []
  const completion: EvidenceItem[] = []
  const stopWork: StopWorkGroup[] = []
  for (const p of content.sop.packages) {
    const sop = p.sopVersionId ? byId.get(p.sopVersionId) : undefined
    if (!sop) continue
    for (const stage of sop.stages) {
      const into = (PRE_WORK_STAGES as readonly string[]).includes(stage.key)
        ? preWork
        : (COMPLETION_STAGES as readonly string[]).includes(stage.key)
          ? completion
          : null
      if (!into) continue
      for (const item of stage.items)
        if (item.kind === 'step' && item.evidence.length > 0)
          into.push({
            workPackageId: p.workPackageId,
            serviceCode: p.serviceCode,
            stage: stage.key,
            itemId: item.id,
            text: itemText(item as SopStep),
            evidence: [...item.evidence],
            line: item.line,
          })
    }
    stopWork.push({
      workPackageId: p.workPackageId,
      serviceCode: p.serviceCode,
      items: sop.stopWork.map((i) => ({ id: i.id, text: itemText(i), line: i.line })),
    })
  }
  return { preWork, completion, stopWork }
}

async function photoLinks(db: Reader, content: PacketContent, storage: ObjectStorage | null) {
  const ids = content.evidence.photos.map((p) => p.id)
  const rows =
    ids.length && storage
      ? await db
          .selectFrom('intake.photos')
          .select(['id', 'object_key'])
          .where('id', 'in', ids)
          .where('state', '=', 'ready')
          .where('removed_at', 'is', null)
          .where('visibility', 'in', ['internal', 'customer_shared'])
          .execute()
      : []
  const keys = new Map(rows.map((r) => [r.id, r.object_key]))
  const out = []
  for (const p of content.evidence.photos) {
    const key = keys.get(p.id)
    out.push({
      ...p,
      url: key && storage ? await storage.signedGetUrl(key, { expiresInSeconds: PACKET_PHOTO_URL_SECONDS }) : null,
    })
  }
  return out
}

/** The version this staff member last viewed, and when (null: never). */
export async function lastViewed(db: Reader, jobId: string, staffUserId: string): Promise<LastViewed> {
  const v = await db
    .selectFrom('work.job_packet_views')
    .select(['version', 'viewed_at'])
    .where('job_id', '=', jobId)
    .where('staff_user_id', '=', staffUserId)
    .orderBy('viewed_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst()
  return v ? { version: v.version, viewedAt: v.viewed_at } : null
}

/** What changed from the version a staff member last viewed to `row` (empty when it is that version or never viewed). */
export async function changesSinceViewed(
  db: Reader,
  row: PacketRow,
  viewed: LastViewed,
): Promise<{ fromVersion: number | null; changes: PacketChange[] }> {
  if (!viewed || viewed.version === row.version) return { fromVersion: viewed?.version ?? null, changes: [] }
  const before = await db
    .selectFrom('work.job_packets')
    .select('content')
    .where('job_id', '=', row.jobId)
    .where('version', '=', viewed.version)
    .executeTakeFirst()
  return {
    fromVersion: viewed.version,
    changes: before ? packetChanges(before.content as unknown as PacketContent, row.content) : [],
  }
}

export async function packetView(
  db: Reader,
  input: {
    row: PacketRow
    latestVersion: number
    firstGeneratedAt: Date
    viewed: LastViewed
    storage: ObjectStorage | null
    now: Date
  },
) {
  const { row, viewed } = input
  const c = row.content
  const address = await packetAddress(db, c)
  const since = await changesSinceViewed(db, row, viewed)
  const derived = await sopDerived(db, c)
  const siteContact = c.site_access.details.find((d) => d.detail === 'site_contact') ?? null
  return {
    job: {
      id: c.identity.jobId,
      projectId: c.identity.projectId,
      projectReference: c.identity.projectReference,
      jobState: c.identity.jobState,
    },
    packet: {
      id: row.id,
      version: row.version,
      contentSha256: row.contentSha256,
      generatedAt: row.generatedAt,
      critical: row.critical,
      changes: row.changes,
    },
    freshness: {
      firstGeneratedAt: input.firstGeneratedAt,
      lastUpdatedAt: row.generatedAt,
      checkedAt: input.now,
      latestVersion: input.latestVersion,
      current: row.version === input.latestVersion,
    },
    review: {
      lastViewed: viewed ? { version: viewed.version, viewedAt: viewed.viewedAt } : null,
      fromVersion: since.fromVersion,
      changes: since.changes,
      critical: since.changes.some((ch) => ch.critical),
    },
    services: c.identity.services,
    visits: c.schedule.visits.map((v) => ({
      ...v,
      team: c.assignment.visits.find((a) => a.visitId === v.visitId)?.team ?? [],
      equipment: c.resources.visits.find((r) => r.visitId === v.visitId)?.equipment ?? [],
      requested: c.resources.visits.find((r) => r.visitId === v.visitId)?.requested ?? [],
    })),
    site: {
      propertyId: c.site_access.propertyId,
      address,
      addressVersion: c.site_access.addressVersion,
      directionsUrl: address ? directionsUrl(address) : null,
      propertyType: c.site_access.propertyType,
      timeZone: c.site_access.timeZone,
      details: c.site_access.details,
      // Kind, label and last confirmation only: the code itself is revealed online, on the visit date (audited).
      accessCodes: c.site_access.accessCodes.map((a) => ({
        id: a.id,
        kind: a.kind,
        label: a.label,
        confirmedAt: a.confirmedAt,
      })),
    },
    occupants: c.occupants.details,
    scope: c.scope,
    evidence: { photos: await photoLinks(db, c, input.storage) },
    sop: { packages: c.sop.packages, preWork: derived.preWork, completion: derived.completion },
    holds: c.holds.holds,
    dependencies: {
      approvedAt: c.dependencies.approvedAt,
      deposit: c.dependencies.deposit,
      jobState: c.identity.jobState,
      blockingHolds: c.holds.holds.length,
      liveVisits: c.schedule.visits.length,
    },
    materials: { state: 'not_recorded' as const },
    careNotes: { state: 'none_approved' as const },
    communication: {
      siteContact,
      escalationContact: { state: 'not_configured' as const },
      stopWork: derived.stopWork,
    },
  }
}

export type PacketView = Awaited<ReturnType<typeof packetView>>
