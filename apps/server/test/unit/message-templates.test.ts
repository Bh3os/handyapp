// The template-variable registry, the branded layout and the message lifecycle (TSK-0119; HH-COM-13, HH-COM-14,
// HH-COM-04, HH-COM-02, OWN-DEC-151, OWN-DEC-152, OWN-DEC-158, T74, T66). Pure functions; every value is synthetic.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  firstNameOf,
  footerLines,
  isIntercepted,
  lifecycleOf,
  linkHostsOf,
  maskDestination,
  MESSAGE_COLOURS,
  MESSAGE_LIFECYCLE,
  MESSAGE_TYPES,
  messageCategory,
  messageType,
  messageTypeProblems,
  parseBody,
  renderTemplate,
  SAMPLE_VALUES,
  suppliedVariables,
  TEMPLATE_VARIABLES,
  TemplateValueError,
  TemplateValuesError,
  templateProblems,
  unwiredVariables,
  valueProblem,
  type ReleasedTemplate,
} from '../../src/modules/notifications/index.js'

/** The owner's 21 template IDs (OWN-DEC-151 section 4) and the seven of the 2026-10-22 answer. */
const OWNER_21 = [
  'request_received',
  'secure_access_link',
  'estimate_visit_options',
  'estimate_visit_confirmed',
  'estimate_reminder',
  'estimate_follow_up',
  'question_reminder',
  'estimate_approval_confirmation',
  'work_appointment_windows',
  'work_appointment_confirmed',
  'appointment_reminder',
  'visit_cancelled',
  'deposit_invoice',
  'proposed_change',
  'work_paused',
  'job_complete',
  'payment_receipt',
  'customer_follow_up',
  'staff_reply_wrapper',
  'staff_customer_replied',
  'account_email_changed',
]
const SEVEN = [
  'verification_code',
  'question_notice',
  'estimate_ready',
  'invoice_ready',
  'not_a_fit',
  'appointment_changed',
  'on_the_way',
]

const customer = (body: string, subject: string | null = 'HandyHub | Synthetic'): ReleasedTemplate => ({
  messageKey: 'staff.reply',
  channel: subject === null ? 'sms' : 'email',
  locale: 'en',
  subject,
  body,
  translationReview: 'source',
  version: 1,
  audience: 'customer',
})
const HOSTS = ['example.test']

