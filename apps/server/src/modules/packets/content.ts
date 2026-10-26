// The job packet's content and its versions (TSK-0069; HH-PKT-01, HH-PKT-02, HH-PKT-07, HH-DATA-08, HH-OFF-02,
// ENT-JobPacket, OWN-DEC-121, OWN-DEC-40, RULE-NO-INVENTED-FACTS, RULE-SAFETY-GATES).
// - packetContent() builds the packet from stored records only (sections and rules in @handyhub/domain packet.ts). An
//   empty source stays empty: no window, team, detail, scope line, SOP step, hold, item or deposit state is ever made
//   up, and money never enters the packet (the scope lines keep description, quantity and unit only).
// - Never an access code: crm.access_instruction_secrets is read for the code's kind, label, confirmation and version
//   only; its sealed value is never selected. Never the address text: the address version only. The authorized site
//   contact (TSK-0147) is its version, designation and authority only.
// - refreshJobPacket() writes a new version when the content differs from the job's latest version (under a per-job
//   advisory lock, so two refreshes never race), with what changed and whether a change is critical, and returns the
//   latest version. The packet routes refresh before they answer, so a packet is never older than the request that
//   reads it; a writer that already holds a transaction (a later change-order approval, TSK-0082) calls it inside
//   its own transaction to publish the version with the change.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import {
  BLOCKING_HOLD_STATES,
  hasCriticalChange,
  OCCUPANT_DETAILS,
  PACKET_VISIT_STATES,
  packetChanges,
  SITE_ACCESS_DETAILS,
  type PacketChange,
  type PacketContent,
  type PacketDetail,
  type PacketLine,
} from '@handyhub/domain'
import { withTx } from '@handyhub/db'
import { sql } from 'kysely'
import { canonicalJson } from '../estimates/approval.js'
import { ensureLoadoutPinsOf, loadoutPackagesOf } from '../loadouts/store.js'

type Reader = Db | Tx

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString()
const hhmm = (t: string) => t.slice(0, 5)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const textOrNull = (v: unknown): string | null =>
  typeof v === 'string' ? v : v === null || v === undefined ? null : String(v)

/**
 * The scope texts a packet carries, in this order (the accepted snapshot's customer-facing lists). TSK-0082: an
 * approved change order adds its scope and its hazards, each named by the change order's reference.
 */
const SCOPE_TEXTS = [
  'assumptions',
  'exclusions',
  'customerResponsibilities',
  'dependencies',
  'scheduleAssumptions',
  'changeOrderScope',
  'changeOrderHazards',
]

/** A stored scope line with its prices left out (a packet never carries money). */
function packetLine(raw: unknown): PacketLine {
  const l = (raw ?? {}) as Record<string, unknown>
  return {
    position: typeof l['position'] === 'number' ? l['position'] : 0,
    kind: typeof l['kind'] === 'string' ? l['kind'] : 'base',
    serviceCode: textOrNull(l['serviceCode']),
    description: textOrNull(l['description']),
    quantity: textOrNull(l['quantity']),
    unit: textOrNull(l['unit']),
  }
}

/** Rows grouped by a key, each group in the rows' own order. */
function groupBy<T, K>(rows: readonly T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = out.get(k)
    if (list) list.push(r)
    else out.set(k, [r])
  }
  return out
}

/** The job's packet content now, or null when the job does not exist. */
export async function packetContent(db: Reader, jobId: string): Promise<PacketContent | null> {
  return (await packetContents(db, [jobId])).get(jobId) ?? null
}

/**
 * The packet content of several jobs now, read with a fixed number of statements whatever the number of jobs
 * (TSK-0105: My job packets brings every assigned job's packet up to date, and one set of statements per job grew
 * with the worker's schedule). Each statement reads all the jobs at once with the ordering a single job's read uses,
 * so every job's content is exactly what packetContent() gives for it alone. A job that does not exist is left out.
 */
