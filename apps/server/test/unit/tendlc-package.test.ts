// The A2P 10DLC registration package stays equal to the live consent texts (TSK-0133; OWN-DEC-190, OWN-DEC-178,
// HH-COM-12, HH-INT-22, T76, RULE-NO-INVENTED-FACTS). docs/10dlc/registration.md quotes the opt-in wording, the owner's
// samples, the keyword replies and the document versions: each quote is checked here against its source (the customer
// catalog, the legal texts, the owner's decision node and the keyword handler), so a changed text fails until the
// package is updated. The released text templates it quotes are checked against PostgreSQL in the integration test.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ENTITY_KEY,
  legalKeys,
  PRIVACY_NOTICE,
  SMS_DISCLOSURE,
  SMS_NO_SHARING_KEY,
  SMS_TERMS,
  SMS_VERIFICATION_DISCLOSURE,
  WEBSITE_TERMS,
} from '@handyhub/domain/legal'
import { CATALOGS } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { KEYWORD_REPLIES, MESSAGE_TYPES, messageCategory, SMS_KEYWORDS } from '../../src/modules/notifications/index.js'

const ROOT = new URL('../../../../', import.meta.url)
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf8')
/** The package with its line breaks and blockquote markers folded, so a quote may wrap. */
const doc = read('docs/10dlc/registration.md')
  .replace(/\n>\s?/g, ' ')
  .replace(/\s+/g, ' ')
const owner = read('kg/decisions/OWN-DEC-190.md')
const customer: Record<string, string> = CATALOGS['customer.en']
const text = (key: string) => {
  const value = customer[key]
  if (value === undefined) throw new Error(`no catalog key ${key}`)
  return value
}
/** The sentences of a legal text beside its checkbox (its paragraphs). */
const sentences = (t: typeof SMS_DISCLOSURE) => t.blocks.flatMap((b) => (b.kind === 'p' ? [text(b.key)] : []))

/** The owner's ten samples of OWN-DEC-190 section 5: `**Name** "text"`. */
function ownerSamples(): Map<string, string> {
  const section = owner.slice(owner.indexOf('### 5. Sample SMS messages'), owner.indexOf('### 6.'))
  return new Map([...section.matchAll(/\*\*([^*]+)\*\* "([^"]+)"/g)].map((m) => [m[1] as string, m[2] as string]))
}

describe('the package quotes the live opt-in texts (TSK-0133, OWN-DEC-190, HH-INT-22, HH-COM-12)', () => {
  it('[HH-INT-22][OWN-DEC-190][T76] opt-in point A: the label and the disclosure the request form shows', () => {
    const label = text(SMS_DISCLOSURE.label)
    expect(doc).toContain(`"${label}"`)
    for (const s of sentences(SMS_DISCLOSURE).filter((s) => s !== text('legal.sms.help.contact')))
      expect(doc).toContain(`"${s}"`)
    // The documented text is the owner's (OWN-DEC-190 opt-in point A), word for word.
    expect(owner).toContain(`"${label}"`)
    expect(doc).toContain(
      `\`${SMS_DISCLOSURE.documentId}\` (\`${SMS_DISCLOSURE.configKey}\` version ${SMS_DISCLOSURE.version})`,
    )
  })

  it('[OWN-DEC-178][OWN-DEC-190] opt-in point B: the label and the disclosure the receipt shows', () => {
    const label = text(SMS_VERIFICATION_DISCLOSURE.label)
    expect(doc).toContain(`"${label}"`)
    for (const s of sentences(SMS_VERIFICATION_DISCLOSURE)) expect(doc).toContain(`"${s}"`)
    expect(owner).toContain(`"${label}"`)
    expect(doc).toContain(
      `\`${SMS_VERIFICATION_DISCLOSURE.documentId}\` (\`${SMS_VERIFICATION_DISCLOSURE.configKey}\` version ${SMS_VERIFICATION_DISCLOSURE.version})`,
    )
  })

  it('[HH-COM-12] the pages carriers check: the current document versions, the entity and the no-sharing sentence', () => {
    for (const d of [PRIVACY_NOTICE, SMS_TERMS, WEBSITE_TERMS]) {
      expect(doc).toContain(`https://handyhub247.com${d.path} | \`${d.documentId}\``)
      expect(d.attorneyReviewed).toBe(false)
    }
    expect(doc).toContain(`"${text(ENTITY_KEY)}"`)
    expect(doc).toContain(`"${text(SMS_NO_SHARING_KEY)}"`)
    // The SMS terms statements the package names are in the published terms.
    const terms = legalKeys(SMS_TERMS).map(text).join('\n')
    for (const s of ['Message and data rates may apply.', 'Reply STOP to opt out.', 'Reply HELP for help.'])
      expect(terms).toContain(s)
    expect(terms).toContain('Program name: HandyHub Service Texts.')
    expect(terms).toContain('Reply START to receive texts again.')
  })

  it('[RULE-NO-INVENTED-FACTS][OWN-DEC-190] no EIN, address, phone number or email address is written down', () => {
    expect(doc).not.toMatch(/\b\d{2}-\d{7}\b/)
    expect(doc).not.toMatch(/\b\d{3}[-. )]\d{3}[-. ]\d{4}\b|\+1\d{10}/)
    expect(doc).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
    expect(doc).not.toMatch(/\b(40|41|42|46|47)\d{3}\b/)
    expect(doc).not.toMatch(/Handyhub LLC is|Telnyx is/)
    for (const field of [
      'Tax ID (`business_registration_number`) | **NOT CONFIGURED.**',
      'Contact phone (`contact_phone`) | **NOT CONFIGURED**',
      'Contact email (`contact_email`) | **NOT CONFIGURED**',
      '(`business_address_*`) | **NOT CONFIGURED.**',
    ])
      expect(doc).toContain(field)
  })
})

