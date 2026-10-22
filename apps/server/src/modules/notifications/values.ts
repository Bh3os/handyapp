// The values automatic messages supply (TSK-0120; HH-COM-13, HH-COM-06, OWN-DEC-151 section 6, OWN-DEC-152,
// OWN-DEC-158, OWN-DEC-159, OWN-DEC-209, FACT-PUBLIC-CONTACT, RULE-NO-INVENTED-FACTS). Every value is read from the
// message's own records at send time and formatted here once, so each message says the same thing the same way:
// - Links open the customer portal on the public site (`/portal/p/<reference>`, a tab of it, or one estimate version
//   in Documents). The portal itself authenticates (a guest link or an account session) and shows the project only to
//   its verified customer: a link never carries a token, and a reference alone opens nothing (OWN-DEC-158 item 7).
//   Without a configured public site there is no link, so a template that needs one fails visibly (missing value).
// - Dates and times are shown in the zone the customer's records give (OWN-DEC-159): a visit's own property zone, the
//   project property's known zone, otherwise the business zone. The zone label is the short name in force at that
//   instant (EDT, CST, ...), as the portal shows it. While no zone is known or configured the value is missing.
// - Reference formats (PROPOSED, no owner rule; OQ-MESSAGES-OUTSIDE-THE-21): a visit is `<project reference>-V<n>`
//   (its customer-facing number in the project, like the estimate's `-E<n>`); a job is named by its project reference
//   (one job per approved estimate of the project, OWN-DEC-105), so "your project #HH-…" reads as the customer knows it.
// - The support contact (account_email_changed) is the configured public phone and email; while they are NOT
//   CONFIGURED, the labelled placeholders FACT-PUBLIC-CONTACT prescribes for messages, exactly as the footer shows
//   them, never a made-up number or address.
import type { Db, Tx } from '@handyhub/db'
import { customerDisplayZone, knownPropertyZone, type LocalWindow } from '@handyhub/domain'
import { customerTranslator } from '@handyhub/i18n'
import type { Config } from '../../platform/config/index.js'
import type { Destination } from './deliveries.js'
import { messageType } from './message-types.js'

type Reader = Db | Tx

/** A portal page of the project on the public site, or null while the public site's address is NOT CONFIGURED. */
export function portalLink(baseUrl: string | undefined, reference: string, path?: string): string | null {
  if (!baseUrl) return null
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/portal/p/${encodeURIComponent(reference)}${path ? `/${path}` : ''}`
}

/** The page of one estimate version in the project's Documents tab (TSK-0056 route). */
export function estimatePageLink(
  baseUrl: string | undefined,
  reference: string,
  estimateNumber: string,
  version: number,
): string | null {
  return portalLink(baseUrl, reference, `documents/${encodeURIComponent(estimateNumber)}/${version}`)
}

/** A staff app page, or null while the staff app's address is NOT CONFIGURED. */
export function staffLink(staffAppUrl: string | undefined, path: string): string | null {
  return staffAppUrl ? `${staffAppUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : null
}

/** PROPOSED: a visit's customer-facing reference, its project reference and its number in the project. */
export function visitNumberOf(reference: string, number: number): string {
  return `${reference}-V${number}`
}

/** PROPOSED: a job's customer-facing reference is its project's (one job per approved estimate, OWN-DEC-105). */
export function jobNumberOf(projectReference: string): string {
  return projectReference
}

/** The zone's short name in force at that instant ("EDT", "CST"), as the portal shows it. */
export function zoneLabel(at: Date, zone: string, locale = 'en-US'): string {
  return (
    new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? zone
  )
}

/** "Friday, October 2, 2026" in the zone. */
export function dateText(at: Date, zone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(at)
}

/** "9:00 AM" in the zone. */
export function timeText(at: Date, zone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(at)
}

/** "October 2, 2026 at 9:00 AM EDT": an instant with its zone's name at that instant. */
export function instantText(at: Date, zone: string, locale = 'en-US'): string {
  const text = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at)
  return `${text} ${zoneLabel(at, zone, locale)}`
}

