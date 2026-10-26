// The SQL the retention job and the audit-retention workflow share about audit events (TSK-0099, TSK-0135;
// HH-SEC-06, HH-SEC-08, OWN-DEC-142, OWN-DEC-164): when an entry's period ends (calendar years in the business time
// zone, so a daylight-saving change never moves it by an hour) and which project the record it names belongs to
// (which decides its hold checks).
import { sql, type RawBuilder } from 'kysely'

const UUID_TEXT = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

/** The end of an audit entry's period: its local time in the zone plus whole calendar years, back to an instant. */
export const auditEventEnd = (occurredAt: RawBuilder<unknown>, years: number, zone: string) =>
  sql<Date>`((${occurredAt} AT TIME ZONE ${zone}::text) + make_interval(years => ${years})) AT TIME ZONE ${zone}::text`

/**
 * An upper bound of the recorded times whose period has ended by `now` (a day of slack for month ends and leap days),
 * so the index on occurred_at narrows the search; the exact test is auditEventEnd.
 */
export const auditEligibleBound = (now: Date, years: number, zone: string) =>
  sql<Date>`((${now}::timestamptz AT TIME ZONE ${zone}::text) - make_interval(years => ${years}, days => -1))
            AT TIME ZONE ${zone}::text`

/** The project of the record an audit entry names, where there is one (alias: the audit_events table). */
export const auditEventProject = (alias: string) => {
  const target = sql.ref(`${alias}.target_id`)
  return sql<string | null>`CASE WHEN ${target} ~ ${UUID_TEXT} THEN
      CASE ${sql.ref(`${alias}.target_type`)}
        WHEN 'project' THEN (SELECT p.id FROM crm.projects p WHERE p.id = ${target}::uuid)
        WHEN 'request' THEN (SELECT r.project_id FROM intake.requests r WHERE r.id = ${target}::uuid)
        WHEN 'estimate_version' THEN
          (SELECT v.project_id FROM estimating.estimate_versions v WHERE v.id = ${target}::uuid)
        WHEN 'job' THEN (SELECT j.project_id FROM work.jobs j WHERE j.id = ${target}::uuid)
        WHEN 'visit' THEN (SELECT w.project_id FROM work.visits w WHERE w.id = ${target}::uuid)
        WHEN 'hold' THEN (SELECT h.project_id FROM work.holds h WHERE h.id = ${target}::uuid)
      END
    END`
}
