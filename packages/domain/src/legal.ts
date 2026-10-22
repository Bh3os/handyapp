// The public legal documents as versioned policy data (TSK-0024; HH-PRIV-04, HH-COM-12, ENT-PolicyVersion, OWN-DEC-72,
// OWN-DEC-147, RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW).
//
// - Three documents: the privacy policy with its SMS section (/privacy), the SMS terms (/sms-terms) and the website
//   terms (/terms). Each has a document ID and version that are seeded as policy versions (legal.* keys, migration
//   0021) with the SHA-256 of their exact content, and the privacy policy's ID is saved with every request.
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
export type LegalConfigKey =
  'legal.privacy_notice' | 'legal.sms_terms' | 'legal.website_terms' | 'legal.sms_disclosure' | 'legal.estimate_terms'
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
  contentSha256: '9b38ab5f48f595035f02897b7f2f5e5680fe2fc8b7eb2c4c2396c17d0d3a3d0d',
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
  contentSha256: '8c517ebdef86604da2cf6891d8231285c7c4909f39ccb2f2935271695c205948',
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

/** What the content hash of a document covers: its ID, version, values and catalog keys (all document kinds). */
export type LegalContentSource = Pick<
  LegalDocument,
  'documentId' | 'version' | 'values' | 'title' | 'summary' | 'sections'
>