describe('[HH-COM-13] one central registry declares every template variable', () => {
  it('[HH-COM-13] every message type uses only registered variables with their registered kinds', () => {
    for (const type of MESSAGE_TYPES.values()) expect(messageTypeProblems(type), type.key).toEqual([])
    for (const [name, spec] of Object.entries(TEMPLATE_VARIABLES)) {
      expect(spec.meaning, name).not.toBe('')
      expect(spec.source, name).not.toBe('')
      // Only reference numbers may appear in a subject; never a name, a link or a code (OWN-DEC-158, T74).
      if (spec.subject) expect(spec.kind, name).toBe('reference')
    }
  })

  it('[HH-COM-13] holds every variable of OWN-DEC-151 section 6, and only the greeting has a fallback', () => {
    const section6 =
      'customerName reference secureAccessLink linkExpiration estimateNumber estimateLink appointmentLink holdExpiration visitNumber visitDate date startTime endTime start end zone timeZone jobNumber serviceName projectLink changeOrderLink invoiceNumber invoiceLink receiptNumber receiptLink paymentNumber staffDisplayName staffMessage staffName staffProjectLink receivedDateTime projectStatus changeDate changeTime supportContact'.split(
        ' ',
      )
    for (const name of section6) expect(Object.keys(TEMPLATE_VARIABLES), name).toContain(name)
    const withFallback = Object.entries(TEMPLATE_VARIABLES).filter(([, s]) => 'fallback' in s)
    expect(withFallback.map(([n]) => n)).toEqual(['customerName'])
    expect(TEMPLATE_VARIABLES.customerName.fallback).toEqual({ line: 'Hi {customerName},', text: 'Hi there,' })
  })

  it('[HH-COM-13] maps the 28 owner template IDs to one message type each', () => {
    const ids = [...MESSAGE_TYPES.values()].flatMap((t) => (t.templateId ? [t.templateId] : []))
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...OWNER_21, ...SEVEN].sort())
    // The mapping the task names (TSK-0119).
    expect(messageType('request.receipt').templateId).toBe('request_received')
    expect(messageType('project.access_link').templateId).toBe('secure_access_link')
    expect(messageType('approval.receipt').templateId).toBe('estimate_approval_confirmation')
    expect(messageType('appointment.confirmed').templateId).toBe('work_appointment_confirmed')
    expect(messageType('reminder.unanswered_estimate').templateId).toBe('estimate_reminder')
    expect(messageType('reminder.unanswered_question').templateId).toBe('question_reminder')
    expect(messageType('reminder.appointment').templateId).toBe('appointment_reminder')
    expect(messageType('staff.reply').templateId).toBe('staff_reply_wrapper')
    expect(messageType('staff_notice.customer_reply').templateId).toBe('staff_customer_replied')
    expect(messageType('account.contact_changed').templateId).toBe('account_email_changed')
  })

  it('[OWN-DEC-152] classifies messages; the one-time code is authentication and work paused is Owner-released', () => {
    expect(messageCategory(messageType('contact.verification_code'))).toBe('authentication')
    expect(messageCategory(messageType('account.contact_changed'))).toBe('account_security')
    expect(messageCategory(messageType('staff_notice.customer_reply'))).toBe('internal')
    expect(messageCategory(messageType('review.request'))).toBe('marketing')
    expect(messageCategory(messageType('request.receipt'))).toBe('transactional')
    expect(messageType('job.paused')).toMatchObject({ ownerApproval: true, triggerEvents: [] })
  })

  it('[HH-COM-13][T74] validates every value by its kind without echoing it', () => {
    expect(valueProblem('customerName', 'Ann\nMarie')).toBe('line_break')
    expect(valueProblem('reference', 'HH-0000TEST')).toBeNull()
    expect(valueProblem('staffMessage', 'Line one\nLine two')).toBeNull()
    expect(valueProblem('staffMessage', 'bell\u0007')).toBe('control_characters')
    expect(valueProblem('customerName', 'x'.repeat(81))).toBe('too_long')
    expect(valueProblem('notRegistered', 'x')).toBe('not_registered')
    expect(valueProblem('projectLink', 'https://example.test/p/1', HOSTS)).toBeNull()
    expect(valueProblem('projectLink', 'https://elsewhere.example/p/1', HOSTS)).toBe('host_not_permitted')
    expect(valueProblem('projectLink', 'http://elsewhere.example/p/1', HOSTS)).toBe('not_https')
    expect(valueProblem('projectLink', 'http://elsewhere.example/p/1')).toBe('not_https')
    // A permitted http origin exists only in local and CI (staging and production refuse http origins).
    expect(valueProblem('projectLink', 'http://example.test/p/1', HOSTS)).toBeNull()
    expect(valueProblem('projectLink', 'http://127.0.0.1:4510/p/1')).toBeNull()
    expect(valueProblem('projectLink', 'javascript:alert(1)')).toBe('not_https')
    expect(valueProblem('projectLink', 'https://user:pw@example.test/')).toBe('has_credentials')
    expect(valueProblem('secureAccessLink', 'not a url')).toBe('not_a_url')
    expect(linkHostsOf('https://handyhub247.example', 'http://127.0.0.1:4510/staff', undefined, 'nonsense')).toEqual([
      'handyhub247.example',
      '127.0.0.1',
    ])
  })

  it('[OWN-DEC-158] greets the first word of the full name only when it is a plain name', () => {
    expect(firstNameOf('Sam Synthetic')).toBe('Sam')
    expect(firstNameOf("  O'Neil  Test")).toBe("O'Neil")
    expect(firstNameOf('')).toBe('')
    expect(firstNameOf(null)).toBe('')
    expect(firstNameOf('123 Main')).toBe('')
    expect(firstNameOf('<b>x</b>')).toBe('')
  })

  it('[HH-COM-13] synthetic samples exist for every variable and pass their own checks on example.test', () => {
    for (const name of Object.keys(TEMPLATE_VARIABLES)) {
      const sample = SAMPLE_VALUES[name as keyof typeof SAMPLE_VALUES]
      expect(sample, name).toBeTypeOf('string')
      expect(valueProblem(name, sample, HOSTS), name).toBeNull()
    }
  })
})

