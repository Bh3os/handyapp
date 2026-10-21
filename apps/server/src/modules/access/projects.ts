// The opened project at a glance (TSK-0034; HH-INT-21, HH-PORT-01, RULE-SERVER-AUTHZ). A customer projection of the
// customer's own submission only: the reference, the services by their registry names (and whether they chose "Not
// sure"), when it was sent and the request's state code. The policy has already decided that the caller's session opens this project; nothing here
// reads another project, customer or account.
import type { Db, Tx } from '@handyhub/db'
import { REFERENCE_PATTERN } from '@handyhub/domain/request-form'

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
  submittedAt: string
  requestState: string
  services: string[]
  notSure: boolean
}

export async function projectGlance(db: Db | Tx, reference: string): Promise<ProjectGlance | null> {
  const r = await db
    .selectFrom('crm.projects as p')
    .innerJoin('intake.requests as r', 'r.project_id', 'p.id')
    .select(['p.reference', 'r.id', 'r.submitted_at', 'r.state', 'r.not_sure'])
    .where('p.reference', '=', reference)
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
    reference: r.reference,
    submittedAt: r.submitted_at.toISOString(),
    requestState: r.state,
    services: names.map((n) => n.name),
    notSure: r.not_sure,
  }
}
