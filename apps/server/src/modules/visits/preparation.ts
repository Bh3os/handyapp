// Reviewed service-specific default preparation instructions for window offers (TSK-0146; OWN-DEC-194 B7, HH-SCH-11,
// HH-CUS-02, OWN-DEC-180, OWN-DEC-84, OWN-DEC-98, RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ).
// - A service's default is text the Owner approved for it (service_content.approve), kept as versions in
//   catalog.preparation_defaults (migration 0123): the reviewed "Getting ready" steps of the service's approved page
//   version (TSK-0132, OWN-DEC-180) taken as they are, or the Owner's edit of them; the Owner may also remove it.
//   Nothing is approved for a service until the Owner does so: every service starts NOT CONFIGURED, and no default
//   text is ever written by the software (RULE-NO-INVENTED-FACTS).
// - An offer starts from the defaults of its visit's services (the job's work packages for a work visit; the
//   project's work packages, else the request's services, for an estimate visit): the offer form is prefilled with
//   them (visitPreparation). Staff may change the text; what they send is what the offer keeps, with its basis
//   against the defaults in force (default, edited, staff, none) and the default versions it started from.
// - Every text a customer would read is checked against the unsafe-instruction rules (@handyhub/domain
//   preparationProblems, PROPOSED): an offer's instructions when the offer is saved and again when it is published,
//   and a default when the Owner approves it. A refusal names each rule (UNSAFE_<RULE>).
// PROPOSED details: OQ-PREPARATION-DEFAULT-DETAILS.
import type { Db, Tx } from '@handyhub/db'
import {
  PREPARATION_MAX_LENGTH,
  preparationBasis,
  preparationProblems,
  servicePagePreparation,
  unsafeCode,
  visitPreparationText,
  type PreparationBasis,
} from '@handyhub/domain'
import { scopeIncludesProject, type DataScope, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { staffNames } from './visits.js'

type Reader = Db | Tx
type StaffRef = { id: string; name: string | null }

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** The unsafe-instruction refusals of a text, one per rule, under the given field. */
export function unsafeProblems(text: string | null | undefined, at: string): FieldError[] {
  return [...new Set(preparationProblems(text).map((p) => unsafeCode(p.rule)))].map((code) => field(at, code))
}

type DefaultRow = {
  id: string
  service_id: string
  version: number
  text: string | null
  basis: string
  service_version: number | null
  reason: string | null
  approved_by: string
  approved_at: Date
}

/** The latest default version of each of these services (a removal counts: it is the version in force). */
async function defaultsInForce(db: Reader, serviceIds: readonly string[]): Promise<Map<string, DefaultRow>> {
  if (serviceIds.length === 0) return new Map()
  const rows = await db
    .selectFrom('catalog.preparation_defaults')
    .selectAll()
    .distinctOn('service_id')
    .where('service_id', 'in', [...serviceIds])
    .orderBy('service_id')
    .orderBy('version', 'desc')
    .execute()
  return new Map(rows.map((r) => [r.service_id, r as DefaultRow]))
}

type VisitFacts = { project_id: string; job_id: string | null }

/**
 * The services of a visit, in order, with the name of the service version they were taken at: a visit of a job, the
 * job's work packages; otherwise the project's work packages, or the request's services before there are any.
 */
async function visitServices(db: Reader, v: VisitFacts): Promise<{ serviceId: string; name: string }[]> {
  const packages = await db
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.service_versions as s', (j) =>
      j.onRef('s.service_id', '=', 'w.service_id').onRef('s.version', '=', 'w.service_version'),
    )
    .select(['w.service_id', 's.name'])
    .where('w.project_id', '=', v.project_id)
    .$if(v.job_id !== null, (q) => q.where('w.job_id', '=', v.job_id as string))
    .orderBy('w.position')
    .execute()
  if (packages.length || v.job_id !== null) return packages.map((p) => ({ serviceId: p.service_id, name: p.name }))
  const requested = await db
    .selectFrom('intake.request_services as rs')
    .innerJoin('intake.requests as r', 'r.id', 'rs.request_id')
    .innerJoin('catalog.service_versions as s', (j) =>
      j.onRef('s.service_id', '=', 'rs.service_id').onRef('s.version', '=', 'rs.service_version'),
    )
    .select(['rs.service_id', 's.name'])
    .where('r.project_id', '=', v.project_id)
    .orderBy('r.submitted_at')
    .orderBy('rs.position')
    .execute()
  const seen = new Set<string>()
  return requested
    .filter((r) => !seen.has(r.service_id) && seen.add(r.service_id))
    .map((r) => ({ serviceId: r.service_id, name: r.name }))
}

