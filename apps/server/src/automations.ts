// The declared automations the in-process worker runs (TSK-0012, HH-AUTO-01). Each later task appends its own
// declaration here; an incomplete one stops the server at boot.
import { staffLinkEmailAutomation, type LinkEmailDeps } from './modules/identity/link-email.js'
import type { Automation } from './platform/automation.js'

export type AutomationDeps = LinkEmailDeps

export function buildAutomations(deps: AutomationDeps): Automation[] {
  return [staffLinkEmailAutomation(deps)]
}
