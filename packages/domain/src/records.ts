// Customer records: visibility classes, candidate-match normalization and the note content guard (TSK-0044;
// HH-STAFF-05, HH-ID-02, HH-CRM-01, OWN-DEC-117, OWN-DEC-143).

/**
 * The visibility classes of HH-STAFF-05: every note and attachment has exactly one. Internal is the default; sharing
 * with the customer is an explicit action; public marketing use is a separate publication permission, never a class.
 */
export const VISIBILITY_CLASSES = [
  'internal_operational',
  'restricted_incident',
  'restricted_financial',
  'customer_shared',
] as const
export type VisibilityClass = (typeof VISIBILITY_CLASSES)[number]
export const DEFAULT_VISIBILITY: VisibilityClass = 'internal_operational'

/**
 * The classes a note may have (PROPOSED): notes are staff-only, so never customer_shared. What a customer should read
 * is written as a customer message, kept apart from notes everywhere (HH-STAFF-05).
 */
export const NOTE_VISIBILITIES = ['internal_operational', 'restricted_incident', 'restricted_financial'] as const
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number]

export const isRestricted = (c: VisibilityClass): boolean => c === 'restricted_incident' || c === 'restricted_financial'

/** What two customers share, making them a candidate match (HH-ID-02). */
export const MATCH_REASONS = ['email', 'phone', 'address', 'name'] as const
export type MatchReason = (typeof MATCH_REASONS)[number]
/**
 * The reasons that may make a suggestion on their own (PROPOSED): an exact email, phone or service address. A matching
 * name only supports one, since many people share a name; nothing is ever linked by name or address alone.
 */
export const SUGGESTING_REASONS: readonly MatchReason[] = ['email', 'phone', 'address']

/**
 * Conservative normalization (HH-ID-02 "normalized conservatively"): only case and surrounding spaces of an email
 * change. Dots, plus tags and the domain stay as they are, so two different mailboxes never look alike, and a shared
 * domain alone never matches anything.
 */
export function normalizeEmail(email: string): string | null {
  const e = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

/** A phone as stored (E.164) matches only the identical number. */
export function normalizePhone(e164: string): string | null {
  const p = e164.trim()
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null
}

/** A service address key: street, unit and the five-digit ZIP, case and spacing ignored; the city is not needed. */
export function addressKey(a: { street: string; unit: string | null; zip: string }): string {
  const clean = (s: string) => s.trim().toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()
  return [clean(a.street), clean(a.unit ?? ''), a.zip.trim().slice(0, 5)].join('|')
}

/** A person's name compared without case or extra spaces. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** The reasons in their canonical order, without duplicates. */
export function sortReasons(reasons: Iterable<string>): MatchReason[] {
  const set = new Set(reasons)
  return MATCH_REASONS.filter((r) => set.has(r))
}

/** A set of reasons makes a suggestion only with an email, phone or address among them. */
export function suggests(reasons: readonly string[]): boolean {
  return reasons.some((r) => (SUGGESTING_REASONS as readonly string[]).includes(r))
}

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/**
 * Notes never hold payment card data (HH-CRM-01): a run of 13 to 19 digits (spaces or dashes between them) that
 * passes the card checksum is refused. Passwords and access codes cannot be recognised reliably, so the form says
 * they never belong in a note, and access codes have their own protected store (HH-CRM-03).
 */
export function looksLikeCardNumber(text: string): boolean {
  for (const m of text.matchAll(/\d(?:[ -]?\d){12,18}/g)) {
    const digits = m[0].replace(/\D/g, '')
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true
  }
  return false
}
