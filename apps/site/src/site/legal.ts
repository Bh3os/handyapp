// The legal pages' helpers (TSK-0024; HH-PRIV-04, HH-COM-12, OWN-DEC-72, OWN-DEC-147). The documents themselves are
// the versioned manifest of @handyhub/domain/legal over customer catalog keys; this module turns a document into what
// a page renders. Pure functions, unit tested.
import type { CustomerKey } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import { LEGAL_DOCUMENTS, type LegalDocument, type LegalDocumentCode } from '@handyhub/domain/legal'

export { LEGAL_DOCUMENTS, type LegalDocument, type LegalDocumentCode }

/** The link label of each document, in footer order (written out so the catalog check sees each key). */
export const LINK_LABEL: Record<LegalDocumentCode, CustomerKey> = {
  privacy_notice: 'legal.link.privacy',
  sms_terms: 'legal.link.smsTerms',
  website_terms: 'legal.link.terms',
}

/** The footer and request-page links: every legal document with its path and label key. */
export function legalLinks(): { code: LegalDocumentCode; href: string; label: CustomerKey }[] {
  return LEGAL_DOCUMENTS.map((d) => ({ code: d.code, href: d.path, label: LINK_LABEL[d.code] }))
}

export function pathOf(code: LegalDocumentCode): string {
  const doc = LEGAL_DOCUMENTS.find((d) => d.code === code)
  if (!doc) throw new RangeError(`unknown legal document ${code}`)
  return doc.path
}

/**
 * The ICU values of a document: whole numbers as they are; an amount (`fooCents`) as en-US currency under the name
 * without `Cents` (`foo`), formatted from integer cents (RULE-MONEY-CENTS).
 */
export function legalValues(doc: LegalDocument): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(doc.values)) {
    if (name.endsWith('Cents')) out[name.slice(0, -'Cents'.length)] = formatUsd(cents(value))
    else out[name] = value
  }
  return out
}

/** The draft date as "October 21, 2026", from the YYYY-MM-DD string (no time zone can move the day). */
export function preparedOnText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new RangeError(`not a date: ${iso}`)
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)),
  )
  return `${month} ${Number(m[3])}, ${m[1]}`
}

/** The draft banner shows until the version is attorney reviewed and approved (OWN-DEC-72, OQ-ATTORNEY-PRIVACY). */
export function isDraft(doc: LegalDocument): boolean {
  return !doc.attorneyReviewed || doc.status !== 'approved'
}
