// The owner's message templates, their rendering and the staff message views against PostgreSQL 16 and the provider
// fakes (TSK-0119; HH-COM-13, HH-COM-14, HH-COM-04, HH-COM-02, OWN-DEC-151, OWN-DEC-152, OWN-DEC-158, T74, T66).
// Every person, address, link and value is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { readFileSync } from 'node:fs'
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  automaticPolicy,
  createDraft,
  currentTemplate,
  DraftError,
  MESSAGE_TYPES,
  notificationAutomation,
  parseBody,
  placeholdersOf,
  releaseAutomation,
  releaseDraft,
  renderTemplate,
  SAMPLE_LINK_HOSTS,
  SAMPLE_VALUES,
  templateProblems,
  templateReadiness,
  type Recipient,
} from '../../src/modules/notifications/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { outbox } from '../../src/platform/outbox.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

let t: TestDatabase
let app: FastifyInstance
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const pw = () => ['synthetic', 'message', 'templates', 'passphrase'].join(' ')
const email = (p: Person) => `${p}-message-templates@example.test`
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const XFF = { 'x-forwarded-for': '198.51.100.119' }

beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic templates ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, await hashPassword(pw()))
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) {
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: XFF,
      payload: { email: email(p), password: pw() },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const get = (p: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[p] } })

/** The template blocks of an owner text: `## MESSAGE nn`, its template ID, `### Subject` and `### Body`. */
function ownerTemplates(markdown: string): Map<string, { subject: string; body: string }> {
  const lines = markdown.split('\n').map((l) => l.replace(/^> ?/, '').replace(/\s+$/, ''))
  const out = new Map<string, { subject: string; body: string }>()
  let id: string | null = null
  let section: 'subject' | 'body' | null = null
  let subject = ''
  let body: string[] = []
  const flush = () => {
    if (id)
      out.set(id, {
        subject,
        body: body
          .join('\n')
          .trim()
          .replace(/\n{3,}/g, '\n\n'),
      })
    id = null
    section = null
    subject = ''
    body = []
  }
  for (const line of lines) {
    if (/^## MESSAGE \d+/.test(line) || /^# \d+\./.test(line)) {
      flush()
      continue
    }
    const tid = /^\*\*Template ID:\*\* `([a-z_]+)`/.exec(line)
    if (tid) id = tid[1] as string
    else if (line === '### Subject') section = 'subject'
    else if (line === '### Body') section = 'body'
    else if (line.startsWith('### ') || line === '---') section = null
    else if (section === 'subject' && line.trim()) subject = line.trim()
    else if (section === 'body') body.push(line)
  }
  flush()
  return out
}

const kg = (path: string) => readFileSync(new URL(`../../../../kg/${path}`, import.meta.url), 'utf8')
const section4 = (md: string) =>
  md.slice(md.indexOf('# 4. CUSTOMER MESSAGE TEMPLATES'), md.indexOf('# 6. TEMPLATE VARIABLES'))
const keyOf = (templateId: string) => [...MESSAGE_TYPES.values()].find((m) => m.templateId === templateId)?.key ?? ''

