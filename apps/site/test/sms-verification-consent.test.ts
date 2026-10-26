// The receipt's consent to a one-time verification code by text (TSK-0134; OWN-DEC-178, OWN-DEC-190 opt-in point B,
// HH-INT-13, HH-INT-22, HH-COM-12, ENT-ConsentPreference, RULE-NO-INVENTED-FACTS).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { legalTextContent, legalTextKeys, SMS_DISCLOSURE, SMS_VERIFICATION_DISCLOSURE } from '@handyhub/domain/legal'
import { CATALOGS, customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { copyProblems } from '../src/site/claims.js'
import { LEGAL_DOCUMENTS } from '../src/site/legal.js'

const customer: Record<string, string> = CATALOGS['customer.en']
const SRC = fileURLToPath(new URL('../src', import.meta.url))
const KG = fileURLToPath(new URL('../../../kg', import.meta.url))
const owner = readFileSync(join(KG, 'decisions/OWN-DEC-190.md'), 'utf8')
const t = (key: string) => customerTranslator().t(key as CustomerKey)

describe('the verification-code consent text (TSK-0134, OWN-DEC-178, OWN-DEC-190)', () => {
  it('[OWN-DEC-178][ENT-PolicyVersion] is a versioned draft text of its own whose hash covers its exact wording', () => {
    const hash = createHash('sha256')
      .update(legalTextContent(SMS_VERIFICATION_DISCLOSURE, customer), 'utf8')
      .digest('hex')
    expect(hash).toBe(SMS_VERIFICATION_DISCLOSURE.contentSha256)
    for (const key of legalTextKeys(SMS_VERIFICATION_DISCLOSURE)) expect(Object.hasOwn(customer, key), key).toBe(true)
    expect(SMS_VERIFICATION_DISCLOSURE).toMatchObject({
      documentId: 'sms-verification-disclosure-1',
      configKey: 'legal.sms_verification_disclosure',
      status: 'draft',
      attorneyReviewed: false,
    })
    // Separate from the request form's SMS opt-in and from every published document.
    expect(SMS_VERIFICATION_DISCLOSURE.documentId).not.toBe(SMS_DISCLOSURE.documentId)
    expect(SMS_VERIFICATION_DISCLOSURE.label).not.toBe(SMS_DISCLOSURE.label)
    expect(LEGAL_DOCUMENTS.map((d) => d.documentId)).not.toContain(SMS_VERIFICATION_DISCLOSURE.documentId)
  })

  it('[OWN-DEC-190][RULE-NO-INVENTED-FACTS] the label and the disclosure are the owner’s wording, word for word', () => {
    const label = t(SMS_VERIFICATION_DISCLOSURE.label)
    expect(label).toBe(
      'I agree to receive a one-time SMS verification code from HandyHub at the phone number provided.',
    )
    expect(owner).toContain(`"${label}"`)
    const sentences = SMS_VERIFICATION_DISCLOSURE.blocks.flatMap((b) => (b.kind === 'p' ? [t(b.key)] : []))
    expect(sentences).toEqual([
      'Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services.',
    ])
    for (const s of sentences) expect(owner).toContain(`"${s}"`)
    // Nothing else is written into it: no contact detail, no pending text, no invented sentence.
    expect(SMS_VERIFICATION_DISCLOSURE.blocks.map((b) => b.kind).sort()).toEqual(['link', 'link', 'link', 'p'])
  })

  it('[OWN-DEC-178][OWN-DEC-190][HH-COM-12] links the Privacy Policy, the SMS Terms and the Website Terms', () => {
    expect(SMS_VERIFICATION_DISCLOSURE.blocks.flatMap((b) => (b.kind === 'link' ? [b.to] : []))).toEqual([
      'privacy_notice',
      'sms_terms',
      'website_terms',
    ])
  })

  it('[HH-BASE-04] passes the copy lint', () => {
    for (const key of legalTextKeys(SMS_VERIFICATION_DISCLOSURE)) expect(copyProblems(t(key)), key).toEqual([])
  })
})

describe('the receipt’s checkbox (TSK-0134, OWN-DEC-178)', () => {
  const panel = readFileSync(join(SRC, 'request/ContactVerification.tsx'), 'utf8')

  it('[OWN-DEC-178] the box is unchecked until the guest checks it, beside the label, the disclosure and the links', () => {
    expect(panel).toMatch(/const \[agreed, setAgreed\] = useState\(false\)/)
    expect(panel).toMatch(/name="sms-code-consent"[\s\S]*?checked=\{agreed\}/)
    expect(panel).not.toMatch(/defaultChecked/)
    expect(panel).toContain('SMS_VERIFICATION_DISCLOSURE.label')
    expect(panel).toContain('SMS_VERIFICATION_DISCLOSURE.blocks.map')
  })

  it('[OWN-DEC-178] the consent is recorded before the code is asked for, and nothing happens without the box', () => {
    const flow = panel.slice(panel.indexOf('const agreeAndSend'), panel.indexOf('const change = status.change'))
    expect(flow).toMatch(/if \(!agreed\) return setConsentError/)
    expect(flow.indexOf('api.smsConsent')).toBeGreaterThan(flow.indexOf('if (!agreed)'))
    expect(flow.indexOf('await send()')).toBeGreaterThan(flow.indexOf('api.smsConsent'))
  })

  it('[OWN-DEC-178] declining is never a dead end: the page says the email can be verified instead', () => {
    expect(t('request.verify.smsConsent.intro')).toMatch(/optional/)
    expect(t('request.verify.smsConsent.intro')).toMatch(/verify your email instead/)
    expect(t('request.verify.smsConsent.required')).toMatch(/verify your email instead/)
  })
})