describe('[HH-COM-13][OWN-DEC-158] release checks refuse what a template may never carry', () => {
  it('[OWN-DEC-158] refuses the property address, names or links in a subject, and the first name outside the greeting', () => {
    const appt = (body: string, subject: string | null = null) =>
      templateProblems({
        messageKey: 'reminder.appointment',
        channel: subject === null ? 'sms' : 'email',
        locale: 'en',
        subject,
        body,
        translationReview: 'source',
      })
    expect(appt('{visitWindow} {serviceAddress}').join()).toMatch(/no customer message shows/)
    expect(appt('Hi {customerName},\n\n{date}')).toEqual([])
    expect(appt('Dear {customerName}, {date}').join()).toMatch(/only in its greeting line/)
    expect(appt('x', 'HandyHub | {customerName}').join()).toMatch(/subject never carries \{customerName\}/)
    expect(appt('x', 'HandyHub | {projectLink}').join()).toMatch(/subject never carries \{projectLink\}/)
    expect(appt('x', 'HandyHub | Visit #{visitNumber}')).toEqual([])
    expect(appt('{depositAmount}').length).toBeGreaterThan(0)
  })

  it('[HH-COM-13] knows which released variables a resolver does not supply yet', () => {
    // TSK-0120 wired the events that exist today; a message whose event does not exist yet (the job complete notice,
    // TSK-0092) still supplies nothing. TSK-0085 wired the deposit invoice.
    expect(suppliedVariables(messageType('request.receipt'))).toContain('customerName')
    expect(suppliedVariables(messageType('job.complete'))).toEqual([])
    expect(
      unwiredVariables({
        messageKey: 'job.complete',
        subject: 'HandyHub | Your Project #{jobNumber} Is Complete',
        body: 'Hi {customerName},\n\n#{jobNumber}',
      }),
    ).toEqual(['customerName', 'jobNumber'])
    expect(
      unwiredVariables({
        messageKey: 'invoice.deposit',
        subject: 'HandyHub | Deposit Invoice #{invoiceNumber}',
        body: 'Hi {customerName},\n\n#{jobNumber} {invoiceLink}',
      }),
    ).toEqual([])
    expect(
      unwiredVariables({ messageKey: 'question.notice', subject: null, body: 'Hi {customerName}, {projectLink}' }),
    ).toEqual([])
  })
})

