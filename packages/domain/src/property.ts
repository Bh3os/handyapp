// Property records and access secrets (TSK-0045; HH-CRM-02, HH-CRM-03, ENT-Property, ENT-AccessInstructionSecret).
// The codes a property record stores, shared by the server, the database checks (migration 0040) and the staff app.

/**
 * The changeable details of a property (HH-CRM-02), each with its source and last confirmation. `address` and
 * `property_type` are structured fields of the property; the others are short non-secret texts.
 */
export const PROPERTY_DETAILS = [
  'address',
  'property_type',
  'site_contact',
  'access_windows',
  'access_notes',
  'parking_loading',
  'occupants_pets',
  'restricted_areas',
  'utilities',
  'customer_preparation',
  'site_flags',
] as const
export type PropertyDetail = (typeof PROPERTY_DETAILS)[number]

/** The text details (everything but the address and the property type). */
export const PROPERTY_TEXT_DETAILS = PROPERTY_DETAILS.filter(
  (d): d is Exclude<PropertyDetail, 'address' | 'property_type'> => d !== 'address' && d !== 'property_type',
)
export type PropertyTextDetail = (typeof PROPERTY_TEXT_DETAILS)[number]

/**
 * PROPOSED (TSK-0045): where a detail came from. request_form: the customer's request; customer_call and
 * customer_message: the customer said so by phone or in writing; site_visit: seen on site; office_record: other
 * office knowledge.
 */
export const DETAIL_SOURCES = [
  'request_form',
  'customer_call',
  'customer_message',
  'site_visit',
  'office_record',
] as const
export type DetailSource = (typeof DETAIL_SOURCES)[number]
/** Sources staff may record: the request form is only ever the customer's own submission. */
export const STAFF_DETAIL_SOURCES = DETAIL_SOURCES.filter((s) => s !== 'request_form')

/** PROPOSED kinds of access secret (ENT-AccessInstructionSecret: a lockbox, gate, alarm or door code or key location). */
export const ACCESS_SECRET_KINDS = ['gate', 'lockbox', 'alarm', 'door', 'key_location', 'other'] as const
export type AccessSecretKind = (typeof ACCESS_SECRET_KINDS)[number]

const CODE_WORDS = /\b(?:codes?|combo|combination|passcode|password|pin|keypad)\b/gi

/**
 * Ordinary property text never holds an access code (HH-CRM-03: codes are never copied into notes or other fields).
 * Codes cannot be recognised reliably, so this catches the common way of writing one down: a code word ("code",
 * "combo", "passcode", "PIN", "keypad") followed within a few characters by three or more digits ("gate code 4821",
 * "keypad: 12-34"). The form also says codes belong in the protected store.
 */
export function looksLikeAccessCode(text: string): boolean {
  for (const m of text.matchAll(CODE_WORDS)) {
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 16)
    if ((after.match(/\d/g) ?? []).length >= 3) return true
  }
  return false
}

export type PropertyAddress = {
  readonly street: string
  readonly unit: string | null
  readonly city: string
  readonly state: string
  readonly zip: string
}

/** Two addresses are the same place: street, unit, city, state and ZIP equal after case and spacing. */
export function sameAddress(a: PropertyAddress, b: PropertyAddress): boolean {
  const n = (s: string | null) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return (
    n(a.street) === n(b.street) &&
    n(a.unit) === n(b.unit) &&
    n(a.city) === n(b.city) &&
    n(a.state) === n(b.state) &&
    n(a.zip) === n(b.zip)
  )
}
