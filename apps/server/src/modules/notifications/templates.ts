// Versioned notification templates (TSK-0047; HH-COM-03, HH-COM-04, RULE-LANGUAGES, HH-LANG-04).
// - The content locale comes from the audience, never from the sender's interface: customer messages are English;
//   staff notifications use the recipient staff member's locale (English or Spanish).
// - A template may use only the variables its message type declares, never a number or amount placeholder, and never
//   an access secret, password or card field. Credentials appear only where they are the message itself (the
//   one-time code, the secure access link, the staff invite and reset links).
// - Versions are append-only (the database refuses edits); the newest released version is the one sent, and every
//   delivery records which version it used. A message type with no released version is NOT CONFIGURED.
// - TSK-0119 (HH-COM-13, OWN-DEC-151, OWN-DEC-158): every variable is checked against the one registry
//   (variables.ts): a release that names an unregistered or undeclared variable, a variable that may not appear in a
//   subject, or a variable no customer message may carry (the property address) is refused; an optional variable
//   (the greeting's first name) may appear only in its approved fallback line. Rendering goes through the branded
//   layout (layout.ts): subject, HTML and plain text from the same version. Readiness: a released version whose
//   variables the message's resolver does not all supply yet is not ready (its delivery is not wired).
import { placeholderSignature, type StaffLocale } from '@handyhub/i18n'
import type { Db, Tx } from '@handyhub/db'
import { isSecretField } from '../../platform/redact.js'
import { renderLayout, type LayoutContext, type Rendered } from './layout.js'
import { messageType, suppliedVariables, type Audience, type Channel, type MessageType } from './message-types.js'
import { variableSpec } from './variables.js'

export type ContentLocale = 'en' | 'es'

/** The content language from audience policy: customers English; staff the recipient's own locale. */
export function contentLocale(audience: Audience, recipientStaffLocale?: StaffLocale): ContentLocale {
  return audience === 'customer' ? 'en' : (recipientStaffLocale ?? 'en')
}

export type TemplateDraft = {
  messageKey: string
  channel: Channel
  locale: ContentLocale
  subject: string | null
  body: string
  translationReview: 'source' | 'ai_reviewed'
  /** The owner's template ID (OWN-DEC-151); defaults to the message type's. */
  templateId?: string | null
}

export class TemplateError extends Error {
  override name = 'TemplateError'
}

const AMOUNT = /(amount|total|balance|price|cents|dollars|deposit|cost)/i

/** Every problem with a template for its message type; empty when it may be released. */
export function templateProblems(t: TemplateDraft): string[] {
  const problems: string[] = []
  let type: MessageType
  try {
    type = messageType(t.messageKey)
  } catch {
    return [`unknown message type ${t.messageKey}`]
  }
  if (!type.channels.includes(t.channel)) problems.push(`${t.messageKey} is not sent by ${t.channel}`)
  if (type.audience === 'customer' && t.locale !== 'en') problems.push('customer templates are English only')
  if ((t.locale === 'en') !== (t.translationReview === 'source'))
    problems.push('English is the source; Spanish is released only as AI-reviewed')
  if ((t.channel === 'email') !== (t.subject !== null)) problems.push('an email has a subject and a text has none')
  for (const [part, text] of [
    ['subject', t.subject],
    ['body', t.body],
  ] as const) {
    if (text === null) continue
    let sig: string[]
    try {
      sig = placeholderSignature(text)
    } catch (err) {
      problems.push(`${part} is not valid ICU: ${(err as Error).message}`)
      continue
    }
    for (const s of sig) {
      const [name = '', kind = ''] = s.split(':')
      const declared = type.variables[name]
      const spec = variableSpec(name)
      if (kind !== 'argument')
        problems.push(`${part} uses a ${kind} placeholder {${name}}; values are pre-formatted text`)
      if (!declared) problems.push(`${part} uses {${name}}, which ${t.messageKey} does not declare`)
      if (declared !== 'credential' && isSecretField(name)) problems.push(`${part} would carry the secret {${name}}`)
      if (type.audience === 'customer' && AMOUNT.test(name)) problems.push(`${part} would carry an amount {${name}}`)
      if (declared && spec && part === 'subject' && !spec.subject) problems.push(`the subject never carries {${name}}`)
      if (declared && spec?.customerForbidden && type.audience === 'customer')
        problems.push(`${part} would carry {${name}}, which no customer message shows (OWN-DEC-158)`)
    }
  }
  // The first name appears only in its greeting line, where its approved fallback ("Hi there,") applies.
  if (type.audience === 'customer')
    for (const line of t.body.split('\n'))
      if (line.includes('{customerName}') && line.trim() !== variableSpec('customerName')?.fallback?.line)
        problems.push('a customer template shows {customerName} only in its greeting line "Hi {customerName},"')
  return [...new Set(problems)]
}

/** Declared variables of every message type stay free of access secrets and amounts (checked once at start-up). */
export function messageTypeProblems(type: MessageType): string[] {
  const problems: string[] = []
  for (const [name, kind] of Object.entries(type.variables)) {
    if (kind !== 'credential' && isSecretField(name)) problems.push(`${type.key}.${name} looks secret`)
    if (/access(code|instructions)|gate|lockbox|alarm|password|card/i.test(name))
      problems.push(`${type.key}.${name} is an access secret, password or card field`)
    if (type.audience === 'customer' && AMOUNT.test(name)) problems.push(`${type.key}.${name} is an amount`)
    const spec = variableSpec(name)
    if (!spec) problems.push(`${type.key}.${name} is not a registered template variable`)
    else if (spec.kind !== kind) problems.push(`${type.key}.${name} is declared as ${kind}, registered as ${spec.kind}`)
  }
  for (const name of suppliedVariables(type))
    if (!type.variables[name]) problems.push(`${type.key} supplies ${name}, which it does not declare`)
  return problems
}

