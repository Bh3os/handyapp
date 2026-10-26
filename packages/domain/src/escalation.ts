// The escalation procedure of every job packet: Call Owner and Call 911 (TSK-0129; HH-PKT-09, HH-WORK-13,
// FACT-SVC-ESCALATION-PATH, OWN-DEC-172, OWN-DEC-208, RULE-SAFETY-GATES, RULE-NO-INVENTED-FACTS).
// - Owner first for every problem that is not life-threatening; 911 at once, without waiting for anyone's approval,
//   for an actual or reasonably suspected immediate threat to life or serious injury. Call 911 is always offered and
//   never depends on the Owner's number, the Owner being reachable, the network or the server.
// - The Owner's number is entered by the Owner in their own staff profile and read from there; it is never in the
//   repository, the graph or a fixture other than a synthetic one. While it is empty, Call Owner says NOT CONFIGURED
//   and to call 911 in an emergency; nothing else (the packet, Start Work, Stop Work) waits for it.
// - Owner unreachable and no emergency: the affected work stays paused (OWN-DEC-208 reading 10: no backup contact).
// PROPOSED (OQ-ESCALATION-DETAILS): the number format (a North American number, stored as +1 and ten digits), how it is
// shown, and the three recorded actions.

/** What a worker's tap records (HH-PKT-09: "escalation actions are recorded"). */
export const ESCALATION_ACTIONS = ['call_owner', 'call_911', 'owner_unreachable'] as const
export type EscalationAction = (typeof ESCALATION_ACTIONS)[number]

/** The emergency call: a phone link, so it needs no network and no server (OWN-DEC-172, OWN-DEC-208). */
export const CALL_911 = 'tel:911'

/** A stored Owner number: +1, a three-digit area code and a seven-digit number (NANP; PROPOSED). */
export const OWNER_PHONE_RE = /^\+1[2-9][0-9]{2}[2-9][0-9]{6}$/

/**
 * The number as the Owner typed it, normalized to +1 and ten digits: spaces, dots, dashes and brackets are ignored,
 * and a leading 1 or +1 is accepted. null when it is not a North American number (refused, never guessed).
 */
export function normalizeOwnerPhone(input: string): string | null {
  const trimmed = input.trim()
  if (!/^\+?[0-9 ().-]+$/.test(trimmed)) return null
  const digits = trimmed.replace(/[^0-9]/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (trimmed.startsWith('+') && !(digits.length === 11 && digits.startsWith('1'))) return null
  const e164 = `+1${ten}`
  return OWNER_PHONE_RE.test(e164) ? e164 : null
}

/** How a stored number is shown: (502) 555-0142. */
export function displayOwnerPhone(e164: string): string {
  if (!OWNER_PHONE_RE.test(e164)) return e164
  return `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`
}

/** The phone link of a stored number. */
export const telOf = (e164: string) => `tel:${e164}`

/** The Owner's escalation contact as every packet and Stop Work shows it. */
export type OwnerContact =
  { state: 'configured'; phone: string; display: string; tel: string } | { state: 'not_configured' }

export function ownerContactOf(phone: string | null | undefined): OwnerContact {
  return phone && OWNER_PHONE_RE.test(phone)
    ? { state: 'configured', phone, display: displayOwnerPhone(phone), tel: telOf(phone) }
    : { state: 'not_configured' }
}
