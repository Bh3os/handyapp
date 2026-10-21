// The public legal documents as versioned policy data (TSK-0024; HH-PRIV-04, HH-COM-12, ENT-PolicyVersion, OWN-DEC-72,
// OWN-DEC-147, RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW).
//
// - Three documents: the privacy policy with its SMS section (/privacy), the SMS terms (/sms-terms) and the website
//   terms (/terms). Each has a document ID and version that are seeded as policy versions (legal.* keys, migration
//   0016) with the SHA-256 of their exact content, and the privacy policy's ID is saved with every request.
// - The wording is English customer text in the customer catalog (packages/i18n customer.en.json); this manifest only
//   orders the catalog keys into sections. `legalContent` is the canonical text the content hash covers: the document
//   ID, its values and every catalog key with its wording. Changing a sentence or a value without a new version fails
//   the hash tests (apps/site/test/legal.test.ts) and the seeded-row test (apps/server/test/integration/legal.test.ts).
// - `values` are the decided configuration values the wording states (estimate validity, deposit, cancellation, photo
//   and draft limits). They are a snapshot of the active policy versions; an integration test checks that they equal
//   the seeded configuration, so a changed policy value needs a new document version. Amounts are integer cents.
// - Every document is a draft that no attorney has reviewed (OQ-ATTORNEY-PRIVACY): the pages show the banner
//   "Draft - not reviewed by an attorney" while `attorneyReviewed` is false. Wording the graph does not decide is
//   never written; a `pending` block shows openly what still waits on review, citing the open question.

export type LegalDocumentCode = 'privacy_notice' | 'sms_terms' | 'website_terms'
export type LegalConfigKey = 'legal.privacy_notice' | 'legal.sms_terms' | 'legal.website_terms'
export type LegalStatus = 'draft' | 'owner_review_pending' | 'approved'

/** One block of a section. Every string is a customer catalog key. */
export type LegalBlock =
  | { readonly kind: 'p'; readonly key: string }
  | { readonly kind: 'list'; readonly keys: readonly string[] }
  /** A visible "pending review" note: the label key, the text key and the open question nodes it waits on. */
  | { readonly kind: 'pending'; readonly label: string; readonly key: string; readonly waitsOn: readonly string[] }
  /** The public phone and email from configuration (business.public_contact); a labelled placeholder until set. */
  | { readonly kind: 'contact'; readonly waitsOn: readonly string[] }
  /** A link to another legal document. */
  | { readonly kind: 'link'; readonly key: string; readonly to: LegalDocumentCode }

export type LegalSection = { readonly id: string; readonly heading: string; readonly blocks: readonly LegalBlock[] }

export type LegalDocument = {
  readonly code: LegalDocumentCode
  readonly configKey: LegalConfigKey
  /** Saved with each request or acceptance; pattern of the request form's privacyNoticeVersion. */
  readonly documentId: string
  readonly version: number
  readonly status: LegalStatus
  readonly attorneyReviewed: boolean
  /** The date this version was drafted (YYYY-MM-DD). */
  readonly preparedOn: string
  readonly path: string
  readonly title: string
  readonly summary: string
  readonly sections: readonly LegalSection[]
  /** Configured values stated by the wording, keyed by ICU placeholder; names ending in `Cents` are amounts. */
  readonly values: Readonly<Record<string, number>>
  /** SHA-256 (hex) of `legalContent(document, catalog)`. */
  readonly contentSha256: string
  /** The nodes the document is drafted from. */
  readonly sources: readonly string[]
}

/** The open question every draft waits on before production (OWN-DEC-72). */
export const ATTORNEY_REVIEW = 'OQ-ATTORNEY-PRIVACY'

const p = (key: string): LegalBlock => ({ kind: 'p', key })
const list = (...keys: string[]): LegalBlock => ({ kind: 'list', keys })
const pending = (label: string, key: string, ...waitsOn: string[]): LegalBlock => ({
  kind: 'pending',
  label,
  key,
  waitsOn,
})
const link = (key: string, to: LegalDocumentCode): LegalBlock => ({ kind: 'link', key, to })
/** The support contact waits on the owner's real phone and email (FACT-PUBLIC-CONTACT, OWN-DEC-131). */
const contact: LegalBlock = { kind: 'contact', waitsOn: ['FACT-PUBLIC-CONTACT', 'OWN-DEC-131'] }

/** One name everywhere (HH-COM-12, FACT-LEGAL-ENTITY): the brand and the legal entity, the same on every page. */
export const ENTITY_KEY = 'legal.common.entity'
/** The SMS sharing statement of OWN-DEC-147, word for word the same in the privacy policy and the SMS terms. */
export const SMS_NO_SHARING_KEY = 'legal.common.smsNoSharing'