export type VisitPreparation = {
  /** The text the offer starts from; null while none of the visit's services has an approved default. */
  text: string | null
  /** The default versions it combines (their ids are kept with the offer). */
  defaultIds: string[]
  /** Each service of the visit with its approved default version, or NOT CONFIGURED. */
  services: { serviceId: string; name: string; state: 'approved' | 'not_configured'; version: number | null }[]
}

/** The defaults of a visit's services in force now, combined (visitPreparationText). */
export async function visitPreparation(db: Reader, v: VisitFacts): Promise<VisitPreparation> {
  const services = await visitServices(db, v)
  const defaults = await defaultsInForce(
    db,
    services.map((s) => s.serviceId),
  )
  const shown = services.map((s) => {
    const d = defaults.get(s.serviceId)
    return d?.text ? { ...s, d } : { ...s, d: null }
  })
  return {
    text: visitPreparationText(shown.map((s) => ({ name: s.name, text: s.d?.text ?? null }))),
    defaultIds: shown.flatMap((s) => (s.d ? [s.d.id] : [])),
    services: shown.map((s) => ({
      serviceId: s.serviceId,
      name: s.name,
      state: s.d ? 'approved' : 'not_configured',
      version: s.d?.version ?? null,
    })),
  }
}

/** The default a visit's offer form starts from, for staff who may offer its windows. */
export async function visitPreparationDefault(db: Reader, scope: DataScope, visitId: string) {
  const v = await db
    .selectFrom('work.visits')
    .select(['id', 'project_id', 'job_id', 'state'])
    .where('id', '=', visitId)
    .executeTakeFirst()
  if (!v || !scopeIncludesProject(scope, v.project_id)) throw new ApiError('NOT_FOUND')
  const p = await visitPreparation(db, v)
  return {
    visitId: v.id,
    text: p.text,
    tooLong: (p.text?.length ?? 0) > PREPARATION_MAX_LENGTH,
    services: p.services,
  }
}

export type OfferPreparation = {
  instructions: string | null
  basis: PreparationBasis
  defaultIds: string[]
  /** The unsafe-instruction refusals (field body.preparationInstructions). */
  problems: FieldError[]
}

/** What an offer keeps of the instructions staff sent: the text, its basis against the defaults and its problems. */
export async function offerPreparation(
  db: Reader,
  v: VisitFacts,
  sent: string | null | undefined,
): Promise<OfferPreparation> {
  const instructions = sent?.trim() || null
  const d = await visitPreparation(db, v)
  const basis = preparationBasis(instructions, d.text)
  return {
    instructions,
    basis,
    defaultIds: basis === 'default' || basis === 'edited' ? d.defaultIds : [],
    problems: unsafeProblems(instructions, 'body.preparationInstructions'),
  }
}

export type DefaultView = {
  id: string
  version: number
  text: string | null
  basis: string
  serviceVersion: number | null
  reason: string | null
  approvedBy: StaffRef
  approvedAt: string
}

const defaultView = (r: DefaultRow, names: Map<string, StaffRef>): DefaultView => ({
  id: r.id,
  version: r.version,
  text: r.text,
  basis: r.basis,
  serviceVersion: r.service_version,
  reason: r.reason,
  approvedBy: names.get(r.approved_by) ?? { id: r.approved_by, name: null },
  approvedAt: new Date(r.approved_at).toISOString(),
})

/** Each service's approved page version (published and approved) with its reviewed "Getting ready" steps. */
async function reviewedPages(db: Reader, serviceId?: string) {
  const rows = await db
    .selectFrom('catalog.services as s')
    .innerJoin('catalog.service_versions as v', (j) =>
      j
        .onRef('v.service_id', '=', 's.id')
        .on(sql<boolean>`v.version = coalesce(s.published_version, s.current_version)`),
    )
    .select(['s.id', 's.code', 's.category', 'v.version', 'v.name', 'v.approved_at', 's.published_version'])
    .select(sql<unknown>`v.content -> 'preparation'`.as('preparation'))
    .$if(serviceId !== undefined, (q) => q.where('s.id', '=', serviceId as string))
    .orderBy('s.category')
    .orderBy('s.code')
    .execute()
  return rows.map((r) => {
    const steps = Array.isArray(r.preparation) ? r.preparation.filter((x): x is string => typeof x === 'string') : []
    const reviewed = r.published_version !== null && r.approved_at !== null
    return {
      serviceId: r.id,
      code: r.code,
      category: r.category,
      name: r.name,
      servicePage: reviewed ? { version: r.version, text: servicePagePreparation(steps) } : null,
    }
  })
}

