// Service registry (TSK-0019; HH-SVC-01, HH-SVC-02, OWN-DEC-84). The 26 services come from seed/services.json, which
// tools/import-services.mjs generates from the SVC-* nodes. syncServices() loads it in every environment (it is
// business configuration, not synthetic data): a new service is inserted, changed content becomes a new immutable
// version, and unchanged content is left alone. The owner's later decisions (public status, approval, scheduling mode)
// are never reset by a sync.
//
// Quality-reviewed content (TSK-0132, OWN-DEC-180): a seed whose content carries the review stamp of OWN-DEC-180 and
// whose public status is `published` is approved by that decision. When the sync writes such a version (a new service
// or changed content), it records the approval on the version (approved_by OWN-DEC-180, approved_at now) and
// publishes it: public_status `published`, published_version the new version. No per-service owner approval is
// needed (OWN-DEC-180 replaces it for OWN-DEC-84 and OWN-DEC-81). A version without the stamp is never approved or
// published by a sync, and an unchanged version is left as it is.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Db, Tx } from './client.js'
import { PACKAGE_ROOT } from './migrate.js'

export const SERVICES_SEED_FILE = path.join(PACKAGE_ROOT, 'seed', 'services.json')

export const SERVICE_CATEGORIES = ['cleaning', 'drywall', 'home_improvement', 'painting'] as const
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]
export const PUBLIC_STATUSES = ['draft', 'staging', 'published'] as const
export type PublicStatus = (typeof PUBLIC_STATUSES)[number]
export type SchedulingMode = 'standard' | 'inquiry_only'
export type RegistryEnvironment = 'local' | 'ci' | 'staging' | 'production'

/** One entry of seed/services.json. */
export interface ServiceSeed {
  id: string
  code: string
  category: ServiceCategory
  slug: string
  name: string
  aliases: string[]
  staffLabel: { en: string; es: string }
  publicStatus: PublicStatus
  schedulingMode: SchedulingMode
  /** Page content: the reviewed content of TSK-0132 with its review stamp, or `{ description: null }` for a draft. */
  content: ServiceSeedContent
  intake: { guideInputs: string[]; specIntake: string[] }
  estimateRoute: 'online_or_site_visit'
  sopId: string
  homeAgeLimits: boolean
  source: string | null
}

/** The review stamp of the quality review that approves a version for publication (OWN-DEC-180). */
export const QUALITY_REVIEW_DECISION = 'OWN-DEC-180'

export type ServiceSeedContent = {
  description: string | null
  review?: { decision: string; task: string; reviewedOn: string }
  [part: string]: unknown
}

/** Whether a seed's content passed the quality review of OWN-DEC-180 and is to be published. */
export function isQualityReviewed(s: Pick<ServiceSeed, 'publicStatus' | 'content'>): boolean {
  return (
    s.publicStatus === 'published' &&
    s.content.review?.decision === QUALITY_REVIEW_DECISION &&
    typeof s.content.description === 'string'
  )
}

export function loadServiceSeed(file = SERVICES_SEED_FILE): ServiceSeed[] {
  return (JSON.parse(readFileSync(file, 'utf8')) as { services: ServiceSeed[] }).services
}

/** Stable JSON: keys sorted at every level, so the hash depends on content only. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

/** The hash of a service's versioned content (not its identity, status or scheduling mode). */
export function contentHash(s: ServiceSeed): string {
  const versioned = {
    name: s.name,
    aliases: s.aliases,
    staffLabel: s.staffLabel,
    content: s.content,
    intake: s.intake,
    estimateRoute: s.estimateRoute,
    sopId: s.sopId,
    homeAgeLimits: s.homeAgeLimits,
    source: s.source,
  }
  return createHash('sha256').update(stable(versioned)).digest('hex')
}

export type SyncResult = { created: string[]; versioned: string[]; unchanged: string[] }

function versionRow(s: ServiceSeed, version: number) {
  const approval = isQualityReviewed(s) ? { approved_at: new Date(), approved_by: QUALITY_REVIEW_DECISION } : {}
  return {
    ...approval,
    service_id: s.id,
    version,
    name: s.name,
    aliases: s.aliases,
    staff_label_en: s.staffLabel.en,
    staff_label_es: s.staffLabel.es,
    content: JSON.stringify(s.content),
    intake: JSON.stringify(s.intake),
    estimate_route: s.estimateRoute,
    sop_id: s.sopId,
    home_age_limits: s.homeAgeLimits,
    source: s.source,
    content_hash: contentHash(s),
  }
}