describe('[HH-COM-13] the branded layout renders subject, HTML and plain text from one version', () => {
  const body = [
    'Hi {customerName},',
    'You have a new message regarding your project #{reference}.',
    '**Message from {staffDisplayName}:**',
    '{staffMessage}',
    '- First synthetic item\n- Second **bold** item',
    '{projectLink}',
    'The HandyHub Team',
  ].join('\n\n')
  const values = {
    customerName: 'Sam',
    reference: 'HH-0000TEST',
    staffDisplayName: 'Synthetic <Staff>',
    staffMessage: '<script>alert(1)</script>\n**not bold** {reference} & more',
    projectLink: 'https://example.test/portal/p/HH-0000TEST?a=1&b=2',
  }

  it('[HH-COM-13] parses the structure from the template, never from a value', () => {
    expect(parseBody(body).map((b) => b.kind)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
      'list',
      'button',
      'paragraph',
    ])
  })

  it('[HH-COM-13][T74] escapes every value, keeps it literal and renders a mobile-responsive email with a text alternative', () => {
    const r = renderTemplate(customer(body, 'HandyHub | New Message About Your Project #{reference}'), values, {
      linkHosts: HOSTS,
    })
    expect(r.subject).toBe('HandyHub | New Message About Your Project #HH-0000TEST')
    // Plain text: the values as given, the link on its own line, the footer with labelled placeholders.
    expect(r.body).toContain('Hi Sam,\n\nYou have a new message regarding your project #HH-0000TEST.')
    expect(r.body).toContain('Message from Synthetic <Staff>:')
    expect(r.body).toContain('<script>alert(1)</script>\n**not bold** {reference} & more')
    expect(r.body).toContain('- First synthetic item\n- Second bold item')
    expect(r.body).toContain('\n\nhttps://example.test/portal/p/HH-0000TEST?a=1&b=2\n\n')
    expect(r.body).toMatch(
      /--\nHandyHub\nPhone: Placeholder — not provided yet\nEmail: Placeholder — not provided yet$/,
    )
    const html = r.html ?? ''
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(html).toContain('max-width:600px')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;<br>**not bold** {reference} &amp; more')
    expect(html).toContain('Synthetic &lt;Staff&gt;')
    expect(html).toContain('href="https://example.test/portal/p/HH-0000TEST?a=1&amp;b=2"')
    expect(html).toContain('>View your project</a>')
    expect(html).toContain('<li style=')
    expect(html).toContain('Second <strong')
    // The placeholder contact is never a working link (FACT-PUBLIC-CONTACT).
    expect(html).not.toMatch(/href="(tel|mailto):/)
    expect(html).toContain(MESSAGE_COLOURS.navy)
  })

  it('[OWN-DEC-158] greets "Hi there," when the first name is unavailable, and only then', () => {
    const r = renderTemplate(customer('Hi {customerName},\n\nBody #{reference}', null), { reference: 'HH-0000TEST' })
    expect(r.body).toBe('Hi there,\n\nBody #HH-0000TEST')
    expect(renderTemplate(customer('Hi {customerName},\n\nx', null), { customerName: ' ' }).body).toBe('Hi there,\n\nx')
    expect(renderTemplate(customer('Hi {customerName},\n\nx', null), { customerName: 'Sam' }).body).toBe('Hi Sam,\n\nx')
    expect(r.html).toBeNull()
  })

  it('[HH-COM-13][T74] a missing value fails visibly with its name only; nothing falls back to another value', () => {
    let err: unknown
    try {
      renderTemplate(customer('Hi {customerName},\n\n#{reference} {projectLink}', null), { customerName: 'Sam' })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(TemplateValuesError)
    expect((err as TemplateValuesError).missing).toEqual(['projectLink', 'reference'])
    expect(String(err)).not.toContain('Sam')
  })

  it('[HH-COM-13][T74] a link to a host that is not permitted is refused, naming the variable, never the URL', () => {
    let err: unknown
    try {
      renderTemplate(
        customer('{projectLink}', null),
        { projectLink: 'https://elsewhere.example/secret-path' },
        {
          linkHosts: HOSTS,
        },
      )
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(TemplateValueError)
    expect((err as TemplateValueError).problems).toEqual({ projectLink: 'host_not_permitted' })
    expect(String(err)).not.toContain('secret-path')
  })

  it('[HH-COM-03] staff notices use the staff signature and the recipient language; customer footers name the contact', () => {
    expect(footerLines({ audience: 'staff', brand: 'HandyHub', contact: null })).toEqual(['HandyHub'])
    expect(
      footerLines({
        audience: 'customer',
        brand: 'HandyHub',
        contact: { phone: '+1 555 0100', email: 'a@example.test' },
      }),
    ).toEqual(['HandyHub', 'Phone: +1 555 0100', 'Email: a@example.test'])
    const staff: ReleasedTemplate = {
      messageKey: 'staff_notice.customer_reply',
      channel: 'email',
      locale: 'es',
      subject: 'HandyHub Staff | #{reference}',
      body: 'Hola {staffName}:\n\n{staffProjectLink}',
      translationReview: 'ai_reviewed',
      version: 1,
      audience: 'staff',
    }
    const r = renderTemplate(staff, {
      staffName: 'Ana',
      reference: 'HH-0000TEST',
      staffProjectLink: 'https://example.test/s',
    })
    expect(r.html).toContain('lang="es"')
    expect(r.html).toContain('>Abrir en el portal del personal</a>')
  })

  it('keeps the brand colours equal to the design tokens of @handyhub/ui (FACT-BRAND-IDENTITY)', () => {
    const tokens = readFileSync(new URL('../../../../packages/ui/src/tokens.ts', import.meta.url), 'utf8')
    for (const [name, hex] of Object.entries(MESSAGE_COLOURS)) expect(tokens, name).toContain(`${name}: '${hex}'`)
  })
})

describe('[HH-COM-14][HH-COM-02] the message lifecycle reuses the stored delivery states', () => {
  const row = (over: Partial<Parameters<typeof lifecycleOf>[0]>) => ({
    message_key: 'question.notice',
    state: 'queued',
    provider: null,
    provider_message_id: null,
    error_code: null,
    scheduled_at: null,
    ...over,
  })
  const now = new Date('2026-10-02T12:00:00Z')

  it('[HH-COM-14] maps every stored state; provider acceptance is never delivery; a test provider never delivers', () => {
    expect(lifecycleOf(row({ state: 'draft' }), now)).toBe('DRAFT')
    expect(lifecycleOf(row({ state: 'draft', message_key: 'job.paused' }), now)).toBe('PENDING_APPROVAL')
    expect(lifecycleOf(row({ scheduled_at: new Date('2026-10-02T13:00:00Z') }), now)).toBe('SCHEDULED')
    expect(lifecycleOf(row({ scheduled_at: new Date('2026-10-02T11:00:00Z') }), now)).toBe('QUEUED')
    expect(lifecycleOf(row({ provider: 'resend', provider_message_id: 'p-1' }), now)).toBe('PROVIDER_ACCEPTED')
    expect(lifecycleOf(row({ state: 'sent', provider: 'resend' }), now)).toBe('PROVIDER_ACCEPTED')
    expect(lifecycleOf(row({ state: 'delivered', provider: 'resend' }), now)).toBe('DELIVERED')
    expect(lifecycleOf(row({ state: 'delivered', provider: 'fake' }), now)).toBe('PROVIDER_ACCEPTED')
    expect(isIntercepted({ provider: 'fake' })).toBe(true)
    // TSK-0112: the staging log sender is a test provider too: its messages are never DELIVERED.
    expect(lifecycleOf(row({ state: 'delivered', provider: 'log' }), now)).toBe('PROVIDER_ACCEPTED')
    expect(lifecycleOf(row({ provider: 'log', provider_message_id: 'log-email-1' }), now)).toBe('PROVIDER_ACCEPTED')
    expect(isIntercepted({ provider: 'log' })).toBe(true)
    expect(isIntercepted({ provider: 'resend' })).toBe(false)
    expect(lifecycleOf(row({ state: 'failed' }), now)).toBe('FAILED')
    expect(lifecycleOf(row({ state: 'suppressed' }), now)).toBe('SUPPRESSED')
    expect(lifecycleOf(row({ state: 'cancelled', error_code: 'record_changed' }), now)).toBe('CANCELLED')
    expect(lifecycleOf(row({ state: 'cancelled', error_code: 'offer_expired' }), now)).toBe('EXPIRED')
    expect(MESSAGE_LIFECYCLE).toHaveLength(12)
  })

  it('[HH-COM-14] masks destinations in the staff view', () => {
    expect(maskDestination('email', 'synthetic.person@example.test')).toBe('s•••@example.test')
    expect(maskDestination('sms', '+15025550101')).toBe('•••0101')
  })
})
