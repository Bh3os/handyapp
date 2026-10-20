// The declared automations the in-process worker runs (TSK-0012, HH-AUTO-01). Each later task appends its own
// declaration here; an incomplete one stops the server at boot.
import type { Automation } from './platform/automation.js'

export const AUTOMATIONS: readonly Automation[] = []