/** Every catalog key of a document, in reading order (title, summary, then each section). */
export function legalKeys(doc: LegalContentSource): string[] {
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

function canonical(
  documentId: string,
  version: number,
  values: Readonly<Record<string, number>>,
  keys: readonly string[],
  catalog: Readonly<Record<string, string>>,
): string {
  const sorted = Object.fromEntries(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return JSON.stringify({
    documentId,
    version,
    values: sorted,
    text: keys.map((k) => [k, Object.hasOwn(catalog, k) ? catalog[k] : null]),
  })
}

/**
 * The canonical content the hash covers: the document ID and version, its values, and every catalog key with its
 * wording in reading order (a missing key is null, so it cannot hash like a present one).
 */
export function legalContent(doc: LegalContentSource, catalog: Readonly<Record<string, string>>): string {
  return canonical(doc.documentId, doc.version, doc.values, legalKeys(doc), catalog)
}

/**
 * The SMS opt-in disclosure of the request form (TSK-0029; HH-INT-22, HH-COM-12, OWN-DEC-147, ENT-ConsentPreference).
 * A versioned legal text like the documents, but shown beside the SMS checkbox instead of on a page of its own:
 * - `label` is the checkbox label, the consent statement itself; the blocks sit next to it and describe it.
 * - It names the program and the message types, states the frequency, "Message and data rates may apply", "Reply
 *   STOP to opt out" and "Reply HELP for help", gives the support contact and links to the SMS terms and the privacy
 *   policy. Every sentence that the SMS terms already publish is the same catalog key, so the two never differ.
 * - Checking the box records an SMS consent with this text's `documentId` as the disclosure version; the server
 *   accepts only a published version (legal.sms_disclosure, migration 0024).
 * - A draft awaiting attorney review (OQ-ATTORNEY-PRIVACY). The wording of the label and of the frequency sentence
 *   is PROPOSED: the graph lists what the text must contain, not its sentences.
 */
export type LegalText = {
  readonly code: 'sms_disclosure'
  readonly configKey: LegalConfigKey
  readonly documentId: string
  readonly version: number
  readonly status: LegalStatus
  readonly attorneyReviewed: boolean
  readonly preparedOn: string
  /** The checkbox label (a customer catalog key). */
  readonly label: string
  readonly blocks: readonly LegalBlock[]
  readonly contentSha256: string
  readonly sources: readonly string[]
}

export const SMS_DISCLOSURE: LegalText = {
  code: 'sms_disclosure',
  configKey: 'legal.sms_disclosure',
  documentId: 'sms-disclosure-1',
  version: 1,
  status: 'draft',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  label: 'legal.smsDisclosure.label',
  blocks: [
    p('legal.sms.program.what'),
    p('legal.smsDisclosure.frequency'),
    p('legal.sms.rates.text'),
    p('legal.sms.stop.text'),
    p('legal.sms.help.text'),
    p('legal.sms.optIn.optional'),
    p('legal.sms.optIn.marketing'),
    p('legal.sms.help.contact'),
    contact,
    link('legal.link.smsTerms', 'sms_terms'),
    link('legal.link.privacy', 'privacy_notice'),
  ],
  contentSha256: '56dab52f3acdc48150550556dea7a3551e545213f137f22b7c6cdfca59edac2d',
  sources: ['HH-INT-22', 'HH-COM-12', 'OWN-DEC-147', 'HH-INT-18', 'ENT-ConsentPreference'],
}

/** Every catalog key of a legal text, in reading order (label, then each block). */
export function legalTextKeys(text: LegalText): string[] {
  const keys = [text.label]
  for (const b of text.blocks) {
    if (b.kind === 'p' || b.kind === 'link') keys.push(b.key)
    else if (b.kind === 'list') keys.push(...b.keys)
    else if (b.kind === 'pending') keys.push(b.label, b.key)
  }
  return keys
}

/** The canonical content of a legal text that its hash covers (the same form as legalContent). */
export function legalTextContent(text: LegalText, catalog: Readonly<Record<string, string>>): string {
  return canonical(text.documentId, text.version, {}, legalTextKeys(text), catalog)
}

/**
 * Estimate terms v1.0 (TSK-0056; HH-EST-13, OWN-DEC-127, OWN-DEC-103, OWN-DEC-104, ENT-PolicyVersion,
 * RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW). The terms every published estimate version carries, as a versioned legal
 * document of the same form as the public ones: catalog keys in reading order, the decided values they state and the
 * SHA-256 of the exact content.
 * - Written in plain, numbered English sections from the owner's agreed policies only (OWN-DEC-127): validity,
 *   individual pricing, no tax line, no minimum, nothing extra for paying by card, the deposit rule and its credit, the
 *   scheduling gate, "Payment does not guarantee a particular date." (OWN-DEC-104), payment due on receipt after the
 *   quality review, the payment methods, scope and exclusions, change orders, appointments and reschedule or cancel
 *   requests, safety pauses and the work HandyHub does not do, the walkthrough and quality review, the reopen period,
 *   messages, photos, privacy by reference, the electronic approval record and the business name. A sentence the
 *   public terms already publish is the same catalog key, so the two never differ.
 * - Left out on purpose (HH-EST-13): the cancellation and refund rules and the 90-day warranty (the next version, in
 *   attorney-reviewed wording, OQ-ATTORNEY-TERMS), and every clause no owner decided: no other guarantee, limitation of
 *   liability, indemnity, arbitration or venue, late fees or interest, forfeiture, damage-claim procedure, licensing
 *   or insurance statement. A negative-list test checks the text.
 * - `values` are the decided numbers the wording states, as the active configuration holds them (estimate.validity,
 *   deposit.rule, request.reopen_period); an integration test keeps them equal, so a changed policy needs a new version.
 * - TSK-0144 (OWN-DEC-187): the owner approved v1.0, as written and shown on staging, for real customer approvals
 *   ("I approve v1.0 now", owner answers 2026-10-21 R10-Q2). The status is "approved" and the owner's sign-off is
 *   recorded on the terms version (migration 0073, ESTIMATE_TERMS_V1_RECORD). It is still not attorney-reviewed and
 *   says so: v1.0 needs no attorney review to be in effect because the owner approved it as it is
 *   (attorneyReviewRequired false); the clauses left out of it and the next version (cancellation rules, warranty)
 *   wait for the attorney (OQ-ATTORNEY-TERMS). Staging approvals stay marked TEST, and real customer use still waits
 *   for the launch phases (OWN-DEC-191) and the privacy review (OQ-ATTORNEY-PRIVACY).
 */
export type EstimateTermsDocument = Omit<LegalDocument, 'code' | 'configKey'> & {
  readonly code: 'estimate_terms'
  readonly configKey: 'legal.estimate_terms'
  /** How the version is named to the customer ("1.0"). */
  readonly label: string
  /**
   * Whether this version is in effect only once an attorney has reviewed it. False for v1.0 (the owner approved it as
   * it is, OWN-DEC-187); the next version, with the cancellation rules and the warranty, needs attorney-reviewed
   * wording (HH-EST-13, OQ-ATTORNEY-TERMS).
   */
  readonly attorneyReviewRequired: boolean
  /** The owner's sign-off of this version, as the graph records it; null while the owner has not approved it. */
  readonly ownerSignOff: EstimateTermsOwnerSignOff | null
}

/**
 * The owner's sign-off of an estimate terms version (TSK-0144; OWN-DEC-187), recorded on the terms version as the
 * graph states it: who (the owner), the decision and the answer it was given in, the day, and the owner's words.
 * No staff user is named: the decision is the recorded authorization (OWN-DEC-128, RULE-DECIDED-VALUES-ACTIVE).
 */
export type EstimateTermsOwnerSignOff = {
  readonly by: 'owner'
  /** The owner decision node that approves the version. */
  readonly decisionId: string
  /** Where the owner gave the answer. */
  readonly source: string
  /** The day of the owner's answer (YYYY-MM-DD). */
  readonly signedOn: string
  /** The owner's words, verbatim. */
  readonly wording: string
}

/** The owner's sign-off of terms v1.0 (OWN-DEC-187), exactly as the decision node states it. */
export const ESTIMATE_TERMS_V1_SIGN_OFF: EstimateTermsOwnerSignOff = {
  by: 'owner',
  decisionId: 'OWN-DEC-187',
  source: 'owner answers 2026-10-21 R10-Q2',
  signedOn: '2026-10-21',
  wording: 'I approve v1.0 now',
}

/** The banner every view of terms that are not approved for real customers carries (HH-EST-13, OWN-DEC-127). */
export const ESTIMATE_TERMS_TEST_BANNER = 'legal.estimateTerms.testBanner'

export const ESTIMATE_TERMS: EstimateTermsDocument = {
  code: 'estimate_terms',
  configKey: 'legal.estimate_terms',
  documentId: 'estimate-terms-1',
  version: 1,
  label: '1.0',
  status: 'approved',
  attorneyReviewed: false,
  attorneyReviewRequired: false,
  ownerSignOff: ESTIMATE_TERMS_V1_SIGN_OFF,
  preparedOn: '2026-10-21',
  path: '/portal/terms/estimate-terms-1',
  title: 'legal.estimateTerms.title',
  summary: 'legal.estimateTerms.summary',
  sections: [
    {
      id: 'validity',
      heading: 'legal.estimateTerms.validity.heading',
      blocks: [p('legal.estimateTerms.validity.text')],
    },
    {
      id: 'price',
      heading: 'legal.estimateTerms.price.heading',
      blocks: [
        p('legal.estimateTerms.price.individual'),
        p('legal.estimateTerms.price.noTaxLine'),
        p('legal.terms.estimates.noMinimum'),
        p('legal.estimateTerms.price.sameForEveryMethod'),
      ],
    },
    {
      id: 'deposit',
      heading: 'legal.estimateTerms.deposit.heading',
      blocks: [
        p('legal.terms.payment.deposit'),
        p('legal.estimateTerms.deposit.scheduling'),
        p('legal.estimateTerms.deposit.noDate'),
      ],
    },
    {
      id: 'payment',
      heading: 'legal.estimateTerms.payment.heading',
      blocks: [p('legal.terms.payment.invoice'), p('legal.terms.payment.methods'), p('legal.terms.payment.recorded')],
    },
    {
      id: 'scope',
      heading: 'legal.estimateTerms.scope.heading',
      blocks: [
        p('legal.estimateTerms.scope.approvedVersion'),
        p('legal.estimateTerms.scope.exclusions'),
        p('legal.terms.scope.text'),
      ],
    },
    {
      id: 'appointments',
      heading: 'legal.estimateTerms.appointments.heading',
      blocks: [p('legal.estimateTerms.appointments.separate'), p('legal.estimateTerms.appointments.requests')],
    },
    {
      id: 'safety',
      heading: 'legal.estimateTerms.safety.heading',
      blocks: [p('legal.estimateTerms.safety.pause'), p('service.limits.excluded')],
    },
    {
      id: 'completion',
      heading: 'legal.estimateTerms.completion.heading',
      blocks: [p('legal.estimateTerms.completion.walkthrough'), p('legal.estimateTerms.completion.review')],
    },
    { id: 'reopen', heading: 'legal.estimateTerms.reopen.heading', blocks: [p('legal.estimateTerms.reopen.text')] },
    { id: 'messages', heading: 'legal.terms.messages.heading', blocks: [p('legal.terms.messages.text')] },
    { id: 'photos', heading: 'legal.estimateTerms.photos.heading', blocks: [p('legal.estimateTerms.photos.text')] },
    {
      id: 'privacy',
      heading: 'legal.terms.privacy.heading',
      blocks: [p('legal.terms.privacy.text'), link('legal.terms.privacy.link', 'privacy_notice')],
    },
    {
      id: 'approval-record',
      heading: 'legal.estimateTerms.record.heading',
      blocks: [p('legal.estimateTerms.record.how'), p('legal.estimateTerms.record.what')],
    },
    {
      id: 'business',
      heading: 'legal.estimateTerms.business.heading',
      blocks: [p('legal.estimateTerms.business.name')],
    },
  ],
  values: { estimateValidityDays: 14, depositThresholdCents: 100000, depositPercent: 20, reopenDays: 30 },
  contentSha256: 'c4103d986b8131af92e3733de2d69fefda1a49f57c3665f2faa05b445b8827e3',
  sources: [
    'HH-EST-13',
    'OWN-DEC-127',
    'OWN-DEC-103',
    'OWN-DEC-104',
    'FACT-ESTIMATE-VALIDITY',
    'FACT-DEPOSIT-RULE',
    'FACT-PAYMENT-DUE',
    'FACT-PAYMENT-METHODS',
    'FACT-TAX-NO-LINE',
    'FACT-NO-MINIMUM',
    'FACT-NO-SURCHARGE',
    'FACT-REOPEN-PERIOD',
    'FACT-BUSINESS-NAME',
    'OWN-DEC-51',
    'OWN-DEC-108',
    'OWN-DEC-109',
    'HH-PRIV-02',
    'FACT-AUTOMATIC-MESSAGES',
    'OWN-DEC-187',
  ],
}

/** The estimate terms documents this software holds, by document ID (a pinned ID it does not know has no wording). */
export const ESTIMATE_TERMS_DOCUMENTS: readonly EstimateTermsDocument[] = [ESTIMATE_TERMS]

export function estimateTermsDocument(documentId: string | null | undefined): EstimateTermsDocument | null {
  return ESTIMATE_TERMS_DOCUMENTS.find((d) => d.documentId === documentId) ?? null
}

/**
 * The recorded value of terms v1.0 with the owner's sign-off (TSK-0144, OWN-DEC-187): what migration 0073 records as
 * the active version of legal.estimate_terms. An integration test keeps the migration's row equal to it.
 */
// Plain literals (not read from ESTIMATE_TERMS) so bundles that do not use the terms can leave them out; a test keeps
// them equal to ESTIMATE_TERMS.
export const ESTIMATE_TERMS_V1_RECORD = {
  documentId: 'estimate-terms-1',
  status: 'approved',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  contentSha256: 'c4103d986b8131af92e3733de2d69fefda1a49f57c3665f2faa05b445b8827e3',
  ownerSignOff: ESTIMATE_TERMS_V1_SIGN_OFF,
} as const

/** What a recorded terms version says about its approval (the legal.estimate_terms value). */
export type RecordedTermsApproval = {
  readonly status: string
  readonly attorneyReviewed: boolean
  readonly ownerSignOff?: EstimateTermsOwnerSignOff | null | undefined
}

/**
 * Whether a recorded terms version is in effect for real customer approvals (TSK-0144; OWN-DEC-187, HH-EST-13,
 * OQ-ATTORNEY-TERMS): the version is recorded as approved, and either an attorney reviewed it or the document needs no
 * attorney review and the owner's sign-off is recorded on it. Every other status (draft, owner review pending) is
 * shown as a draft that is not in effect, and approval is refused. The document's `attorneyReviewRequired` comes from
 * this software, never from the recorded row, so a recorded value cannot waive an attorney review.
 */
export function estimateTermsInEffect(
  recorded: RecordedTermsApproval,
  doc: Pick<EstimateTermsDocument, 'attorneyReviewRequired'>,
): boolean {
  if (recorded.status !== 'approved') return false
  if (recorded.attorneyReviewed) return true
  return !doc.attorneyReviewRequired && (recorded.ownerSignOff ?? null) !== null
}

/** Whether the document itself, as this software holds it, is approved for real customers (its own page's banner). */
export function estimateTermsApproved(doc: EstimateTermsDocument): boolean {
  return estimateTermsInEffect(doc, doc)
}