/**
 * The Owner's review of the defaults: every service with the reviewed "Getting ready" steps of its approved page
 * version, the default in force (null: NOT CONFIGURED) and every earlier version, newest first.
 */
export async function preparationDefaults(db: Reader) {
  const pages = await reviewedPages(db)
  const rows = (await db
    .selectFrom('catalog.preparation_defaults')
    .selectAll()
    .orderBy('service_id')
    .orderBy('version', 'desc')
    .execute()) as DefaultRow[]
  const names = await staffNames(db, [...new Set(rows.map((r) => r.approved_by))])
  return {
    services: pages.map((p) => {
      const history = rows.filter((r) => r.service_id === p.serviceId).map((r) => defaultView(r, names))
      const latest = history[0] ?? null
      return {
        ...p,
        servicePage: p.servicePage
          ? { ...p.servicePage, problems: preparationProblems(p.servicePage.text).map((x) => x.rule) }
          : null,
        current: latest && latest.text !== null ? latest : null,
        version: latest?.version ?? 0,
        history,
      }
    }),
  }
}

export type DefaultInput = {
  /** service_page: the reviewed steps as they are; text: the Owner's text; none: remove the default. */
  source: 'service_page' | 'text' | 'none'
  text?: string
  reason?: string
  /** The service's default version the Owner saw (0 for none). */
  currentVersion: number
}

/**
 * Records the Owner's approval of a service's default as its next version (service_content.approve). Refusals:
 * NOT_FOUND, STALE_VERSION (currentVersion), VALIDATION_FAILED (TEXT_REQUIRED, TEXT_TOO_LONG, UNSAFE_<RULE>),
 * CONFLICT (SERVICE_PAGE_NOT_REVIEWED: no approved page version with steps; DEFAULT_UNCHANGED; NO_DEFAULT to remove).
 */
export async function approvePreparationDefault(tx: Tx, actor: StaffActor, serviceId: string, input: DefaultInput) {
  const [page] = await reviewedPages(tx, serviceId)
  if (!page) throw new ApiError('NOT_FOUND')
  await tx.selectFrom('catalog.services').select('id').where('id', '=', serviceId).forUpdate().execute()
  const current = (await defaultsInForce(tx, [serviceId])).get(serviceId) ?? null
  const seen = current?.version ?? 0
  if (input.currentVersion !== seen)
    throw new ApiError('STALE_VERSION', { current: { version: seen, values: { text: current?.text ?? null } } })
  let text: string | null = null
  let basis: 'service_page' | 'edited' | 'removed'
  if (input.source === 'service_page') {
    if (!page.servicePage?.text)
      throw new ApiError('CONFLICT', { fieldErrors: [field('source', 'SERVICE_PAGE_NOT_REVIEWED')] })
    text = page.servicePage.text
    basis = 'service_page'
  } else if (input.source === 'text') {
    text = input.text?.trim() || null
    if (!text) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.text', 'TEXT_REQUIRED')] })
    basis = text === page.servicePage?.text ? 'service_page' : 'edited'
  } else {
    if (!current?.text) throw new ApiError('CONFLICT', { fieldErrors: [field('source', 'NO_DEFAULT')] })
    basis = 'removed'
  }
  if (text !== null) {
    if (text.length > PREPARATION_MAX_LENGTH)
      throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.text', 'TEXT_TOO_LONG')] })
    const unsafe = unsafeProblems(text, 'body.text')
    if (unsafe.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: unsafe })
    if (current?.text === text)
      throw new ApiError('CONFLICT', { fieldErrors: [field('body.text', 'DEFAULT_UNCHANGED')] })
  }
  const row = await tx
    .insertInto('catalog.preparation_defaults')
    .values({
      service_id: serviceId,
      version: seen + 1,
      text,
      basis,
      service_version: page.servicePage?.version ?? null,
      reason: input.reason?.trim() || null,
      approved_by: actor.userId,
    })
    .returning(['id', 'version', 'service_version'])
    .executeTakeFirstOrThrow()
  return {
    id: row.id,
    serviceId,
    version: row.version,
    basis,
    serviceVersion: row.service_version,
    length: text?.length ?? 0,
  }
}
