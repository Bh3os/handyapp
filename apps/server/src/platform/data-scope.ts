// Scoped queries (TSK-0037; HH-DATA-01, HH-PORT-01, HH-STAFF-04, RULE-SERVER-AUTHZ). The predicate every repository
// query adds for the actor's DataScope (computed by @handyhub/policy dataScope(), never written by hand): a record
// outside the scope is simply not found, so an altered ID gets the same NOT_FOUND as a missing record and nothing
// changes. Deny by default: every scope that is not `all` or a list of projects matches no row.
import type { DataScope } from '@handyhub/policy'
import { sql, type Expression, type SqlBool } from 'kysely'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `column` (a project ID column, for example `p.id` or `r.project_id`) lies inside the scope. */
export function projectInScope(column: string, scope: DataScope): Expression<SqlBool> {
  switch (scope.kind) {
    case 'all':
      return sql<SqlBool>`true`
    case 'projects': {
      // Project IDs are UUIDs; anything else in a session names no project.
      const ids = scope.projectIds.filter((id) => UUID.test(id))
      return ids.length === 0 ? sql<SqlBool>`false` : sql<SqlBool>`${sql.ref(column)} = ANY(${sql.val(ids)}::uuid[])`
    }
    // No job assignments are recorded yet, and project-wide records belong to no single staff user: nothing.
    case 'assigned':
    case 'own':
    case 'none':
      return sql<SqlBool>`false`
  }
}
