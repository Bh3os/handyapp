// The staff notification of a damage, injury or dispute case (TSK-0093; HH-INC-04, OWN-DEC-124,
// FACT-AUTOMATIC-MESSAGES "Staff notifications", staff_notice.case_opened). From the committed case.opened event:
// - to every active Owner (the reviewer of these cases), by their account email, in their own staff language;
// - identifiers and the staff app link only: never the report, the kind's details, a name or anything the reporter
//   wrote, so the notice cannot leak restricted detail (OWN-DEC-143);
// - no wording is approved for this notice yet, so each delivery is recorded as template_not_configured (NOT
//   CONFIGURED) and the Owner Decisions item opened in the same transaction as the report stays the reliable signal.
import { sql } from 'kysely'
import type { Automation } from '../../platform/automation.js'
import { notificationAutomation, type NotificationProviders, type Recipient } from '../notifications/index.js'
import { activeOwners } from './store.js'

export const CASE_OPENED_NOTICE = 'staff_notice.case_opened'

export function caseOpenedNoticeAutomation(deps: {
  providers: NotificationProviders
  staffAppUrl?: string | undefined
}): Automation {
  return notificationAutomation({
    messageKey: CASE_OPENED_NOTICE,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const c = await tx
        .selectFrom('quality.cases')
        .select(['id', 'project_id', sql<boolean>`kind IN ('damage', 'injury', 'dispute')`.as('notifies')])
        .where('id', '=', id)
        .executeTakeFirst()
      if (!c || !c.notifies) return 'stale'
      const owners = await activeOwners(tx)
      const recipients: Recipient[] = owners.map((o) => ({
        kind: 'staff_user',
        id: o.id,
        staffLocale: o.locale === 'es' ? 'es' : 'en',
        destinations: [{ channel: 'email', destination: o.email, permission: 'staff_account' }],
      }))
      const base = deps.staffAppUrl?.replace(/\/$/, '')
      return {
        subjectKey: `case_opened:${c.id}`,
        record: { type: 'case', id: c.id },
        recipients,
        values: base ? { appLink: `${base}/cases/${c.id}` } : {},
        projectId: c.project_id,
      }
    },
  })
}