export async function packetContents(db: Reader, jobIds: readonly string[]): Promise<Map<string, PacketContent>> {
  const out = new Map<string, PacketContent>()
  const ids = [...new Set(jobIds)]
  if (ids.length === 0) return out
  const jobs = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .innerJoin('estimating.approvals as a', 'a.id', 'j.approval_id')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select([
      'j.id',
      'j.project_id',
      'j.operational_state',
      'j.approval_id',
      'a.created_at as approved_at',
      'p.reference',
      'pr.id as property_id',
      'pr.address_version',
      'pr.property_type',
      'pr.time_zone',
    ])
    .where('j.id', 'in', ids)
    .execute()
  if (jobs.length === 0) return out
  const found = jobs.map((j) => j.id)
  const projectIds = [...new Set(jobs.map((j) => j.project_id))]
  const propertyIds = [...new Set(jobs.map((j) => j.property_id))]

  const packagesOf = groupBy(
    await db
      .selectFrom('work.work_packages as w')
      .innerJoin('catalog.services as s', 's.id', 'w.service_id')
      .leftJoin('catalog.sop_versions as v', 'v.id', 'w.sop_version_id')
      .select([
        'w.job_id',
        'w.id',
        'w.service_id',
        's.code',
        'w.position',
        'w.state',
        'w.sop_version_id',
        'v.sop_id',
        'v.version',
        'v.title',
        'v.review_state',
        // The Spanish release of the pinned version (TSK-0103): released as AI-reviewed, or pending.
        sql<string | null>`CASE WHEN v.id IS NULL THEN NULL ELSE catalog.sop_spanish_status(v.id) END`.as(
          'spanish_status',
        ),
        'v.content_sha256',
        'v.hazard_sha256',
        'v.quality_sha256',
      ])
      .where('w.job_id', 'in', found)
      .orderBy('w.position')
      .orderBy('w.id')
      .execute(),
    (p) => p.job_id,
  )

  const visitRows = await db
    .selectFrom('work.visits')
    .select([
      'job_id',
      'id',
      'number',
      'purpose',
      'state',
      'local_date',
      'window_start',
      'window_end',
      'time_zone',
      'window_version',
      'equipment',
    ])
    .where('job_id', 'in', found)
    .where('state', 'in', [...PACKET_VISIT_STATES])
    .orderBy('starts_at')
    .orderBy('number')
    .execute()
  const visitsOf = groupBy(visitRows, (v) => v.job_id)
  const visitIds = visitRows.map((v) => v.id)
  const reservationsOf = groupBy(
    visitIds.length
      ? await db
          .selectFrom('work.reservations as r')
          .leftJoin('identity.staff_users as u', 'u.id', 'r.staff_user_id')
          .leftJoin('work.equipment as e', 'e.id', 'r.equipment_id')
          .select([
            'r.visit_id',
            'r.resource',
            'r.staff_user_id',
            'r.role',
            'u.display_name',
            'r.equipment_id',
            'e.name',
          ])
          .where('r.visit_id', 'in', visitIds)
          .where('r.kind', '=', 'confirmed')
          .where('r.ended_at', 'is', null)
          .orderBy('r.role')
          .orderBy('u.display_name')
          .orderBy('r.staff_user_id')
          .orderBy('e.name')
          .orderBy('r.equipment_id')
          .execute()
      : [],
    (r) => r.visit_id,
  )

  const detailsOf = groupBy(
    await db
      .selectFrom('crm.property_details')
      .select(['property_id', 'detail', 'value', 'source', 'confirmed_at'])
      .where('property_id', 'in', propertyIds)
      .orderBy('detail')
      .execute(),
    (d) => d.property_id,
  )
  // Metadata only: the sealed value is never selected (HH-CRM-03, HH-OFF-02).
  const codesOf = groupBy(
    await db
      .selectFrom('crm.access_instruction_secrets')
      .select(['property_id', 'id', 'kind', 'label', 'confirmed_at', 'version'])
      .where('property_id', 'in', propertyIds)
      .where('removed_at', 'is', null)
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    (c) => c.property_id,
  )

  // TSK-0147 (OWN-DEC-196 D1): the project's authorized site contact (TSK-0126), its version, designation and
  // authority only: what the contact may authorize is an authorization restriction. Never the name, phone or email.
  const contactsOf = groupBy(
    await db
      .selectFrom('crm.project_site_contacts')
      .select(['project_id', 'version', 'designation', 'authority'])
      .where('project_id', 'in', projectIds)
      .orderBy('version', 'desc')
      .execute(),
    (c) => c.project_id,
  )

  const scopesOf = groupBy(
    await db
      .selectFrom('work.job_scope_snapshots')
      .select(['job_id', 'id', 'version', 'source', 'lines', 'texts', 'selected_options', 'created_at'])
      .where('job_id', 'in', found)
      .orderBy('version')
      .execute(),
    (s) => s.job_id,
  )

  const photosOf = groupBy(
    await db
      .selectFrom('intake.photos')
      .select(['project_id', 'id', 'uploaded_at', 'uploader_kind'])
      .where('project_id', 'in', projectIds)
      .where('state', '=', 'ready')
      .where('removed_at', 'is', null)
      // Restricted incident photos are never prior evidence in a packet (HH-OFF-02 "restricted incidents").
      .where('visibility', 'in', ['internal', 'customer_shared'])
      .orderBy('uploaded_at')
      .orderBy('id')
      .execute(),
    (p) => p.project_id,
  )

  const holdsOf = groupBy(
    await db
      .selectFrom('work.holds')
      .select(['project_id', 'id', 'kind', 'category', 'scope_type', 'state', 'note', 'source', 'raised_at'])
      .where('project_id', 'in', projectIds)
      .where('state', 'in', [...BLOCKING_HOLD_STATES])
      .orderBy('raised_at')
      .orderBy('id')
      .execute(),
    (h) => h.project_id,
  )

  // TSK-0071: the loadout list pinned on each package (the items only; the confirmations live in the loadout).
  const loadoutsOf = await loadoutPackagesOf(db, found)

  const depositOf = new Map(
    (
      await db
        .selectFrom('finance.deposit_requirements')
        .select(['job_id', 'required', 'state'])
        .where('job_id', 'in', found)
        .execute()
    ).map((d) => [d.job_id, d]),
  )

  for (const job of jobs) {
    const packages = packagesOf.get(job.id) ?? []
    const visits = visitsOf.get(job.id) ?? []
    const details = detailsOf.get(job.property_id) ?? []
    const codes = codesOf.get(job.property_id) ?? []
    const contact = contactsOf.get(job.project_id)?.[0]
    const scopes = scopesOf.get(job.id) ?? []
    const photos = photosOf.get(job.project_id) ?? []
    const holds = holdsOf.get(job.project_id) ?? []
    const loadouts = loadoutsOf.get(job.id) ?? []
    const deposit = depositOf.get(job.id)
    const scope = scopes[scopes.length - 1]
    const texts = (scope?.texts ?? {}) as Record<string, unknown>
    const detail = (names: readonly string[]): PacketDetail[] =>
      names.flatMap((name) => {
        const d = details.find((x) => x.detail === name)
        return d ? [{ detail: d.detail, value: d.value, source: d.source, confirmedAt: iso(d.confirmed_at) }] : []
      })
    const team = (visitId: string) =>
      (reservationsOf.get(visitId) ?? [])
        .filter((r) => r.resource === 'worker' && r.staff_user_id)
        .map((r) => ({ staffUserId: r.staff_user_id as string, name: r.display_name, role: r.role ?? 'member' }))
        .sort((a, b) => (a.role === b.role ? 0 : a.role === 'lead' ? -1 : 1))

    out.set(job.id, {
      identity: {
        projectId: job.project_id,
        projectReference: job.reference,
        jobId: job.id,
        jobState: job.operational_state,
        services: packages.map((p) => ({
          workPackageId: p.id,
          serviceId: p.service_id,
          serviceCode: p.code,
          position: p.position,
          state: p.state,
        })),
      },
      schedule: {
        visits: visits.map((v) => ({
          visitId: v.id,
          number: v.number,
          purpose: v.purpose,
          state: v.state,
          localDate: v.local_date,
          windowStart: hhmm(v.window_start),
          windowEnd: hhmm(v.window_end),
          timeZone: v.time_zone,
          windowVersion: v.window_version,
        })),
      },
      assignment: { visits: visits.map((v) => ({ visitId: v.id, number: v.number, team: team(v.id) })) },
      site_access: {
        propertyId: job.property_id,
        addressVersion: job.address_version,
        propertyType: job.property_type,
        timeZone: job.time_zone,
        details: detail(SITE_ACCESS_DETAILS),
        accessCodes: codes.map((c) => ({
          id: c.id,
          kind: c.kind,
          label: c.label,
          confirmedAt: iso(c.confirmed_at),
          version: c.version,
        })),
        siteContact: contact
          ? { version: contact.version, designation: contact.designation, authority: [...contact.authority] }
          : null,
      },
      occupants: { details: detail(OCCUPANT_DETAILS) },
      scope: {
        snapshotId: scope?.id ?? null,
        version: scope?.version ?? null,
        source: scope?.source ?? null,
        createdAt: scope ? iso(scope.created_at) : null,
        lines: (Array.isArray(scope?.lines) ? (scope.lines as unknown[]) : []).map(packetLine),
        texts: Object.fromEntries(SCOPE_TEXTS.map((k) => [k, strings(texts[k])])),
        selectedOptions: [...(scope?.selected_options ?? [])],
        history: scopes.map((s) => ({ version: s.version, source: s.source, createdAt: iso(s.created_at) })),
      },
      evidence: {
        photos: photos.map((p) => ({ id: p.id, uploadedAt: iso(p.uploaded_at), uploaderKind: p.uploader_kind })),
      },
      sop: {
        packages: packages.map((p) => ({
          workPackageId: p.id,
          serviceId: p.service_id,
          serviceCode: p.code,
          state: p.sop_version_id ? 'pinned' : 'not_configured',
          sopVersionId: p.sop_version_id,
          sopId: p.sop_id,
          version: p.version,
          title: p.title,
          reviewState: p.review_state,
          spanishStatus: p.spanish_status,
          contentSha256: p.content_sha256,
          hazardSha256: p.hazard_sha256,
          qualitySha256: p.quality_sha256,
        })),
      },
      holds: {
        holds: holds.map((h) => ({
          holdId: h.id,
          kind: h.kind,
          category: h.category,
          scopeType: h.scope_type,
          state: h.state,
          note: h.note,
          source: h.source,
          raisedAt: iso(h.raised_at),
        })),
      },
      resources: {
        visits: visits.map((v) => ({
          visitId: v.id,
          number: v.number,
          equipment: (reservationsOf.get(v.id) ?? [])
            .filter((r) => r.resource === 'equipment' && r.equipment_id)
            .map((r) => ({ equipmentId: r.equipment_id as string, name: r.name ?? '' })),
          requested: [...(v.equipment ?? [])],
        })),
        loadout: loadouts.map((l) => ({
          workPackageId: l.workPackageId,
          serviceCode: l.serviceCode,
          state: l.pin ? ('pinned' as const) : ('not_configured' as const),
          loadoutVersionId: l.pin?.loadoutVersionId ?? null,
          version: l.pin?.version ?? null,
          contentSha256: l.pin?.contentSha256 ?? null,
          items: (l.pin?.content.groups ?? []).flatMap((g) =>
            g.items.map((i) => ({ key: i.key, group: g.heading, name: i.name, criticality: i.criticality })),
          ),
        })),
      },
      dependencies: {
        approvalId: job.approval_id,
        approvedAt: iso(job.approved_at),
        deposit: deposit ? { required: deposit.required, state: deposit.state } : null,
      },
    })
  }
  return out
}