export const PRIVACY_NOTICE: LegalDocument = {
  code: 'privacy_notice',
  configKey: 'legal.privacy_notice',
  documentId: 'privacy-notice-1',
  version: 1,
  status: 'draft',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  path: '/privacy',
  title: 'legal.privacy.title',
  summary: 'legal.privacy.summary',
  sections: [
    { id: 'who', heading: 'legal.privacy.who.heading', blocks: [p(ENTITY_KEY), p('legal.common.entityMeaning')] },
    {
      id: 'collect',
      heading: 'legal.privacy.collect.heading',
      blocks: [
        p('legal.privacy.collect.intro'),
        list(
          'legal.privacy.collect.request',
          'legal.privacy.collect.property',
          'legal.privacy.collect.contact',
          'legal.privacy.collect.choices',
          'legal.privacy.collect.photos',
          'legal.privacy.collect.project',
          'legal.privacy.collect.payments',
          'legal.privacy.collect.access',
          'legal.privacy.collect.signin',
          'legal.privacy.collect.technical',
        ),
        p('legal.privacy.collect.draft'),
        p('legal.privacy.collect.noTracking'),
      ],
    },
    {
      id: 'use',
      heading: 'legal.privacy.use.heading',
      blocks: [
        list(
          'legal.privacy.use.review',
          'legal.privacy.use.contact',
          'legal.privacy.use.work',
          'legal.privacy.use.identity',
          'legal.privacy.use.records',
          'legal.privacy.use.protect',
        ),
        p('legal.privacy.use.marketing'),
      ],
    },
    {
      id: 'access',
      heading: 'legal.privacy.access.heading',
      blocks: [
        p('legal.privacy.access.staff'),
        p('legal.privacy.access.providers'),
        list(
          'legal.privacy.access.render',
          'legal.privacy.access.r2',
          'legal.privacy.access.bird',
          'legal.privacy.access.resend',
          'legal.privacy.access.square',
        ),
        p('legal.privacy.access.signin'),
      ],
    },
    {
      id: 'sms',
      heading: 'legal.privacy.sms.heading',
      blocks: [
        p('legal.privacy.sms.optIn'),
        p(SMS_NO_SHARING_KEY),
        p('legal.privacy.sms.bird'),
        p('legal.privacy.sms.stop'),
        link('legal.privacy.sms.termsLink', 'sms_terms'),
      ],
    },
    {
      id: 'photos',
      heading: 'legal.privacy.photos.heading',
      blocks: [
        p('legal.privacy.photos.use'),
        p('legal.privacy.photos.access'),
        p('legal.privacy.photos.publish'),
        p('legal.privacy.photos.avoid'),
      ],
    },
    {
      id: 'retention',
      heading: 'legal.privacy.retention.heading',
      blocks: [
        p('legal.privacy.retention.intro'),
        list(
          'legal.privacy.retention.requests',
          'legal.privacy.retention.estimates',
          'legal.privacy.retention.profiles',
          'legal.privacy.retention.accepted',
          'legal.privacy.retention.financial',
          'legal.privacy.retention.operational',
          'legal.privacy.retention.safety',
          'legal.privacy.retention.accessCodes',
          'legal.privacy.retention.sessions',
          'legal.privacy.retention.audit',
        ),
        p('legal.privacy.retention.longer'),
        pending('legal.common.pendingCpaAttorney', 'legal.privacy.retention.pending', 'OQ-RETENTION-REVIEW'),
      ],
    },
    {
      id: 'choices',
      heading: 'legal.privacy.choices.heading',
      blocks: [
        list(
          'legal.privacy.choices.texts',
          'legal.privacy.choices.marketing',
          'legal.privacy.choices.requests',
          'legal.privacy.choices.account',
        ),
      ],
    },
    { id: 'contact', heading: 'legal.privacy.contact.heading', blocks: [p('legal.privacy.contact.intro'), contact] },
    { id: 'changes', heading: 'legal.privacy.changes.heading', blocks: [p('legal.privacy.changes.text')] },
  ],
  values: { maxRequestPhotos: 10, requestDraftDays: 7 },
  contentSha256: '5ed008ea955d654bcd37008a7ae9e45f009d9d49734ab44f13c1c62003938d18',
  sources: [
    'HH-PRIV-04',
    'HH-PRIV-01',
    'HH-COM-12',
    'OWN-DEC-72',
    'OWN-DEC-147',
    'FACT-RETENTION-SCHEDULE',
    'INT-Render',
    'INT-R2',
    'INT-Bird',
    'INT-Resend',
    'INT-Square',
  ],
}

