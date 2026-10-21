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

/**
 * `column` (a customer ID column, for example `cu.id`) lies inside the scope (TSK-0044, HH-CRM-01): staff with an `all`
 * scope reach every customer; a list of projects reaches only the customers those projects belong to; anything else
 * reaches none.
 */
export function customerInScope(column: string, scope: DataScope): Expression<SqlBool> {
  switch (scope.kind) {
    case 'all':
      return sql<SqlBool>`true`
    case 'projects': {
      const ids = scope.projectIds.filter((id) => UUID.test(id))
      return ids.length === 0
        ? sql<SqlBool>`false`
        : sql<SqlBool>`EXISTS (SELECT 1 FROM crm.projects sp WHERE sp.customer_id = ${sql.ref(column)}
            AND sp.id = ANY(${sql.val(ids)}::uuid[]))`
    }
    case 'assigned':
    case 'own':
    case 'none':
      return sql<SqlBool>`false`
  }
}

/**
 * `column` (a property ID column, for example `p.id`) lies inside the scope (TSK-0045, HH-CRM-02): staff with an `all`
 * scope reach every property; a list of projects reaches only the properties of those projects; a worker's `assigned`
 * scope (TSK-0069) reaches a property only while they hold an active confirmed reservation on a live visit there whose
 * service day has not ended (the same window as jobInScope; the access-code reveal adds the visit date and the online
 * check through the policy, T28); anything else reaches none.
 */
export function propertyInScope(column: string, scope: DataScope): Expression<SqlBool> {
  switch (scope.kind) {
    case 'all':
      return sql<SqlBool>`true`
    case 'projects': {
      const ids = scope.projectIds.filter((id) => UUID.test(id))
      return ids.length === 0
        ? sql<SqlBool>`false`
        : sql<SqlBool>`EXISTS (SELECT 1 FROM crm.projects sp WHERE sp.property_id = ${sql.ref(column)}
            AND sp.id = ANY(${sql.val(ids)}::uuid[]))`
    }
    case 'assigned':
      return UUID.test(scope.staffUserId)
        ? sql<SqlBool>`EXISTS (SELECT 1 FROM work.reservations sr JOIN work.visits sv ON sv.id = sr.visit_id
            WHERE sv.property_id = ${sql.ref(column)} AND sr.staff_user_id = ${scope.staffUserId}::uuid
              AND sr.kind = 'confirmed' AND sr.ended_at IS NULL
              AND sv.state IN ('confirmed', 'en_route', 'arrived')
              AND now() < ((sv.local_date + 1)::timestamp AT TIME ZONE sv.time_zone))`
        : sql<SqlBool>`false`
    case 'own':
    case 'none':
      return sql<SqlBool>`false`
  }
}

/**
 * `column` (a job ID column, for example `j.id`) lies inside the scope (TSK-0069; HH-PKT-01, HH-DATA-08, OWN-DEC-40,
 * OWN-DEC-121): staff with an `all` scope reach every job; a worker's `assigned` scope reaches a job only while they
 * hold an active confirmed reservation on one of its live work visits (confirmed, on the way or arrived) and the
 * visit's service day has not ended in the visit's zone. A reservation ended by a reassignment, a reschedule or a
 * cancellation, or a visit completed, therefore loses the job on the very next request. Everything else reaches none.
 */
export function jobInScope(column: string, scope: DataScope): Expression<SqlBool> {
  switch (scope.kind) {
    case 'all':
      return sql<SqlBool>`true`
    case 'assigned':
      return UUID.test(scope.staffUserId)
        ? sql<SqlBool>`EXISTS (SELECT 1 FROM work.reservations sr JOIN work.visits sv ON sv.id = sr.visit_id
            WHERE sv.job_id = ${sql.ref(column)} AND sr.staff_user_id = ${scope.staffUserId}::uuid
              AND sr.kind = 'confirmed' AND sr.ended_at IS NULL
              AND sv.state IN ('confirmed', 'en_route', 'arrived')
              AND now() < ((sv.local_date + 1)::timestamp AT TIME ZONE sv.time_zone))`
        : sql<SqlBool>`false`
    case 'projects':
    case 'own':
    case 'none':
      return sql<SqlBool>`false`
  }
}