export type PacketRow = {
  id: string
  jobId: string
  projectId: string
  version: number
  content: PacketContent
  contentSha256: string
  changes: PacketChange[]
  critical: boolean
  generatedAt: Date
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const PACKET_COLUMNS = [
  'id',
  'job_id',
  'project_id',
  'version',
  'content',
  'content_sha256',
  'changes',
  'critical',
  'generated_at',
] as const

function toRow(r: {
  id: string
  job_id: string
  project_id: string
  version: number
  content: unknown
  content_sha256: string
  changes: unknown
  critical: boolean
  generated_at: Date
}): PacketRow {
  return {
    id: r.id,
    jobId: r.job_id,
    projectId: r.project_id,
    version: r.version,
    content: r.content as PacketContent,
    contentSha256: r.content_sha256,
    changes: r.changes as PacketChange[],
    critical: r.critical,
    generatedAt: r.generated_at,
  }
}

/** One stored version of a job's packet (null: no such version). */
export async function packetVersion(db: Reader, jobId: string, version: number): Promise<PacketRow | null> {
  const r = await db
    .selectFrom('work.job_packets')
    .select(PACKET_COLUMNS)
    .where('job_id', '=', jobId)
    .where('version', '=', version)
    .executeTakeFirst()
  return r ? toRow(r) : null
}

/** Stored versions of several jobs' packets, keyed `<jobId>:<version>` (pairs that do not exist are left out). */
export async function packetVersionsOf(
  db: Reader,
  wanted: readonly { jobId: string; version: number }[],
): Promise<Map<string, PacketRow>> {
  const out = new Map<string, PacketRow>()
  if (wanted.length === 0) return out
  const rows = await db
    .selectFrom('work.job_packets')
    .select(PACKET_COLUMNS)
    .where((eb) => eb.or(wanted.map((w) => eb.and([eb('job_id', '=', w.jobId), eb('version', '=', w.version)]))))
    .execute()
  for (const r of rows) out.set(`${r.job_id}:${r.version}`, toRow(r))
  return out
}

/** The job's latest stored version (null: none yet). */
export async function latestPacket(db: Reader, jobId: string): Promise<PacketRow | null> {
  return (await latestPackets(db, [jobId])).get(jobId) ?? null
}

/** The latest stored version of each job's packet, in one statement (a job with none is left out). */
export async function latestPackets(db: Reader, jobIds: readonly string[]): Promise<Map<string, PacketRow>> {
  const out = new Map<string, PacketRow>()
  if (jobIds.length === 0) return out
  const rows = await db
    .selectFrom('work.job_packets')
    .select(PACKET_COLUMNS)
    .distinctOn('job_id')
    .where('job_id', 'in', [...jobIds])
    .orderBy('job_id')
    .orderBy('version', 'desc')
    .execute()
  for (const r of rows) out.set(r.job_id, toRow(r))
  return out
}

/**
 * Brings the job's packet up to date with its records and returns the latest version: a new version when the content
 * changed (or the first one), else the existing latest version. Null when the job does not exist. Joins the caller's
 * transaction when given one.
 */
export async function refreshJobPacket(db: Db | Tx, jobId: string, now = new Date()): Promise<PacketRow | null> {
  return (await refreshJobPackets(db, [jobId], now)).get(jobId) ?? null
}

/**
 * refreshJobPacket() for several jobs in one transaction with a fixed number of statements (TSK-0105, My job
 * packets): the same per-job advisory locks (taken in job order, so two refreshes never wait on each other in a
 * cycle), the same loadout pins, contents, comparison and new versions. A job that does not exist is left out.
 */
export async function refreshJobPackets(
  db: Db | Tx,
  jobIds: readonly string[],
  now = new Date(),
): Promise<Map<string, PacketRow>> {
  const ids = [...new Set(jobIds)].sort()
  if (ids.length === 0) return new Map()
  return withTx(db, async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(k, 0))
      FROM unnest(${ids.map((id) => `work.job_packet:${id}`)}::text[]) AS k`.execute(tx)
    // TSK-0071: a package of a service with a loadout version gets it pinned before the packet names it.
    await ensureLoadoutPinsOf(tx, ids)
    const contents = await packetContents(tx, ids)
    const latest = await latestPackets(tx, [...contents.keys()])
    const out = new Map<string, PacketRow>()
    const fresh = []
    for (const [jobId, content] of contents) {
      const digest = sha256(canonicalJson(content))
      const last = latest.get(jobId) ?? null
      if (last && last.contentSha256 === digest) {
        out.set(jobId, last)
        continue
      }
      const changes = packetChanges(last?.content ?? null, content)
      fresh.push({
        job_id: jobId,
        project_id: content.identity.projectId,
        version: (last?.version ?? 0) + 1,
        content: JSON.stringify(content),
        content_sha256: digest,
        changes: JSON.stringify(changes),
        critical: last ? hasCriticalChange(changes) : false,
        generated_at: now,
      })
    }
    if (fresh.length)
      for (const row of await tx.insertInto('work.job_packets').values(fresh).returning(PACKET_COLUMNS).execute())
        out.set(row.job_id, toRow(row))
    return out
  })
}