export const SMS_TERMS: LegalDocument = {
  code: 'sms_terms',
  configKey: 'legal.sms_terms',
  documentId: 'sms-terms-1',
  version: 1,
  status: 'draft',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  path: '/sms-terms',
  title: 'legal.sms.title',
  summary: 'legal.sms.summary',
  sections: [
    {
      id: 'program',
      heading: 'legal.sms.program.heading',
      blocks: [p(ENTITY_KEY), p('legal.sms.program.name'), p('legal.sms.program.what')],
    },
    {
      id: 'opt-in',
      heading: 'legal.sms.optIn.heading',
      blocks: [p('legal.sms.optIn.how'), p('legal.sms.optIn.optional'), p('legal.sms.optIn.marketing')],
    },
    {
      id: 'messages',
      heading: 'legal.sms.messages.heading',
      blocks: [
        p('legal.sms.messages.automaticIntro'),
        list(
          'legal.sms.messages.receipt',
          'legal.sms.messages.code',
          'legal.sms.messages.access',
          'legal.sms.messages.question',
          'legal.sms.messages.visitOptions',
          'legal.sms.messages.notAFit',
          'legal.sms.messages.estimateReady',
          'legal.sms.messages.approvalReceipt',
          'legal.sms.messages.appointment',
          'legal.sms.messages.onMyWay',
          'legal.sms.messages.invoiceReady',
          'legal.sms.messages.paymentReceipt',
        ),
        p('legal.sms.messages.remindersIntro'),
        list(
          'legal.sms.messages.reminderEstimate',
          'legal.sms.messages.reminderQuestion',
          'legal.sms.messages.reminderAppointment',
          'legal.sms.messages.reminderSatisfaction',
          'legal.sms.messages.reminderInvoice',
          'legal.sms.messages.reminderRepeat',
        ),
        p('legal.sms.messages.replies'),
        p('legal.sms.messages.content'),
      ],
    },
    { id: 'frequency', heading: 'legal.sms.frequency.heading', blocks: [p('legal.sms.frequency.text')] },
    { id: 'rates', heading: 'legal.sms.rates.heading', blocks: [p('legal.sms.rates.text')] },
    {
      id: 'stop',
      heading: 'legal.sms.stop.heading',
      blocks: [p('legal.sms.stop.text'), p('legal.sms.stop.effect'), p('legal.sms.stop.start')],
    },
    {
      id: 'help',
      heading: 'legal.sms.help.heading',
      blocks: [p('legal.sms.help.text'), p('legal.sms.help.contact'), contact],
    },
    {
      id: 'privacy',
      heading: 'legal.sms.privacy.heading',
      blocks: [p(SMS_NO_SHARING_KEY), link('legal.sms.privacy.link', 'privacy_notice')],
    },
    { id: 'changes', heading: 'legal.sms.changes.heading', blocks: [p('legal.sms.changes.text')] },
  ],
  values: {},
  contentSha256: 'e90bae868d5de8ad9e5ab4c5e92d848099282742953170925bbf253649d62102',
  sources: ['HH-COM-12', 'OWN-DEC-147', 'FACT-AUTOMATIC-MESSAGES', 'FACT-REMINDER-CADENCES', 'HH-INT-22', 'HH-COM-05'],
}