/** Loads the registry in one transaction. Codes never change: a seed whose code differs for an existing ID fails. */
export async function syncServices(db: Db | Tx, services: readonly ServiceSeed[]): Promise<SyncResult> {
  const result: SyncResult = { created: [], versioned: [], unchanged: [] }
  const run = async (trx: Tx | Db) => {
    for (const s of services) {
      const existing = await trx
        .selectFrom('catalog.services as s')
        .innerJoin('catalog.service_versions as v', (j) =>
          j.onRef('v.service_id', '=', 's.id').onRef('v.version', '=', 's.current_version'),
        )
        .select(['s.code', 's.current_version', 'v.content_hash'])
        .where('s.id', '=', s.id)
        .forUpdate('s')
        .executeTakeFirst()
      if (!existing) {
        const reviewed = isQualityReviewed(s)
        await trx
          .insertInto('catalog.services')
          .values({
            id: s.id,
            code: s.code,
            category: s.category,
            slug: s.slug,
            // Only a quality-reviewed version is published; anything else starts as a draft.
            public_status: reviewed ? 'published' : s.publicStatus === 'published' ? 'draft' : s.publicStatus,
            published_version: reviewed ? 1 : null,
            scheduling_mode: s.schedulingMode,
            current_version: 1,
          })
          .execute()
        await trx.insertInto('catalog.service_versions').values(versionRow(s, 1)).execute()
        result.created.push(s.id)
        continue
      }
      if (existing.code !== s.code) throw new Error(`${s.id}: the service code never changes (${existing.code})`)
      await trx
        .updateTable('catalog.services')
        .set({ category: s.category, slug: s.slug })
        .where('id', '=', s.id)
        .where((eb) => eb.or([eb('category', '<>', s.category), eb('slug', '<>', s.slug)]))
        .execute()
      if (existing.content_hash === contentHash(s)) {
        result.unchanged.push(s.id)
        continue
      }
      const next = existing.current_version + 1
      await trx.insertInto('catalog.service_versions').values(versionRow(s, next)).execute()
      await trx
        .updateTable('catalog.services')
        .set(
          isQualityReviewed(s)
            ? { current_version: next, public_status: 'published', published_version: next }
            : { current_version: next },
        )
        .where('id', '=', s.id)
        .execute()
      result.versioned.push(s.id)
    }
  }
  if (db.isTransaction) await run(db)
  else await db.transaction().execute(run)
  return result
}

/** A service as the public websites see it: identity and approved public content only. */
export interface PublicService {
  id: string
  code: string
  category: string
  slug: string
  name: string
  version: number
  description: string | null
}

/**
 * The services a public website may show (HH-CUS-02, OWN-DEC-84, OWN-DEC-180). Production: only published services,
 * with their published version, and only when that version carries its approval (the quality review of OWN-DEC-180,
 * or an earlier owner approval). Staging, local and ci: services shown on staging or published, with their current
 * version. A draft is absent everywhere.
 */
export async function publicServices(db: Db | Tx, environment: RegistryEnvironment): Promise<PublicService[]> {
  const production = environment === 'production'
  const rows = await db
    .selectFrom('catalog.services as s')
    .innerJoin('catalog.service_versions as v', (j) =>
      j
        .onRef('v.service_id', '=', 's.id')
        .on((eb) => eb('v.version', '=', eb.ref(production ? 's.published_version' : 's.current_version'))),
    )
    .select(['s.id', 's.code', 's.category', 's.slug', 'v.name', 'v.version', 'v.content'])
    .where('s.public_status', 'in', production ? ['published'] : ['staging', 'published'])
    .$if(production, (q) => q.where('v.approved_at', 'is not', null))
    .orderBy('s.id')
    .execute()
  return rows.map(({ content, ...r }) => ({
    ...r,
    description: (content as { description?: string | null } | null)?.description ?? null,
  }))
}

/**
 * Whether the public site serves the page of the service with this slug (TSK-0021, TSK-0132; HH-CUS-02, OWN-DEC-84,
 * OWN-DEC-180): the same rule as publicServices(). Production: only a published service whose published version
 * carries its approval. Staging, local and ci: a
 * service shown on staging or published. A draft, or a slug that names no service, has no page.
 */
export async function isPublicServiceSlug(
  db: Db | Tx,
  environment: RegistryEnvironment,
  slug: string,
): Promise<boolean> {
  const production = environment === 'production'
  const row = await db
    .selectFrom('catalog.services as s')
    .leftJoin('catalog.service_versions as v', (j) =>
      j.onRef('v.service_id', '=', 's.id').onRef('v.version', '=', 's.published_version'),
    )
    .select('s.id')
    .where('s.slug', '=', slug)
    .where('s.public_status', 'in', production ? ['published'] : ['staging', 'published'])
    .$if(production, (q) => q.where('s.published_version', 'is not', null).where('v.approved_at', 'is not', null))
    .executeTakeFirst()
  return row !== undefined
}

/** Every service with its current version, for staff screens, the request router and dispatch. */
export async function registryServices(db: Db | Tx) {
  return db
    .selectFrom('catalog.services as s')
    .innerJoin('catalog.service_versions as v', (j) =>
      j.onRef('v.service_id', '=', 's.id').onRef('v.version', '=', 's.current_version'),
    )
    .select([
      's.id',
      's.code',
      's.category',
      's.slug',
      's.public_status',
      's.scheduling_mode',
      's.in_launch_set',
      'v.version',
      'v.name',
      'v.staff_label_en',
      'v.staff_label_es',
      'v.intake',
      'v.estimate_route',
      'v.sop_id',
      'v.home_age_limits',
    ])
    .orderBy('s.id')
    .execute()
}

/**
 * Whether work for a service may be scheduled automatically as fully qualified work. An inquiry-only service never
 * may (HH-SVC-02). A standard service still needs the per-job checks (Hold / Ready, holds, the Start Job gate); this
 * answers only the service-level question and never makes work startable by itself.
 */
export function canAutoSchedule(service: { scheduling_mode: string; in_launch_set: boolean }): boolean {
  return service.in_launch_set && service.scheduling_mode === 'standard'
}
