// The legal documents: versioned content, the A2P 10DLC elements and no invented legal facts (TSK-0024; HH-PRIV-04,
// HH-COM-12, OWN-DEC-72, OWN-DEC-147, RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW, T76).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ENTITY_KEY,
  legalContent,
  legalKeys,
  legalPendingItems,
  legalTextContent,
  legalTextKeys,
  PRIVACY_NOTICE,
  SMS_DISCLOSURE,
  SMS_NO_SHARING_KEY,
  SMS_TERMS,
  WEBSITE_TERMS,
  type LegalDocument,
} from '@handyhub/domain/legal'
import { REQUEST_FORM_SCHEMA } from '@handyhub/domain/request-form'
import { CATALOGS, customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { copyProblems } from '../src/site/claims.js'
import { isDraft, LEGAL_DOCUMENTS, legalLinks, legalValues, preparedOnText, statedAmounts } from '../src/site/legal.js'

const customer: Record<string, string> = CATALOGS['customer.en']
const SRC = fileURLToPath(new URL('../src', import.meta.url))
const KG = fileURLToPath(new URL('../../../kg', import.meta.url))
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

/** The rendered text of a document: every catalog value with the document's values filled in. */
function text(doc: LegalDocument): string {
  const values = legalValues(doc)
  return legalKeys(doc)
    .map((k) => customerTranslator().t(k as CustomerKey, values))
    .join('\n')
}
/** The rendered text of one section. */
function section(doc: LegalDocument, id: string): string {
  const s = doc.sections.find((x) => x.id === id)
  if (!s) throw new Error(`no section ${id}`)
  return text({ ...doc, title: s.heading, summary: s.heading, sections: [s] })
}
function nodeStatus(id: string): string | undefined {
  for (const dir of readdirSync(KG, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const file = join(KG, dir.name, `${id}.md`)
    if (existsSync(file)) return /^status:\s*(\S+)/m.exec(readFileSync(file, 'utf8'))?.[1]
  }
  return undefined
}

describe('legal documents are versioned policy data (TSK-0024, HH-PRIV-04, ENT-PolicyVersion)', () => {
  it('[HH-PRIV-04] each document hashes to its recorded SHA-256: wording changes need a new version', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      const hash = createHash('sha256').update(legalContent(doc, customer), 'utf8').digest('hex')
      expect(hash, doc.documentId).toBe(doc.contentSha256)
    }
  })

  it('[HH-PRIV-04] every key exists in the English customer catalog and every placeholder has a value', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const key of legalKeys(doc)) expect(Object.hasOwn(customer, key), key).toBe(true)
      // The translator throws on a missing placeholder value.
      expect(() => text(doc)).not.toThrow()
      expect(text(doc)).not.toMatch(/[{}]/)
    }
  })

  it('[HH-PRIV-04] IDs are unique, fit the request field, and the pages exist at their paths', () => {
    const pattern = new RegExp((REQUEST_FORM_SCHEMA.properties.privacyNoticeVersion as { pattern: string }).pattern)
    expect(new Set(LEGAL_DOCUMENTS.map((d) => d.documentId)).size).toBe(3)
    for (const doc of LEGAL_DOCUMENTS) expect(doc.documentId).toMatch(pattern)
    expect(LEGAL_DOCUMENTS.map((d) => d.path)).toEqual(['/privacy', '/sms-terms', '/terms'])
    for (const page of ['privacy', 'sms-terms', 'terms'])
      expect(read(`pages/${page}.astro`)).toContain('<LegalDocument')
  })

  it('[HH-PRIV-04][OWN-DEC-72] every version is a draft no attorney has reviewed, so the banner shows', () => {
    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.status).toBe('draft')
      expect(doc.attorneyReviewed).toBe(false)
      expect(isDraft(doc)).toBe(true)
      expect(legalPendingItems(doc)).toContain('OQ-ATTORNEY-PRIVACY')
    }
    expect(customer['legal.common.draftBanner']).toBe('Draft - not reviewed by an attorney')
    expect(isDraft({ ...PRIVACY_NOTICE, status: 'approved', attorneyReviewed: true })).toBe(false)
    expect(isDraft({ ...PRIVACY_NOTICE, status: 'approved', attorneyReviewed: false })).toBe(true)
  })

  it('[RULE-MONEY-CENTS] amounts come from integer cents; the draft date never shifts with the time zone', () => {
    expect(legalValues(WEBSITE_TERMS)).toMatchObject({ depositThreshold: '$1,000.00', lateCancellation: '$50.00' })
    expect(Object.values(WEBSITE_TERMS.values).every(Number.isSafeInteger)).toBe(true)
    expect(preparedOnText('2026-10-21')).toBe('October 21, 2026')
    expect(() => preparedOnText('21/10/2026')).toThrow()
  })
})

