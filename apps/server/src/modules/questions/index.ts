// Questions module (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-PORT-09, OWN-DEC-98, OWN-DEC-101): staff questions published
// in the project with their automatic notice, the customer's replies (text, "I'm not sure", photos) and portal
// messages, the automatic reminder (TSK-0121), "Closed—no response" and reopening by a reply within the period.
import type { ApiModule } from '../../api/route.js'
import { questionCustomerRoutes } from './customer-routes.js'
import { questionStaffRoutes, type QuestionStaffDeps } from './staff-routes.js'

export * from './model.js'
export {
  questionAutomations,
  questionDeliveryAutomation,
  questionNoticeAutomation,
  questionRecordCheck,
  questionReminderFailureItem,
  questionReminderOutcomeAutomation,
  questionReminderPlanAutomation,
  questionReminderValues,
  planQuestionReminder,
  closeAvailableAutomation,
  replyStaffNoticeAutomation,
  type QuestionAutomationDeps,
} from './automations.js'
export {
  cancelOpenReminders,
  reminderFollowUpNeeded,
  syncReminderFollowUp,
  syncReminderItem,
  REMINDER_STATES,
  type QuestionStaffDeps,
} from './staff-routes.js'

export function questionsModule(deps: QuestionStaffDeps = {}): ApiModule {
  return {
    name: 'questions',
    routes: [...questionStaffRoutes(deps), ...questionCustomerRoutes(deps.now ? { now: deps.now } : {})],
  }
}
