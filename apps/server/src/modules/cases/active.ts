// Active cases (TSK-0093; OWN-DEC-124, HH-QA-10, HH-PRIV-03): what other modules read about open cases, with no
// dependency on the rest of the cases module (retention and privacy checks import it).
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'

type Reader = Db | Tx

/**
 * Active cases on a project (OWN-DEC-124, HH-QA-10, HH-PRIV-03): while any is open, review invitations and satisfaction
 * checks for the project pause (TSK-0092 reads this at send time) and its records are kept from deletion.
 */
export async function activeCaseCounts(
  db: Reader,
  projectIds: readonly string[],
): Promise<Map<string, { complaints: number; disputes: number; incidents: number }>> {
  const out = new Map<string, { complaints: number; disputes: number; incidents: number }>()
  if (projectIds.length === 0) return out
  const rows = await db
    .selectFrom('quality.cases')
    .select(['project_id', 'kind', sql<string>`count(*)::text`.as('n')])
    .where('project_id', 'in', [...projectIds])
    .where('state', '<>', 'closed')
    .groupBy(['project_id', 'kind'])
    .execute()
  for (const r of rows) {
    const e = out.get(r.project_id) ?? { complaints: 0, disputes: 0, incidents: 0 }
    if (r.kind === 'complaint') e.complaints += Number(r.n)
    else if (r.kind === 'dispute') e.disputes += Number(r.n)
    else e.incidents += Number(r.n)
    out.set(r.project_id, e)
  }
  return out
}

export async function projectHasActiveCase(db: Reader, projectId: string): Promise<boolean> {
  const r = await db
    .selectFrom('quality.cases')
    .select('id')
    .where('project_id', '=', projectId)
    .where('state', '<>', 'closed')
    .limit(1)
    .executeTakeFirst()
  return Boolean(r)
}