export type ReleasedTemplate = TemplateDraft & { version: number; audience: Audience; releasedAt?: Date }

/** Adds the next version of a template (append-only). Callers authorize first; the content is validated here. */
export async function releaseTemplateVersion(
  tx: Tx,
  draft: TemplateDraft & { sourceIds: readonly string[]; releasedBy: string },
): Promise<number> {
  const problems = templateProblems(draft)
  if (problems.length) throw new TemplateError(problems.join('; '))
  const type = messageType(draft.messageKey)
  await tx
    .insertInto('platform.message_templates')
    .values({ message_key: draft.messageKey, channel: draft.channel, audience: type.audience })
    .onConflict((oc) => oc.columns(['message_key', 'channel']).doNothing())
    .execute()
  const latest = await tx
    .selectFrom('platform.message_template_versions')
    .select((eb) => eb.fn.max('version').as('max'))
    .where('message_key', '=', draft.messageKey)
    .where('channel', '=', draft.channel)
    .where('locale', '=', draft.locale)
    .executeTakeFirst()
  const version = Number(latest?.max ?? 0) + 1
  await tx
    .insertInto('platform.message_template_versions')
    .values({
      message_key: draft.messageKey,
      channel: draft.channel,
      audience: type.audience,
      locale: draft.locale,
      version,
      subject: draft.subject,
      body: draft.body,
      translation_review: draft.translationReview,
      template_id: draft.templateId === undefined ? (type.templateId ?? null) : draft.templateId,
      source_ids: [...draft.sourceIds],
      released_by: draft.releasedBy,
    })
    .execute()
  return version
}

/** The newest released version for a message type, channel and locale, or null while it is NOT CONFIGURED. */
export async function currentTemplate(
  db: Db | Tx,
  messageKey: string,
  channel: Channel,
  locale: ContentLocale,
): Promise<ReleasedTemplate | null> {
  const row = await db
    .selectFrom('platform.message_template_versions')
    .selectAll()
    .where('message_key', '=', messageKey)
    .where('channel', '=', channel)
    .where('locale', '=', locale)
    .orderBy('version', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (!row) return null
  return {
    messageKey,
    channel,
    locale,
    version: row.version,
    audience: row.audience as Audience,
    subject: row.subject,
    body: row.body,
    translationReview: row.translation_review as 'source' | 'ai_reviewed',
    templateId: row.template_id,
    releasedAt: row.released_at,
  }
}

/** The variables a released version uses that its message's resolver does not supply yet (HH-COM-13). */
export function unwiredVariables(t: Pick<TemplateDraft, 'messageKey' | 'subject' | 'body'>): string[] {
  const type = messageType(t.messageKey)
  const supplied = new Set(suppliedVariables(type))
  const used = new Set<string>()
  for (const text of [t.subject, t.body])
    if (text) for (const s of placeholderSignature(text)) used.add(s.split(':')[0] as string)
  return [...used].filter((n) => !supplied.has(n)).sort()
}

/**
 * Whether a message can send today: a released version exists and its resolver supplies every variable it uses.
 * 'not_configured' while no wording is released; 'not_wired' while the values are not supplied yet.
 */
export async function templateReadiness(
  db: Db | Tx,
  messageKey: string,
  channel: Channel,
  locale: ContentLocale,
): Promise<{ state: 'ready' | 'not_configured' | 'not_wired'; unwired: string[] }> {
  const t = await currentTemplate(db, messageKey, channel, locale)
  if (!t) return { state: 'not_configured', unwired: [] }
  const unwired = unwiredVariables(t)
  return { state: unwired.length ? 'not_wired' : 'ready', unwired }
}

export type RenderOptions = Partial<Omit<LayoutContext, 'audience' | 'channel' | 'locale'>>

/**
 * Renders a released template through the branded layout (layout.ts). Values the message type does not declare are
 * refused; every value is validated by the registry; a missing value fails with its name (TemplateValuesError).
 * `body` is the plain text (the SMS text, or the email's text alternative with its footer); `html` the email's HTML.
 */
export function renderTemplate(
  t: ReleasedTemplate,
  values: Readonly<Record<string, string>>,
  options: RenderOptions = {},
): { subject: string | null; body: string; html: string | null } {
  const type = messageType(t.messageKey)
  for (const k of Object.keys(values))
    if (!type.variables[k]) throw new TemplateError(`${t.messageKey} does not declare {${k}}`)
  const rendered: Rendered = renderLayout(
    { subject: t.subject, body: t.body, catalog: `template:${t.messageKey}@${t.version}` },
    values,
    {
      audience: type.audience,
      channel: t.channel,
      locale: t.locale,
      brand: options.brand ?? 'HandyHub',
      contact: options.contact ?? null,
      linkHosts: options.linkHosts,
    },
  )
  return { subject: rendered.subject, body: rendered.text, html: rendered.html }
}
