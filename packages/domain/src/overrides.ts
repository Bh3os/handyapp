// What a general Owner override may and may not waive (TSK-0151; OWN-DEC-200 H7, RULE-SAFETY-GATES, HH-STAFF-03).
// - The Owner may resolve or override a discretionary operational issue with a recorded reason, where legally and
//   safely permitted: a working-hours or equipment flag on an upcoming appointment, kept as it is.
// - A mandatory safety, legal, licensing, qualification or employee-protection restriction is never waived by a
//   general Owner override. Each restriction the server knows is classified here; anything not listed is refused
//   (fail closed), so a new kind of restriction is mandatory until it is classified.
// PROPOSED classification: approved time off is employee protection; a disabled account is legal (the person no
// longer works for HandyHub); the Start Work gate and a critical hold are safety (no role overrides them, ROLE-MATRIX);
// licensed-trade and permit work is licensing; a qualified reviewer of a hazard is qualification.

export const MANDATORY_RESTRICTION_CATEGORIES = [
  'safety',
  'legal',
  'licensing',
  'qualification',
  'employee_protection',
] as const
export type MandatoryRestrictionCategory = (typeof MANDATORY_RESTRICTION_CATEGORIES)[number]

/** Every restriction an override could be asked to waive, with its class. */
export const RESTRICTIONS = {
  // Reservation flags (migration 0052): what flagged an upcoming appointment for review.
  working_hours_changed: 'discretionary',
  equipment_retired: 'discretionary',
  time_off_recorded: 'employee_protection',
  account_disabled: 'legal',
  // Safety gates (RULE-SAFETY-GATES): never overridden by any role.
  start_work_gate: 'safety',
  critical_hold: 'safety',
  // Licensed trade and permit holds (HH-WORK-02).
  licensed_trade: 'licensing',
  permit_licensing: 'licensing',
  // A critical hold is released only on the assessment of a qualified reviewer (TSK-0074).
  reviewer_qualification: 'qualification',
} as const satisfies Record<string, 'discretionary' | MandatoryRestrictionCategory>
export type Restriction = keyof typeof RESTRICTIONS

/** The reservation flags the Owner may dismiss with a reason (OWN-DEC-200 H7): the discretionary ones. */
export const DISMISSABLE_FLAGS = (Object.keys(RESTRICTIONS) as Restriction[]).filter(
  (r) => RESTRICTIONS[r] === 'discretionary',
)

/**
 * The mandatory category that refuses any Owner override of this restriction, or null when it is discretionary (the
 * Owner may waive it with a reason). Anything unknown is 'safety': fail closed.
 */
export function mandatoryRestriction(restriction: string): MandatoryRestrictionCategory | null {
  const known = (RESTRICTIONS as Record<string, string>)[restriction]
  if (known === 'discretionary') return null
  return (known as MandatoryRestrictionCategory | undefined) ?? 'safety'
}
