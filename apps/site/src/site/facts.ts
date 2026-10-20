// The configured facts the public site shows at run time (TSK-0020; HH-CUS-05, HH-CUS-07). The static build carries
// the labels; GET /api/v1/public/site says which apply (RULE-DECIDED-VALUES-ACTIVE). Pure functions, unit tested.

/** The payment method codes of the payment.methods configuration (FACT-PAYMENT-METHODS). */
export type PaymentMethodCode =
  'square_payment_link' | 'square_tap_to_pay' | 'cash' | 'check' | 'zelle' | 'cash_app' | 'chime'

/** One listed payment method; both Square codes are listed once, as cards taken with Square (OWN-DEC-89). */
export type PaymentItem = 'card' | 'cash' | 'check' | 'zelle' | 'cashApp' | 'chime'

const ITEM_OF: Record<PaymentMethodCode, PaymentItem> = {
  square_payment_link: 'card',
  square_tap_to_pay: 'card',
  cash: 'cash',
  check: 'check',
  zelle: 'zelle',
  cash_app: 'cashApp',
  chime: 'chime',
}

/** The display order of the listed methods (the order of FACT-PAYMENT-METHODS). */
export const PAYMENT_ITEMS: readonly PaymentItem[] = ['card', 'cash', 'check', 'zelle', 'cashApp', 'chime']

/** The methods to list for the configured codes, each once, in display order; an unknown code is not listed. */
export function paymentItems(codes: readonly string[]): PaymentItem[] {
  const wanted = new Set(codes.flatMap((c) => (Object.hasOwn(ITEM_OF, c) ? [ITEM_OF[c as PaymentMethodCode]] : [])))
  return PAYMENT_ITEMS.filter((item) => wanted.has(item))
}

/** The response of GET /api/v1/public/site. */
export type SiteFacts = {
  readonly brand: string | null
  readonly contact: { readonly configured: boolean; readonly phone: string | null; readonly email: string | null }
  readonly paymentMethods: readonly string[] | null
}

/** One public contact detail: a configured value, or a labelled placeholder that is never a link (OWN-DEC-47). */
export type ContactDetail =
  { readonly kind: 'value'; readonly value: string; readonly href: string } | { readonly kind: 'placeholder' }

export function contactDetails(contact: SiteFacts['contact']): { phone: ContactDetail; email: ContactDetail } {
  const phone = contact.configured && contact.phone ? contact.phone.trim() : ''
  const email = contact.configured && contact.email ? contact.email.trim() : ''
  const digits = phone.replace(/[^\d+]/g, '')
  return {
    phone: phone && digits ? { kind: 'value', value: phone, href: `tel:${digits}` } : { kind: 'placeholder' },
    email: email ? { kind: 'value', value: email, href: `mailto:${email}` } : { kind: 'placeholder' },
  }
}

/** Reads the response defensively: anything that is not the documented shape is treated as unavailable. */
export function parseSiteFacts(body: unknown): SiteFacts | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  const contact = b['contact'] as Record<string, unknown> | null | undefined
  const methods = b['paymentMethods']
  if (typeof contact !== 'object' || contact === null || typeof contact['configured'] !== 'boolean') return null
  if (methods !== null && !(Array.isArray(methods) && methods.every((m) => typeof m === 'string'))) return null
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    brand: str(b['brand']),
    contact: { configured: contact['configured'], phone: str(contact['phone']), email: str(contact['email']) },
    paymentMethods: methods,
  }
}