export const WEBSITE_TERMS: LegalDocument = {
  code: 'website_terms',
  configKey: 'legal.website_terms',
  documentId: 'website-terms-1',
  version: 1,
  status: 'draft',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  path: '/terms',
  title: 'legal.terms.title',
  summary: 'legal.terms.summary',
  sections: [
    { id: 'who', heading: 'legal.terms.who.heading', blocks: [p(ENTITY_KEY), p('legal.common.entityMeaning')] },
    {
      id: 'requests',
      heading: 'legal.terms.requests.heading',
      blocks: [p('legal.terms.requests.guest'), p('legal.terms.requests.notAJob'), p('legal.terms.requests.project')],
    },
    {
      id: 'estimates',
      heading: 'legal.terms.estimates.heading',
      blocks: [
        p('legal.terms.estimates.free'),
        p('legal.terms.estimates.validity'),
        p('legal.terms.estimates.approval'),
        p('legal.terms.estimates.noMinimum'),
      ],
    },
    { id: 'appointments', heading: 'legal.terms.appointments.heading', blocks: [p('legal.terms.appointments.text')] },
    { id: 'changes-to-work', heading: 'legal.terms.scope.heading', blocks: [p('legal.terms.scope.text')] },
    {
      id: 'payment',
      heading: 'legal.terms.payment.heading',
      blocks: [
        p('legal.terms.payment.deposit'),
        p('legal.terms.payment.invoice'),
        p('legal.terms.payment.methods'),
        p('legal.terms.payment.recorded'),
      ],
    },
    {
      id: 'cancellation',
      heading: 'legal.terms.cancellation.heading',
      blocks: [
        list(
          'legal.terms.cancellation.reschedule',
          'legal.terms.cancellation.early',
          'legal.terms.cancellation.late',
          'legal.terms.cancellation.started',
          'legal.terms.cancellation.byHandyHub',
        ),
        pending('legal.common.pendingAttorney', 'legal.terms.cancellation.pending', 'OQ-ATTORNEY-TERMS'),
      ],
    },
    {
      id: 'warranty',
      heading: 'legal.terms.warranty.heading',
      blocks: [
        p('legal.terms.warranty.text'),
        pending('legal.common.pendingAttorney', 'legal.terms.warranty.pending', 'OQ-ATTORNEY-TERMS'),
      ],
    },
    {
      id: 'messages',
      heading: 'legal.terms.messages.heading',
      blocks: [p('legal.terms.messages.text'), link('legal.terms.messages.link', 'sms_terms')],
    },
    {
      id: 'privacy',
      heading: 'legal.terms.privacy.heading',
      blocks: [p('legal.terms.privacy.text'), link('legal.terms.privacy.link', 'privacy_notice')],
    },
    {
      id: 'not-covered',
      heading: 'legal.terms.notCovered.heading',
      blocks: [pending('legal.common.pendingAttorney', 'legal.terms.notCovered.text', 'OQ-ATTORNEY-TERMS')],
    },
    { id: 'contact', heading: 'legal.terms.contact.heading', blocks: [p('legal.terms.contact.intro'), contact] },
    { id: 'changes', heading: 'legal.terms.changes.heading', blocks: [p('legal.terms.changes.text')] },
  ],
  values: {
    estimateValidityDays: 14,
    depositThresholdCents: 100000,
    depositPercent: 20,
    cancellationNoticeHours: 24,
    lateCancellationCents: 5000,
  },
  contentSha256: 'de1b9a77f20c3afd511838688f47b6ff6af97b3d07cdd20ad20344b80dbc94f4',
  sources: [
    'HH-PRIV-04',
    'OWN-DEC-72',
    'OWN-DEC-127',
    'FACT-CANCELLATION-RULES',
    'FACT-WARRANTY',
    'FACT-DEPOSIT-RULE',
    'FACT-ESTIMATE-VALIDITY',
    'FACT-PAYMENT-DUE',
    'FACT-PAYMENT-METHODS',
    'FACT-NO-MINIMUM',
  ],
}

/** The three documents in footer order. */
export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [PRIVACY_NOTICE, SMS_TERMS, WEBSITE_TERMS]

export function legalDocument(code: LegalDocumentCode): LegalDocument {
  const doc = LEGAL_DOCUMENTS.find((d) => d.code === code)
  if (!doc) throw new RangeError(`unknown legal document ${code}`)
  return doc
}

/** Every catalog key of a document, in reading order (title, summary, then each section). */
export function legalKeys(doc: LegalDocument): string[] {
  const keys = [doc.title, doc.summary]
  for (const s of doc.sections) {
    keys.push(s.heading)
    for (const b of s.blocks) {
      if (b.kind === 'p' || b.kind === 'link') keys.push(b.key)
      else if (b.kind === 'list') keys.push(...b.keys)
      else if (b.kind === 'pending') keys.push(b.label, b.key)
    }
  }
  return keys
}

/** Every open question a document's pending blocks and contact blocks wait on, plus the attorney review itself. */
export function legalPendingItems(doc: LegalDocument): string[] {
  const ids = new Set<string>([ATTORNEY_REVIEW])
  for (const s of doc.sections)
    for (const b of s.blocks) if (b.kind === 'pending' || b.kind === 'contact') b.waitsOn.forEach((id) => ids.add(id))
  return [...ids]
}

/**
 * The canonical content the hash covers: the document ID and version, its values, and every catalog key with its
 * wording in reading order (a missing key is null, so it cannot hash like a present one).
 */
export function legalContent(doc: LegalDocument, catalog: Readonly<Record<string, string>>): string {
  const values = Object.fromEntries(Object.entries(doc.values).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return JSON.stringify({
    documentId: doc.documentId,
    version: doc.version,
    values,
    text: legalKeys(doc).map((k) => [k, Object.hasOwn(catalog, k) ? catalog[k] : null]),
  })
}
