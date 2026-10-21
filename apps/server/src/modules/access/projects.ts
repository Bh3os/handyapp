// The opened project at a glance (TSK-0034; HH-INT-21, HH-PORT-01, RULE-SERVER-AUTHZ). A customer projection of the
// customer's own submission only: the reference, the services by their registry names (and whether they chose "Not
// sure"), when it was sent and the request's state code. The policy has already decided that the caller's session
// opens this project, and the read itself is scoped to the session (TSK-0037): nothing here reads another project,
// customer or account.
import type { Db, Tx } from '@handyhub/db'
import { REFERENCE_PATTERN } from '@handyhub/domain/request-form'
import type { DataScope } from '@handyhub/policy'
import { findProject } from '../records/repository.js'

/** The project a well-formed reference names, or null. */
export async function projectIdOf(db: Db | Tx, reference: string): Promise<string | null> {
  if (!REFERENCE_PATTERN.test(reference)) return null
  const row = await db.selectFrom('crm.projects').select('id').where('reference', '=', reference).executeTakeFirst()
  return row?.id ?? null
}

/** The references of projects, in the order given. */
export async function referencesOf(db: Db | Tx, projectIds: readonly string[]): Promise<string[]> {
  if (projectIds.length === 0) return []
  const rows = await db
    .selectFrom('crm.projects')
    .select(['id', 'reference'])
    .where('id', 'in', [...projectIds])
    .execute()
  const byId = new Map(rows.map((r) => [r.id, r.reference]))
  return projectIds.flatMap((id) => {
    const ref = byId.get(id)
    return ref ? [ref] : []
  })
}

export type ProjectGlance = {
  reference: string
  submittedAt: Date
  requestState: string
  services: string[]
  notSure: boolean
}

/**
 * The project's submission at a glance, read inside the caller's scope (TSK-0037): another project, or one outside
 * the session, is null. The customer receives it only through the PROJECT_GLANCE view (records/projections.ts).
 */
export async function projectGlance(db: Db | Tx, scope: DataScope, reference: string): Promise<ProjectGlance | null> {
  const project = await findProject(db, scope, { reference })
  if (!project) return null
  const r = await db
    .selectFrom('intake.requests as r')
    .select(['r.id', 'r.submitted_at', 'r.state', 'r.not_sure'])
    .where('r.project_id', '=', project.id)
    .orderBy('r.submitted_at')
    .executeTakeFirst()
  if (!r) return null
  const names = await db
    .selectFrom('intake.request_services as s')
    .innerJoin('catalog.service_versions as v', (j) =>
      j.onRef('v.service_id', '=', 's.service_id').onRef('v.version', '=', 's.service_version'),
    )
    .select('v.name')
    .where('s.request_id', '=', r.id)
    .orderBy('s.position')
    .execute()
  return {
    reference: project.reference,
    submittedAt: r.submitted_at,
    requestState: r.state,
    services: names.map((n) => n.name),
    notSure: r.not_sure,
  }
}