/**
 * The values of a visit's confirmed date and arrival window, in the visit's own (property) zone: the parts the owner's
 * wording uses, and the one-line forms the earlier variables carry ("9:00 AM – 11:00 AM (EST)", with the date before
 * it for the visit window), each within the registry's 80 characters.
 */
export function visitWindowValues(w: LocalWindow): {
  visitDate: string
  startTime: string
  endTime: string
  timeZone: string
  arrivalWindow: string
  visitWindow: string
} {
  const visitDate = dateText(w.startsAt, w.zone)
  const startTime = timeText(w.startsAt, w.zone)
  const endTime = timeText(w.endsAt, w.zone)
  const timeZone = zoneLabel(w.startsAt, w.zone)
  const arrivalWindow = `${startTime} – ${endTime} (${timeZone})`
  return { visitDate, startTime, endTime, timeZone, arrivalWindow, visitWindow: `${visitDate}, ${arrivalWindow}` }
}

/** The zone a customer-facing date of a project is shown in (OWN-DEC-159): its property's known zone, else business. */
export async function projectDisplayZone(db: Reader, projectId: string, config: Config): Promise<string | null> {
  const p = await db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select(['pr.time_zone', 'pr.time_zone_status'])
    .where('p.id', '=', projectId)
    .executeTakeFirst()
  const known = p ? knownPropertyZone({ zone: p.time_zone, status: p.time_zone_status }) : null
  const business = config.get('business.timezone')
  if (business.state !== 'CONFIGURED') return known
  return customerDisplayZone(known, business.value.zone).zone
}

/** The business zone (business.timezone), or null while NOT CONFIGURED. */
export function businessZone(config: Config): string | null {
  const z = config.get('business.timezone')
  return z.state === 'CONFIGURED' ? z.value.zone : null
}

/**
 * The verified customer-support contact (account_email_changed): the configured public phone and email, or the
 * labelled placeholders of FACT-PUBLIC-CONTACT while they are NOT CONFIGURED. One line, never a link.
 */
export function supportContactText(config: Config): string {
  const { t } = customerTranslator()
  const contact = config.get('business.public_contact')
  const placeholder = t('site.footer.contactPlaceholder')
  const phone = contact.state === 'CONFIGURED' ? contact.value.phone : placeholder
  const email = contact.state === 'CONFIGURED' ? contact.value.email : placeholder
  return `${t('site.footer.phone')}: ${phone} · ${t('site.footer.email')}: ${email}`
}

/**
 * The values a message type declares, from a shared set (a visit's window values serve several messages): the others
 * are left out, as are empty ones. Rendering still refuses any undeclared value a resolver passes on its own.
 */
export function valuesFor(
  messageKey: string,
  values: Readonly<Record<string, string | null | undefined>>,
): Record<string, string> {
  const declared = messageType(messageKey).variables
  return present(Object.fromEntries(Object.entries(values).filter(([k]) => Object.hasOwn(declared, k))))
}

/** Only the entries that have a value (a value left out fails the render visibly with its name). */
export function present(values: Readonly<Record<string, string | null | undefined>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(values)) if (typeof v === 'string' && v.trim() !== '') out[k] = v
  return out
}

/**
 * The destinations of a customer's automatic message (TSK-0120 pattern): the email, and the mobile number when there is
 * one. Having a number is never permission to text: the send rechecks the SMS opt-in, STOP and the live-text switch,
 * and a text that may not go is recorded as such, never sent.
 */
export function contactDestinations(r: {
  email: string
  phone_e164: string | null
  preferred_channel: string
}): Destination[] {
  return [
    { channel: 'email', destination: r.email, permission: r.preferred_channel === 'email' ? 'preferred' : 'permitted' },
    ...(r.phone_e164
      ? [
          {
            channel: 'sms' as const,
            destination: r.phone_e164,
            permission: r.preferred_channel === 'text' ? ('preferred' as const) : ('permitted' as const),
          },
        ]
      : []),
  ]
}