describe('A2P 10DLC website elements (TSK-0024, HH-COM-12, OWN-DEC-147, T76)', () => {
  it('[HH-COM-12][T76] the privacy policy has an SMS section with the no-sharing statement', () => {
    const sms = section(PRIVACY_NOTICE, 'sms')
    expect(customer[SMS_NO_SHARING_KEY]).toBe(
      'Mobile numbers and SMS opt-in data are never shared with or sold to third parties for marketing purposes.',
    )
    expect(sms).toContain(customer[SMS_NO_SHARING_KEY])
    expect(sms).toMatch(/Having your phone number is never permission to text you/)
  })

  it('[HH-COM-12][T76] the SMS terms name the program, message types, frequency, rates, STOP, HELP and support', () => {
    expect(section(SMS_TERMS, 'program')).toMatch(/Program name: HandyHub Service Texts\./)
    const messages = section(SMS_TERMS, 'messages')
    for (const type of [
      /receipt for your request/,
      /verification codes/,
      /view your project/,
      /question about your request/,
      /visit options/,
      /cannot take on your request/,
      /estimate is ready/,
      /approve an estimate/,
      /work appointment/,
      /on my way/,
      /invoice is ready/,
      /payment receipt/,
      /estimate you have not answered/,
      /question you have not answered/,
      /before each confirmed appointment/,
      /satisfaction check/,
      /unpaid invoice/,
      /Repeat-service reminders/,
    ])
      expect(messages).toMatch(type)
    expect(section(SMS_TERMS, 'frequency')).toMatch(/^Message frequency/m)
    expect(section(SMS_TERMS, 'rates')).toContain('Message and data rates may apply.')
    expect(section(SMS_TERMS, 'stop')).toContain('Reply STOP to opt out.')
    expect(section(SMS_TERMS, 'stop')).toContain('Reply START')
    expect(section(SMS_TERMS, 'help')).toContain('Reply HELP for help.')
    expect(SMS_TERMS.sections.find((s) => s.id === 'help')?.blocks.some((b) => b.kind === 'contact')).toBe(true)
    expect(section(SMS_TERMS, 'privacy')).toContain(customer[SMS_NO_SHARING_KEY])
  })

  it('[HH-COM-12][HH-INT-22] opt-in is by the unchecked SMS box, separate from terms and marketing', () => {
    const optIn = section(SMS_TERMS, 'opt-in')
    expect(optIn).toMatch(/not checked in advance/)
    expect(optIn).toMatch(/separate from accepting any terms and from marketing permission/)
    expect(optIn).toMatch(/separate marketing permission/)
  })

  it('[HH-COM-12][FACT-LEGAL-ENTITY] one brand and legal-entity name on every document and in the footer', () => {
    expect(customer[ENTITY_KEY]).toBe(
      'HandyHub is the brand name of ODD JOBS & MORE LLC, a Kentucky limited liability company.',
    )
    for (const doc of LEGAL_DOCUMENTS) expect(legalKeys(doc)).toContain(ENTITY_KEY)
    expect(read('components/SiteFooter.astro')).toContain(`t.t('${ENTITY_KEY}')`)
    // No other entity name is used: the relation to "Handyhub LLC" on documents is open (OQ-LEGAL-ENTITY-NAME).
    for (const doc of LEGAL_DOCUMENTS) {
      const all = text(doc)
      expect(all).not.toMatch(/Handyhub LLC|\bDBA\b|doing business as/i)
      expect(all.match(/\b[A-Z][\w&' ]* LLC\b/g)?.every((m) => m.endsWith('ODD JOBS & MORE LLC'))).toBe(true)
    }
  })

  it('[HH-COM-12][HH-CUS-05] the footer and the request page link to every legal document', () => {
    expect(legalLinks().map((l) => [l.href, customer[l.label]])).toEqual([
      ['/privacy', 'Privacy Policy'],
      ['/sms-terms', 'SMS Terms'],
      ['/terms', 'Website Terms'],
    ])
    expect(read('components/SiteFooter.astro')).toContain('<LegalLinks />')
    expect(read('pages/request.astro')).toContain('<LegalLinks />')
  })
})

describe('actual practice only; nothing invented (TSK-0024, HH-PRIV-04, RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW)', () => {
  it('[HH-PRIV-04] the privacy policy names exactly the services in use, each with its purpose', () => {
    const access = section(PRIVACY_NOTICE, 'access')
    for (const vendor of [
      /Render hosts/,
      /Cloudflare R2 keeps photos and documents/,
      /Bird sends and receives our text messages/,
      /Resend sends and receives our email/,
      /Square processes card payments.*outside our software/,
    ])
      expect(access).toMatch(vendor)
    expect(access).toMatch(/own login; no outside sign-in service/)
    for (const doc of LEGAL_DOCUMENTS)
      expect(text(doc)).not.toMatch(/Telnyx|ZITADEL|Google|Stripe|Twilio|analytics provider/i)
  })

  it('[HH-PRIV-04] the privacy policy covers each required topic', () => {
    expect(PRIVACY_NOTICE.sections.map((s) => s.id)).toEqual([
      'who',
      'collect',
      'use',
      'access',
      'sms',
      'photos',
      'retention',
      'choices',
      'contact',
      'changes',
    ])
    expect(section(PRIVACY_NOTICE, 'photos')).toMatch(/separate permission for that photo/)
    expect(section(PRIVACY_NOTICE, 'use')).toMatch(/marketing only if you gave separate marketing permission/)
  })

  it('[HH-PRIV-01][FACT-RETENTION-SCHEDULE] the retention periods are the decided schedule, pending CPA and attorney', () => {
    const retention = section(PRIVACY_NOTICE, 'retention')
    for (const period of [
      /never became a job: 2 years/,
      /not accepted: 2 years/,
      /7 years after your last completed service/,
      /change orders: 10 years/,
      /refunds: 7 years after the related tax return/,
      /finish times: 7 years/,
      /incident records: 10 years/,
      /Audit records: 7 years/,
    ])
      expect(retention).toMatch(period)
    expect(retention).toMatch(/nothing is deleted automatically/)
    expect(PRIVACY_NOTICE.sections.find((s) => s.id === 'retention')?.blocks).toContainEqual(
      expect.objectContaining({ kind: 'pending', waitsOn: ['OQ-RETENTION-REVIEW'] }),
    )
  })

  it('[HH-PRIV-04][FACT-CANCELLATION-RULES][FACT-WARRANTY] the terms state the decided rules, with review pending', () => {
    const terms = text(WEBSITE_TERMS)
    expect(terms).toContain('Rescheduling is free.')
    expect(terms).toMatch(/less than 24 hours before the visit.*\$50\.00 is kept from your deposit/)
    expect(terms).toContain('HandyHub gives a 90-day workmanship warranty, counted from the reviewed completion date.')
    expect(terms).toContain('There is no minimum charge.')
    expect(terms).toMatch(/over \$1,000\.00, a deposit of 20% of that total/)
    expect(terms).toMatch(/valid for 14 days/)
    expect(terms).toMatch(/change order/)
    expect(terms).toMatch(/Appointments are confirmed separately/)
    expect(terms).toMatch(/as a guest; creating an account is optional/)
    const pendingOn = WEBSITE_TERMS.sections.flatMap((s) =>
      s.blocks.flatMap((b) => (b.kind === 'pending' ? b.waitsOn : [])),
    )
    expect(pendingOn.filter((id) => id === 'OQ-ATTORNEY-TERMS')).toHaveLength(3)
  })

  it('[RULE-NO-INVENTED-FACTS][OWN-DEC-127] no undecided clause, fee, address or legal claim appears', () => {
    const NEGATIVE = [
      /arbitrat/i,
      /indemn/i,
      /governed by the laws/i,
      /venue/i,
      /(liability|damages) (is|are) limited|not liable|hold harmless/i,
      /late fee|interest on/i,
      /forfeit/i,
      /\bwe (comply|are compliant)\b|complies with|compliant with/i,
      /CCPA|GDPR|KCDPA|consumer data protection act/i,
      /carriers are not liable/i,
      /\b\d{2,5} [A-Z][a-z]+ (Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln)\b/,
      /\b(40|41|42|46|47)\d{3}\b/,
      /\b\d{3}[-. )]\d{3}[-. ]\d{4}\b|@[a-z0-9-]+\.[a-z]{2,}/i,
      /minimum (charge|fee) (of|is) \$/i,
    ]
    for (const doc of LEGAL_DOCUMENTS)
      for (const bad of NEGATIVE) expect(text(doc), `${doc.code} ${bad}`).not.toMatch(bad)
  })

  it('[HH-BASE-04] every legal sentence passes the copy lint (the warranty sentences are registered claims)', () => {
    for (const doc of LEGAL_DOCUMENTS) expect(copyProblems(text(doc), undefined, statedAmounts()), doc.code).toEqual([])
    // Only the stated amounts are allowed, and only as exact text: any other price is still a problem.
    expect(statedAmounts().sort()).toEqual(['$1,000.00', '$50.00'])
    expect(copyProblems('A visit costs $75.00.', undefined, statedAmounts()).map((p) => p.match)).toEqual(['$7'])
  })

  it('[RULE-HUMAN-REVIEW] every pending note waits on a question that is still open in the graph', () => {
    const waits = LEGAL_DOCUMENTS.flatMap((d) =>
      d.sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'pending' ? b.waitsOn : []))),
    )
    expect(new Set(waits)).toEqual(new Set(['OQ-RETENTION-REVIEW', 'OQ-ATTORNEY-TERMS']))
    for (const id of [...waits, 'OQ-ATTORNEY-PRIVACY']) expect(nodeStatus(id), id).toBe('open')
    // The support contact is a placeholder until the owner gives the real phone and email (OWN-DEC-131).
    expect(nodeStatus('OWN-DEC-131')).toBe('active')
    for (const doc of LEGAL_DOCUMENTS) for (const id of legalPendingItems(doc)) expect(nodeStatus(id), id).toBeDefined()
  })
})

