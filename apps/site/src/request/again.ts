// Request This Service Again on the request form (TSK-0113; HH-ID-12, HH-ID-03, OWN-DEC-113, C11). Pure functions,
// shared by the wizard and its unit tests:
// - /request?again=<reference> starts from one of the signed-in account's projects, /request?property=<id> from one of
//   its saved properties; the account's own server answer (account.request_prefill) is the only source, read with the
//   customer session cookie, so another person's project is never offered (the server answers it NOT_FOUND);
// - the form starts from the services still offered, the property address and type, and the contact name, email and
//   phone; the customer confirms the property details are still current before going on. Nothing else is reused: no
//   description, answer, note, photo, timing, estimate choice, discount, SMS opt-in or marketing permission (both
//   unchecked, as on every request), and no price, verification or consent of the earlier request.
import { PROPERTY_TYPES } from '@handyhub/domain/request-form'
import { EMPTY_VALUES, type FormService, type FormValues } from './form.js'

export type RequestPrefill = {
  reference: string
  services: string[]
  notSure: boolean
  address: {
    street: string
    unit: string | null
    city: string
    state: string
    zip: string
    propertyType: string
  }
  contact: { fullName: string; email: string; phone: string }
  preferredChannel: 'email' | 'call' | 'text' | null
}

const REFERENCE = /^HH-[0-9A-HJKMNP-TV-Z]{8}$/
const SAVED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Where the form's starting point is read from for this page's query string; null for an ordinary request. */
export function prefillUrl(search: string): string | null {
  const q = new URLSearchParams(search)
  const again = (q.get('again') ?? '').trim().toUpperCase()
  if (REFERENCE.test(again)) return `/api/v1/customer/account/projects/${encodeURIComponent(again)}/request-again`
  const property = (q.get('property') ?? '').trim()
  if (SAVED_ID.test(property)) return `/api/v1/customer/account/properties/${encodeURIComponent(property)}/request`
  return null
}

/** Whether the page asked for a starting point at all (a malformed one is still asked for, and fails). */
export function asksForPrefill(search: string): boolean {
  const q = new URLSearchParams(search)
  return q.has('again') || q.has('property')
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

/** The server's answer as the form uses it; anything else is no answer. */
export function parsePrefill(v: unknown): RequestPrefill | null {
  if (!isObj(v) || !isStr(v['reference']) || !REFERENCE.test(v['reference'])) return null
  const services = v['services']
  const a = v['address']
  const c = v['contact']
  const channel = v['preferredChannel']
  if (!Array.isArray(services) || !services.every(isStr) || typeof v['notSure'] !== 'boolean') return null
  if (!isObj(a) || !isStr(a['street']) || !(a['unit'] === null || isStr(a['unit'])) || !isStr(a['city'])) return null
  if (!isStr(a['state']) || !isStr(a['zip']) || !isStr(a['propertyType'])) return null
  if (!isObj(c) || !isStr(c['fullName']) || !isStr(c['email']) || !isStr(c['phone'])) return null
  if (channel !== null && channel !== 'email' && channel !== 'call' && channel !== 'text') return null
  return {
    reference: v['reference'],
    services,
    notSure: v['notSure'],
    address: {
      street: a['street'],
      unit: a['unit'] as string | null,
      city: a['city'],
      state: a['state'],
      zip: a['zip'],
      propertyType: a['propertyType'],
    },
    contact: { fullName: c['fullName'], email: c['email'], phone: c['phone'] },
    preferredChannel: channel,
  }
}

/** The form's values from a starting point: only the services this form offers, at most what it allows. */
export function prefillValues(p: RequestPrefill, offered: readonly FormService[], max: number): FormValues {
  const known = new Set(offered.map((s) => s.id))
  const services = p.services.filter((id) => known.has(id)).slice(0, max)
  const type = (PROPERTY_TYPES as readonly string[]).includes(p.address.propertyType) ? p.address.propertyType : ''
  return {
    ...EMPTY_VALUES,
    services,
    notSure: p.notSure,
    street: p.address.street,
    unit: p.address.unit ?? '',
    city: p.address.city,
    state: p.address.state,
    zip: p.address.zip,
    propertyType: type,
    fullName: p.contact.fullName,
    email: p.contact.email,
    phone: p.contact.phone,
    preferredChannel: p.preferredChannel ?? '',
    repeatOf: p.reference,
    detailsConfirmed: false,
  }
}