describe('[HH-COM-13] the owner templates are released template versions', () => {
  it("[HH-COM-13][OWN-DEC-151] all 21 are released with the owner's exact subject and wording, English, by template ID", async () => {
    const owner = ownerTemplates(section4(kg('decisions/OWN-DEC-151.md')))
    expect(owner.size).toBe(21)
    for (const [templateId, words] of owner) {
      const key = keyOf(templateId)
      expect(key, templateId).not.toBe('')
      const released = await currentTemplate(t.db, key, 'email', 'en')
      expect(released, templateId).not.toBeNull()
      expect(released?.templateId, templateId).toBe(templateId)
      expect(released?.subject, templateId).toBe(words.subject)
      expect(released?.body, templateId).toBe(words.body)
      expect(released?.translationReview).toBe('source')
    }
  })

  it('[HH-COM-13][OQ-MESSAGES-OUTSIDE-THE-21] the seven further messages are released as recorded in the graph', async () => {
    const md = kg('questions/OQ-MESSAGES-OUTSIDE-THE-21.md')
    const seven = ownerTemplates(md.slice(md.indexOf('**PROPOSED (TSK-0119')))
    expect([...seven.keys()].sort()).toEqual([
      'appointment_changed',
      'estimate_ready',
      'invoice_ready',
      'not_a_fit',
      'on_the_way',
      'question_notice',
      'verification_code',
    ])
    for (const [templateId, words] of seven) {
      const released = await currentTemplate(t.db, keyOf(templateId), 'email', 'en')
      expect(released?.templateId, templateId).toBe(templateId)
      expect(released?.subject, templateId).toBe(words.subject)
      expect(released?.body, templateId).toBe(words.body)
    }
    // Earlier released versions stay (append-only): the verification code's first wording is version 1.
    const v1 = await t.db
      .selectFrom('platform.message_template_versions')
      .select(['version', 'template_id'])
      .where('message_key', '=', 'contact.verification_code')
      .where('channel', '=', 'email')
      .orderBy('version')
      .execute()
    expect(v1).toEqual([
      { version: 1, template_id: null },
      { version: 2, template_id: 'verification_code' },
    ])
  })

  it('[HH-COM-13][OWN-DEC-151] every released version passes the release checks and follows the global design', async () => {
    const rows = await t.db
      .selectFrom('platform.message_template_versions')
      .selectAll()
      .where('template_id', 'is not', null)
      .execute()
    expect(rows).toHaveLength(29)
    for (const r of rows) {
      const draft = {
        messageKey: r.message_key,
        channel: r.channel as 'email' | 'sms',
        locale: r.locale as 'en' | 'es',
        subject: r.subject,
        body: r.body,
        translationReview: r.translation_review as 'source' | 'ai_reviewed',
      }
      expect(templateProblems(draft), r.template_id ?? '').toEqual([])
      // OWN-DEC-158: no amount, address, code or token in the wording itself.
      expect(r.body, r.template_id ?? '').not.toMatch(/\$\s?\d|\bstreet\b/i)
      if (r.audience === 'customer') {
        expect(r.subject, r.template_id ?? '').toMatch(/^HandyHub \| /)
        expect(r.body.split('\n')[0], r.template_id ?? '').toMatch(/^(Hi \{customerName\},|Hi there,)$/)
        expect(r.body.endsWith('The HandyHub Team'), r.template_id ?? '').toBe(true)
      } else if (r.locale === 'en') {
        expect(r.subject).toMatch(/^HandyHub Staff \| /)
        expect(r.body.endsWith('HandyHub Staff Notifications')).toBe(true)
      }
    }
  })

  it('[HH-COM-03][OWN-DEC-79] the Spanish staff notice passes the separate comparison with its English source', async () => {
    const en = await currentTemplate(t.db, 'staff_notice.customer_reply', 'email', 'en')
    const es = await currentTemplate(t.db, 'staff_notice.customer_reply', 'email', 'es')
    expect(es?.translationReview).toBe('ai_reviewed')
    expect(es?.templateId).toBe('staff_customer_replied')
    const shape = (b: string) => parseBody(b).map((x) => x.kind)
    expect(shape(es?.body ?? '')).toEqual(shape(en?.body ?? ''))
    expect(placeholdersOf(es?.body ?? '').sort()).toEqual(placeholdersOf(en?.body ?? '').sort())
    expect(placeholdersOf(es?.subject ?? '')).toEqual(placeholdersOf(en?.subject ?? ''))
  })

  it('[HH-COM-13][T74] each of the 28 renders subject, HTML and text with no unresolved placeholder; a missing value fails', async () => {
    const config = await loadConfig(t.db)
    const contact = config.get('business.public_contact')
    expect(contact.state).toBe('NOT_CONFIGURED')
    const released = await t.db
      .selectFrom('platform.message_template_versions')
      .select(['message_key', 'locale'])
      .where('template_id', 'is not', null)
      .execute()
    for (const r of released) {
      const tpl = await currentTemplate(t.db, r.message_key, 'email', r.locale as 'en' | 'es')
      if (!tpl) throw new Error(r.message_key)
      const used = new Set([...placeholdersOf(tpl.body), ...placeholdersOf(tpl.subject ?? '')])
      const values = Object.fromEntries([...used].map((n) => [n, SAMPLE_VALUES[n as keyof typeof SAMPLE_VALUES]]))
      const out = renderTemplate(tpl, values, { linkHosts: SAMPLE_LINK_HOSTS })
      for (const text of [out.subject ?? '', out.body, out.html ?? '']) {
        expect(text, tpl.messageKey).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/)
        expect(text, tpl.messageKey).not.toContain('**')
      }
      expect(out.html, tpl.messageKey).toContain('max-width:600px')
      expect(out.body, tpl.messageKey).toContain(
        tpl.audience === 'customer' ? 'Placeholder — not provided yet' : 'HandyHub',
      )
      for (const name of used) {
        if (name === 'customerName' && tpl.audience === 'customer') continue
        const less = Object.fromEntries(Object.entries(values).filter(([k]) => k !== name))
        expect(() => renderTemplate(tpl, less, { linkHosts: SAMPLE_LINK_HOSTS }), `${tpl.messageKey} ${name}`).toThrow(
          /missing template values/,
        )
      }
      if (used.has('customerName') && tpl.audience === 'customer') {
        const less = Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'customerName'))
        expect(renderTemplate(tpl, less, { linkHosts: SAMPLE_LINK_HOSTS }).body.startsWith('Hi there,')).toBe(true)
      }
    }
    expect(released.length).toBe(29)
  })

  it('[HH-COM-06][OWN-DEC-153] messages.automatic lists the automatic customer messages, the routine reminders too', async () => {
    const config = await loadConfig(t.db)
    const policy = automaticPolicy(config)
    for (const k of [
      'request.receipt',
      'visit.cancelled',
      'invoice.deposit',
      'job.complete',
      'account.contact_changed',
      'reminder.unanswered_estimate',
      'reminder.unanswered_question',
      'reminder.appointment',
    ])
      expect(policy.isAutomatic(k), k).toBe(true)
    for (const k of ['job.paused', 'staff.reply', 'reminder.satisfaction_check', 'reminder.unpaid_invoice'])
      expect(policy.isAutomatic(k), k).toBe(false)
  })

  it('[HH-COM-13] readiness: wording released but values not wired is not ready; wired wording is', async () => {
    expect(await templateReadiness(t.db, 'question.notice', 'email', 'en')).toEqual({ state: 'ready', unwired: [] })
    expect(await templateReadiness(t.db, 'contact.verification_code', 'email', 'en')).toEqual({
      state: 'ready',
      unwired: [],
    })
    // TSK-0120 wired the receipt; the deposit invoice waits for its event (TSK-0085).
    expect(await templateReadiness(t.db, 'request.receipt', 'email', 'en')).toEqual({ state: 'ready', unwired: [] })
    expect(await templateReadiness(t.db, 'invoice.deposit', 'email', 'en')).toEqual({
      state: 'not_wired',
      unwired: ['customerName', 'invoiceLink', 'invoiceNumber', 'jobNumber'],
    })
    expect(await templateReadiness(t.db, 'reminder.repeat_service', 'email', 'en')).toEqual({
      state: 'not_configured',
      unwired: [],
    })
  })
})

