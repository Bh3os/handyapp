// The declared automations the in-process worker runs (TSK-0012, HH-AUTO-01). Each later task appends its own
// declaration here; an incomplete one stops the server at boot.
import { deliveryStatusAutomation } from './modules/notifications/index.js'
import type { Automation } from './platform/automation.js'

export const AUTOMATIONS: readonly Automation[] = [
  // TSK-0048: provider statuses and SMS keywords from the stored webhook receipts.
  deliveryStatusAutomation(),
]