describe('the owner’s samples and the keyword replies (TSK-0133, OWN-DEC-190 section 5, HH-COM-12)', () => {
  it('[OWN-DEC-190] all ten samples are quoted word for word, each checked against what the app sends', () => {
    const samples = ownerSamples()
    expect([...samples.keys()]).toEqual([
      'Request received',
      'Phone verification',
      'Estimate ready',
      'Appointment options',
      'Appointment confirmation',
      'Appointment reminder',
      'Project update',
      'Opt-out confirmation',
      'Help response',
      'Opt-in confirmation',
    ])
    for (const [name, sample] of samples) expect(doc).toContain(`**${name}** "${sample}"`)
  })

  it('[HH-COM-12][OWN-DEC-190] the STOP, HELP and START replies are the owner’s and the package names them', () => {
    const samples = ownerSamples()
    expect(KEYWORD_REPLIES).toEqual({
      optIn: samples.get('Opt-in confirmation'),
      optOut: samples.get('Opt-out confirmation'),
      help: samples.get('Help response'),
    })
    for (const reply of Object.values(KEYWORD_REPLIES)) expect(doc).toContain(`"${reply}"`)
    // The HELP reply waits for the real support contact (FACT-PUBLIC-CONTACT).
    expect(KEYWORD_REPLIES.help).toContain('{verifiedSupportContact}')
  })

  it('[HH-COM-12][HH-COM-05] every keyword the app honours is listed, and the registered lists fit Bird’s limit', () => {
    for (const word of Object.values(SMS_KEYWORDS).flat()) expect(doc).toMatch(new RegExp(`\\b${word}\\b`))
    const optOut = /PROPOSED:\*\* (STOP(?:, [A-Z]+)*)\s*\|/.exec(doc)?.[1]?.split(', ') ?? []
    expect(optOut[0]).toBe('STOP')
    expect(optOut.length).toBeLessThanOrEqual(5)
    for (const word of optOut) expect(SMS_KEYWORDS.stop as readonly string[]).toContain(word)
  })
})

/**
 * Which SMS Terms sentence describes each customer message the registry may text (TSK-0133). Marketing (the review
 * request) is not listed: the terms say marketing texts need separate permission.
 */
const TERMS_SENTENCE: Readonly<Record<string, string>> = {
  'contact.verification_code': 'legal.sms.messages.code',
  'project.access_link': 'legal.sms.messages.access',
  'question.notice': 'legal.sms.messages.question',
  'estimate_visit.options': 'legal.sms.messages.visitOptions',
  'estimate_visit.confirmed': 'legal.sms.messages.visitOptions',
  'decision.not_a_fit': 'legal.sms.messages.notAFit',
  'estimate.ready': 'legal.sms.messages.estimateReady',
  'estimate.question_answered': 'legal.sms.messages.estimateAnswered',
  'approval.receipt': 'legal.sms.messages.approvalReceipt',
  'work_visit.options': 'legal.sms.messages.workOptions',
  'appointment.confirmed': 'legal.sms.messages.appointment',
  'appointment.changed': 'legal.sms.messages.appointment',
  'visit.cancelled': 'legal.sms.messages.visitCancelled',
  'visit.on_the_way': 'legal.sms.messages.onMyWay',
  'invoice.deposit': 'legal.sms.messages.depositInvoice',
  'change_order.proposed': 'legal.sms.messages.proposedChange',
  'invoice.ready': 'legal.sms.messages.invoiceReady',
  'job.complete': 'legal.sms.messages.jobComplete',
  'account.contact_changed': 'legal.sms.messages.accountChanged',
  'staff.reply': 'legal.sms.messages.replies',
  'job.paused': 'legal.sms.messages.workPaused',
  'reminder.unanswered_estimate': 'legal.sms.messages.reminderEstimateOne',
  'reminder.unanswered_question': 'legal.sms.messages.reminderQuestionOne',
  'reminder.satisfaction_check': 'legal.sms.messages.reminderSatisfaction',
  'reminder.repeat_service': 'legal.sms.messages.reminderRepeat',
  'reminder.appointment': 'legal.sms.messages.reminderAppointmentAutomatic',
}

describe('the SMS Terms list the real message types (TSK-0133, HH-COM-12, FACT-AUTOMATIC-MESSAGES)', () => {
  const texted = [...MESSAGE_TYPES.values()].filter(
    (t) => t.audience === 'customer' && t.channels.includes('sms') && messageCategory(t) !== 'marketing',
  )

  it('[HH-COM-12] every customer message the registry may text has its sentence in the SMS terms', () => {
    expect(texted.map((t) => t.key).sort()).toEqual(Object.keys(TERMS_SENTENCE).sort())
    const keys = new Set(legalKeys(SMS_TERMS))
    for (const [message, key] of Object.entries(TERMS_SENTENCE)) expect(keys.has(key), `${message} ${key}`).toBe(true)
  })

  it('[HH-COM-12] the terms list no message type that is never texted', () => {
    const listed = SMS_TERMS.sections
      .flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'list' ? b.keys : [])))
      .filter((k) => k.startsWith('legal.sms.messages.'))
    expect(new Set(listed)).toEqual(
      new Set(
        Object.values(TERMS_SENTENCE).filter(
          (k) => k !== 'legal.sms.messages.replies' && k !== 'legal.sms.messages.workPaused',
        ),
      ),
    )
    // The email-only messages (the request receipt, the payment receipt, the unpaid-invoice reminders).
    for (const key of [
      'request.receipt',
      'payment.receipt',
      'reminder.unpaid_invoice',
      'reminder.unpaid_invoice_follow_up',
    ])
      expect(MESSAGE_TYPES.get(key)?.channels).toEqual(['email'])
  })
})