const providers = (linkHosts = ['example.test']) => {
  const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  if (!p.fakes.email) throw new Error('ci uses the fakes')
  return { providers: { email: p.email, sms: null, linkHosts }, email: p.fakes.email }
}
const recipient = (address: string): Recipient => ({
  kind: 'customer_contact',
  id: 'contact-synthetic-templates',
  destinations: [{ channel: 'email', destination: address, permission: 'preferred' }],
})
let n = 0
const event = (type: string, id: string) =>
  withTx(t.db, (tx) =>
    outbox.add(tx, {
      type,
      aggregate: { type: 'question', id },
      idempotencyKey: `${type}:${id}`,
      requestId: `req-tpl-${++n}`,
    }),
  )
const deliveryOf = (subject: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('subject_key', '=', subject)
    .executeTakeFirstOrThrow()

describe('[HH-COM-14][HH-COM-13] sending records the template, the layout and every attempt', () => {
  it('[HH-COM-14][T74] sends the owner-style question notice once with HTML and text, and records metadata only', async () => {
    const f = providers()
    const values = {
      customerName: 'Sam',
      reference: 'HH-0000TEST',
      projectLink: 'https://example.test/portal/p/HH-0000TEST',
    }
    const automation = notificationAutomation({
      messageKey: 'question.notice',
      providers: f.providers,
      resolve: async () => ({
        subjectKey: 'question:tpl-1',
        record: { type: 'question', id: 'tpl-1' },
        recipients: [recipient('templates-1@example.test')],
        values,
      }),
    })
    await event('question.published', 'tpl-1')
    await event('question.published', 'tpl-1')
    const worker = createWorker({ db: t.db, registry: createAutomationRegistry([automation]) })
    await worker.runOnce()
    await worker.runOnce()
    expect(f.email.sent).toHaveLength(1)
    const sent = f.email.sent[0]
    expect(sent?.subject).toBe('HandyHub | We Have a Question About Your Request #HH-0000TEST')
    expect(sent?.text.startsWith('Hi Sam,\n\nHandyHub has a question about your request #HH-0000TEST.')).toBe(true)
    expect(sent?.html).toContain('href="https://example.test/portal/p/HH-0000TEST"')
    const row = await deliveryOf('question:tpl-1')
    expect(row).toMatchObject({
      template_id: 'question_notice',
      template_version: 2,
      layout_version: 1,
      consent_decision: 'allowed',
      provider: 'fake',
      missing_variables: [],
    })
    expect(row.sent_at).toBeInstanceOf(Date)
    expect(row.scheduled_at).toBeInstanceOf(Date)
    const attempts = await t.db
      .selectFrom('platform.message_delivery_attempts')
      .selectAll()
      .where('delivery_id', '=', row.id)
      .execute()
    expect(attempts.map((a) => [a.attempt, a.state, a.provider])).toEqual([[1, 'queued', 'fake']])
    // T74: neither the row, its attempts nor the audit hold a value of the message.
    const audit = await t.db.selectFrom('platform.audit_events').selectAll().where('target_id', '=', row.id).execute()
    const stored = JSON.stringify([row, attempts, audit])
    for (const v of Object.values(values)) expect(stored).not.toContain(v)
  })

  it('[HH-COM-13] released wording whose values are not wired fails visibly, naming them, and never sends', async () => {
    const f = providers()
    // The deposit invoice's event does not exist yet (TSK-0085): its resolver supplies nothing.
    const automation = notificationAutomation({
      messageKey: 'invoice.deposit',
      providers: f.providers,
      resolve: async () => ({
        subjectKey: 'invoice:tpl-2',
        record: { type: 'invoice', id: 'tpl-2' },
        recipients: [recipient('templates-2@example.test')],
        values: {},
      }),
    })
    await event('invoice.deposit_issued', 'tpl-2')
    await createWorker({ db: t.db, registry: createAutomationRegistry([automation]) }).runOnce()
    expect(f.email.calls).toEqual([])
    expect(await deliveryOf('invoice:tpl-2')).toMatchObject({
      state: 'failed',
      error_code: 'template_values_not_wired',
      missing_variables: ['customerName', 'invoiceLink', 'invoiceNumber', 'jobNumber'],
      template_id: 'deposit_invoice',
    })
  })

  it('[HH-COM-13][T74] a missing value or a link to a host that is not permitted fails with the names only', async () => {
    const f = providers()
    const run = async (id: string, values: Record<string, string>) => {
      const automation = notificationAutomation({
        messageKey: 'question.notice',
        providers: f.providers,
        resolve: async () => ({
          subjectKey: `question:${id}`,
          record: { type: 'question', id },
          recipients: [recipient(`${id}@example.test`)],
          values,
        }),
      })
      await event('question.published', id)
      await createWorker({ db: t.db, registry: createAutomationRegistry([automation]) }).runOnce()
      return deliveryOf(`question:${id}`)
    }
    const missing = await run('tpl-3', { customerName: 'Sam', reference: 'HH-0000TEST' })
    expect(missing).toMatchObject({
      state: 'failed',
      error_code: 'template_values_missing',
      missing_variables: ['projectLink'],
    })
    const elsewhere = 'https://elsewhere.example/portal/p/other-project'
    const invalid = await run('tpl-4', { customerName: 'Sam', reference: 'HH-0000TEST', projectLink: elsewhere })
    expect(invalid).toMatchObject({
      state: 'failed',
      error_code: 'template_values_invalid',
      missing_variables: ['projectLink'],
    })
    expect(JSON.stringify(invalid)).not.toContain('elsewhere')
    expect(f.email.calls).toEqual([])
  })

  it('[OWN-DEC-152] the work-paused notice is released by the Owner only', async () => {
    const config = await loadConfig(t.db)
    const draft = await withTx(t.db, (tx) =>
      createDraft(tx, {
        config,
        messageKey: 'job.paused',
        destination: { channel: 'email', destination: 'templates-5@example.test', permission: 'preferred' },
        recipient: recipient('templates-5@example.test'),
        subjectKey: 'job:tpl-5',
        record: { type: 'job', id: 'tpl-5' },
        values: { customerName: 'Sam', jobNumber: 'HH-0000TEST-J1' },
      }),
    )
    const automation = releaseAutomation({ email: null, sms: null })
    await expect(
      withTx(t.db, (tx) =>
        releaseDraft(tx, {
          config,
          deliveryId: draft.id,
          actor: { kind: 'staff', id: ids.office, roles: ['office'] },
          automation,
          requestId: 'req-tpl-paused',
        }),
      ),
    ).rejects.toBeInstanceOf(DraftError)
    const res = await get('owner', '/staff/message-deliveries?group=waiting')
    const item = (res.json().items as { id: string; lifecycle: string }[]).find((i) => i.id === draft.id)
    expect(item?.lifecycle).toBe('PENDING_APPROVAL')
    const { runAt } = await withTx(t.db, (tx) =>
      releaseDraft(tx, {
        config,
        deliveryId: draft.id,
        actor: { kind: 'staff', id: ids.owner, roles: ['owner'] },
        automation,
        requestId: 'req-tpl-paused-owner',
      }),
    )
    expect((await deliveryOf('job:tpl-5')).scheduled_at?.getTime()).toBe(runAt.getTime())
  })
})

describe('[HH-COM-14][RULE-SERVER-AUTHZ] the staff message views', () => {
  it('[HH-COM-14] lists deliveries with their lifecycle, masked destination, times and attempts; never values', async () => {
    const res = await get('owner', '/staff/message-deliveries?limit=100')
    expect(res.statusCode, res.body).toBe(200)
    const items = res.json().items as Record<string, unknown>[]
    const sent = items.find((i) => i['templateId'] === 'question_notice' && i['errorCode'] === null)
    expect(sent).toMatchObject({ lifecycle: 'PROVIDER_ACCEPTED', intercepted: true, release: 'automatic', attempts: 1 })
    expect((sent?.['history'] as unknown[]).length).toBe(1)
    const notWired = items.find((i) => i['templateId'] === 'deposit_invoice')
    expect(notWired).toMatchObject({
      lifecycle: 'FAILED',
      errorCode: 'template_values_not_wired',
      missingVariables: ['customerName', 'invoiceLink', 'invoiceNumber', 'jobNumber'],
    })
    expect(res.body).not.toContain('templates-1@example.test')
    expect(res.body).not.toContain('Sam')
    const failed = await get('owner', '/staff/message-deliveries?group=failed&limit=100')
    expect((failed.json().items as { lifecycle: string }[]).every((i) => i.lifecycle === 'FAILED')).toBe(true)
    expect((await get('owner', '/staff/message-deliveries?reference=HH-00000000')).json().items).toEqual([])
    expect((await get('owner', '/staff/message-deliveries?group=nope')).statusCode).toBe(400)
  })

  it('[RULE-SERVER-AUTHZ] Office sees them too; an Estimator reaches nothing; a Worker is refused', async () => {
    expect((await get('office', '/staff/message-deliveries')).statusCode).toBe(200)
    const estimator = await get('estimator', '/staff/message-deliveries')
    expect(estimator.statusCode, estimator.body).toBe(200)
    expect(estimator.json().items).toEqual([])
    expect((await get('worker', '/staff/message-deliveries')).statusCode).toBe(403)
    expect((await get('worker', '/staff/message-templates')).statusCode).toBe(403)
  })

  it('[HH-COM-13] lists every template with its release authority and readiness, and the registry', async () => {
    const res = await get('office', '/staff/message-templates')
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json() as {
      templates: {
        messageKey: string
        release: string
        category: string
        versions: { channel: string; locale: string; readiness: string; unwired: string[] }[]
      }[]
      variables: { name: string; required: boolean; fallback: string | null; sensitive: boolean }[]
    }
    const by = (k: string) => body.templates.find((x) => x.messageKey === k)
    expect(by('job.paused')?.release).toBe('owner')
    expect(by('request.receipt')?.release).toBe('automatic')
    expect(by('staff.reply')?.release).toBe('staff')
    expect(by('contact.verification_code')?.category).toBe('authentication')
    expect(by('request.receipt')?.versions).toEqual([
      expect.objectContaining({ channel: 'email', locale: 'en', readiness: 'ready', unwired: [] }),
    ])
    expect(by('invoice.deposit')?.versions).toContainEqual(
      expect.objectContaining({ channel: 'email', locale: 'en', readiness: 'not_wired' }),
    )
    expect(by('staff_notice.customer_reply')?.versions.map((v) => v.locale)).toEqual(['en', 'es'])
    expect(by('reminder.repeat_service')?.versions.every((v) => v.readiness === 'not_configured')).toBe(true)
    expect(body.variables.find((v) => v.name === 'customerName')).toMatchObject({
      required: false,
      fallback: 'Hi there,',
    })
    expect(body.variables.find((v) => v.name === 'secureAccessLink')).toMatchObject({ required: true, sensitive: true })
  })

  it('[HH-COM-14][OWN-DEC-152] previews a released template with sample values and records no delivery', async () => {
    const before = await t.db
      .selectFrom('platform.message_deliveries')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow()
    const res = await get('owner', '/staff/message-templates/project.access_link/preview?channel=email')
    expect(res.statusCode, res.body).toBe(200)
    const p = res.json() as { subject: string; text: string; html: string; templateId: string; sample: boolean }
    expect(p).toMatchObject({
      templateId: 'secure_access_link',
      sample: true,
      subject: 'HandyHub | Your Secure Project Access Link',
    })
    expect(p.text).toContain('Hi Sample,')
    expect(p.text).toContain('https://example.test/access/sample-preview-link')
    expect(p.html).toContain('>Open your project</a>')
    const page = await get('owner', '/staff/message-templates/project.access_link/preview.html')
    expect(page.statusCode).toBe(200)
    expect(page.headers['content-type']).toMatch(/^text\/html/)
    expect(page.headers['content-security-policy']).toMatch(/^sandbox; default-src 'none'/)
    expect(page.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(page.body).toContain('<!doctype html>')
    const es = await get('office', '/staff/message-templates/staff_notice.customer_reply/preview?locale=es')
    expect(es.json().text).toContain('Hola Sample Staff:')
    expect((await get('owner', '/staff/message-templates/reminder.repeat_service/preview')).statusCode).toBe(404)
    expect((await get('owner', '/staff/message-templates/no.such_type/preview')).statusCode).toBe(404)
    expect((await get('owner', '/staff/message-templates/request.receipt/preview?channel=sms')).statusCode).toBe(404)
    const after = await t.db
      .selectFrom('platform.message_deliveries')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow()
    expect(after.n).toBe(before.n)
  })
})