describe('the SMS opt-in disclosure beside the request-form checkbox (TSK-0029, HH-INT-22, HH-COM-12, T76)', () => {
  const disclosure = legalTextKeys(SMS_DISCLOSURE).map((k) => customerTranslator().t(k as CustomerKey))
  const all = disclosure.join('\n')

  it('[HH-INT-22][ENT-PolicyVersion] is a versioned draft text whose hash covers its exact wording', () => {
    const hash = createHash('sha256').update(legalTextContent(SMS_DISCLOSURE, customer), 'utf8').digest('hex')
    expect(hash).toBe(SMS_DISCLOSURE.contentSha256)
    for (const key of legalTextKeys(SMS_DISCLOSURE)) expect(Object.hasOwn(customer, key), key).toBe(true)
    expect(SMS_DISCLOSURE).toMatchObject({ documentId: 'sms-disclosure-1', status: 'draft', attorneyReviewed: false })
    const pattern = new RegExp((REQUEST_FORM_SCHEMA.properties.smsDisclosureVersion as { pattern: string }).pattern)
    expect(SMS_DISCLOSURE.documentId).toMatch(pattern)
    expect(LEGAL_DOCUMENTS.map((d) => d.documentId)).not.toContain(SMS_DISCLOSURE.documentId)
  })

  it('[HH-INT-22][HH-COM-12][T76] names the program and message types, frequency, rates, STOP, HELP, support and links', () => {
    expect(customer[SMS_DISCLOSURE.label]).toBe('I agree to receive HandyHub Service Texts at the phone number above.')
    expect(all).toMatch(/HandyHub Service Texts are messages about your estimate requests, projects, appointments/)
    expect(all).toMatch(/^Message frequency varies/m)
    expect(all).toContain('Message and data rates may apply.')
    expect(all).toContain('Reply STOP to opt out.')
    expect(all).toContain('Reply HELP for help.')
    expect(all).toContain('Support contact:')
    expect(SMS_DISCLOSURE.blocks.some((b) => b.kind === 'contact')).toBe(true)
    expect(SMS_DISCLOSURE.blocks.flatMap((b) => (b.kind === 'link' ? [b.to] : []))).toEqual([
      'sms_terms',
      'privacy_notice',
    ])
    // Optional and separate: never required to send, never marketing (OWN-DEC-147).
    expect(all).toMatch(/Texts are optional/)
    expect(all).toMatch(/Sending a request or giving us your phone number is not agreement to texts\./)
    expect(all).toMatch(/separate marketing permission/)
  })

  it('[HH-COM-12] every sentence the SMS terms publish is the same catalog key, so the two never differ', () => {
    const terms = new Set(legalKeys(SMS_TERMS))
    const own = legalTextKeys(SMS_DISCLOSURE).filter((k) => !terms.has(k))
    // Only the checkbox label, the short frequency sentence and the two link labels are the disclosure's own.
    expect(own.sort()).toEqual([
      'legal.link.privacy',
      'legal.link.smsTerms',
      'legal.smsDisclosure.frequency',
      'legal.smsDisclosure.label',
    ])
  })

  it('[RULE-NO-INVENTED-FACTS][HH-BASE-04] passes the copy lint and invents no number, address or claim', () => {
    for (const sentence of disclosure) expect(copyProblems(sentence), sentence).toEqual([])
    expect(all).not.toMatch(/\b\d{3}[-. )]\d{3}[-. ]\d{4}\b|@[a-z0-9-]+\.[a-z]{2,}/i)
    expect(all).not.toMatch(/\bfree\b|guarantee|\d+ (messages|texts|msgs)/i)
    expect(all).not.toMatch(/Handyhub LLC/)
  })

  it('[HH-INT-22] the request wizard shows the label, the blocks and the version, and keeps the box unchecked', () => {
    const wizard = read('request/RequestWizard.tsx')
    expect(wizard).toContain('SMS_DISCLOSURE.label')
    expect(wizard).toContain('SMS_DISCLOSURE.blocks.map')
    expect(wizard).toContain('smsDisclosureVersion: SMS_DISCLOSURE_VERSION')
    expect(wizard).toMatch(/name="smsOptIn"[\s\S]*?checked=\{values\.smsOptIn\}/)
    expect(wizard).not.toMatch(/defaultChecked/)
  })
})
