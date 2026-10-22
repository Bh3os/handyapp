// The branded message layout (TSK-0119; HH-COM-13, OWN-DEC-151 section 2, FACT-BRAND-IDENTITY, FACT-PUBLIC-CONTACT).
// One renderer turns a released template version into the email subject, a mobile-responsive HTML body and its
// readable plain-text alternative (and the text of an SMS), so every message shares one design.
//
// - A template body is plain text with a small structure, read from the template before any value is substituted, so
//   a value can never add structure or markup: paragraphs are separated by a blank line; `**...**` marks bold text;
//   a paragraph whose lines all start with "- " is a list; a paragraph that is only a link variable (for example
//   `{projectLink}`) is the message's action button (the URL is shown under it too).
// - Every value is validated by the variable registry (variables.ts) and escaped for HTML; the template text itself
//   holds no markup. A greeting `Hi {customerName},` becomes the approved "Hi there," when the name is unavailable
//   (OWN-DEC-158); every other missing value fails the render with the missing names, never with a guess.
// - The footer carries the brand and, on customer emails, the public phone and email from configuration
//   (business.public_contact), labelled placeholders while they are NOT CONFIGURED and never links (FACT-PUBLIC-CONTACT).
// - The HTML is table-based with inline styles (what email clients render), at most 600 px wide and fluid below that,
//   with text contrast above WCAG AA on the brand colours. The wordmark is text: an image logo needs a hosted asset on
//   the business domain, which is not live yet (OWN-DEC-184).
// LAYOUT_VERSION is recorded on every delivery; a change to the design is a new layout version.
import { createTranslator, customerTranslator, placeholderSignature, staffTranslator } from '@handyhub/i18n'
import type { CustomerKey, StaffKey, StaffLocale } from '@handyhub/i18n'
import type { Audience, Channel } from './message-types.js'
import { valueProblem, variableSpec } from './variables.js'

export const LAYOUT_VERSION = 1

/** The brand palette of FACT-BRAND-IDENTITY (the BRAND tokens of @handyhub/ui; a test keeps them equal). */
export const MESSAGE_COLOURS = {
  navy: '#1A2B49',
  ivory: '#F7F5F0',
  gold: '#C79A55',
  charcoal: '#303942',
  stone: '#E7E2D9',
} as const

export type Segment = { bold: boolean; text: string }
export type Block =
  | { kind: 'paragraph'; lines: Segment[][] }
  | { kind: 'list'; items: Segment[][] }
  | { kind: 'button'; variable: string }

/** Thrown when required values are missing; carries the variable names only. */
export class TemplateValuesError extends Error {
  override name = 'TemplateValuesError'
  constructor(readonly missing: readonly string[]) {
    super(`missing template values: ${missing.join(', ')}`)
  }
}

/** Thrown when a value is not acceptable for its variable; carries names and problem codes only, never values. */
export class TemplateValueError extends Error {
  override name = 'TemplateValueError'
  constructor(readonly problems: Readonly<Record<string, string>>) {
    super(
      `invalid template values: ${Object.entries(problems)
        .map(([k, p]) => `${k} (${p})`)
        .join(', ')}`,
    )
  }
}

function segments(line: string): Segment[] {
  const parts = line.split('**')
  // An odd number of markers leaves the last one literal.
  if (parts.length % 2 === 0) {
    const last = parts.pop() as string
    parts[parts.length - 1] = `${parts[parts.length - 1] ?? ''}**${last}`
  }
  return parts.map((text, i) => ({ bold: i % 2 === 1, text })).filter((s) => s.text !== '')
}

const BUTTON = /^\{([A-Za-z][A-Za-z0-9]*)\}$/

function isLinkVariable(name: string): boolean {
  const spec = variableSpec(name)
  return spec?.kind === 'link' || (spec?.kind === 'credential' && spec.url === true)
}

/** The structure of a template body (before any value is substituted). */
export function parseBody(body: string): Block[] {
  const paragraphs = body
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
  return paragraphs.map((p): Block => {
    const button = BUTTON.exec(p)
    if (button && isLinkVariable(button[1] as string)) return { kind: 'button', variable: button[1] as string }
    const lines = p.split('\n').map((l) => l.trim())
    if (lines.every((l) => l.startsWith('- ')))
      return { kind: 'list', items: lines.map((l) => segments(l.slice(2).trim())) }
    return { kind: 'paragraph', lines: lines.map(segments) }
  })
}

/** The approved fallback lines (OWN-DEC-158 "Hi there,") applied to a body whose value is unavailable. */
function applyFallbacks(body: string, values: Readonly<Record<string, string>>): string {
  return body
    .split('\n')
    .map((line) => {
      const m = /\{([A-Za-z][A-Za-z0-9]*)\}/.exec(line)
      if (!m) return line
      const name = m[1] as string
      const fallback = variableSpec(name)?.fallback
      if (!fallback || line.trim() !== fallback.line || (values[name] ?? '').trim() !== '') return line
      return line.replace(fallback.line, fallback.text)
    })
    .join('\n')
}

/** The variable names a text uses (simple arguments only; templates.ts refuses anything else). */
export function placeholdersOf(text: string): string[] {
  return placeholderSignature(text).map((s) => s.split(':')[0] as string)
}

export type LayoutContext = {
  audience: Audience
  channel: Channel
  /** The staff recipient's locale for staff notices; customer messages are English (RULE-LANGUAGES). */
  locale: 'en' | 'es'
  /** The brand name (business.name brand); 'HandyHub' until configured otherwise. */
  brand: string
  /** The public phone and email (business.public_contact); null while NOT CONFIGURED: a labelled placeholder. */
  contact: { phone: string; email: string } | null
  /** The hosts links may point at; undefined skips the host check (only callers without a configured origin). */
  linkHosts?: readonly string[] | undefined
}

export type Rendered = { subject: string | null; text: string; html: string | null }

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const BUTTON_LABEL: Record<string, CustomerKey> = {
  projectLink: 'message.button.project',
  secureAccessLink: 'message.button.secureAccess',
  accessLink: 'message.button.secureAccess',
  estimateLink: 'message.button.estimate',
  appointmentLink: 'message.button.appointment',
  changeOrderLink: 'message.button.changeOrder',
  invoiceLink: 'message.button.invoice',
  receiptLink: 'message.button.receipt',
}
const STAFF_BUTTON_LABEL: Record<string, StaffKey> = {
  staffProjectLink: 'message.button.staffProject',
  appLink: 'message.button.staffProject',
  inviteLink: 'message.button.staffInvite',
  resetLink: 'message.button.staffReset',
}

function buttonLabel(variable: string, ctx: LayoutContext): string {
  if (ctx.audience === 'customer') return customerTranslator().t(BUTTON_LABEL[variable] ?? 'message.button.open')
  return staffTranslator(ctx.locale as StaffLocale).t(STAFF_BUTTON_LABEL[variable] ?? 'message.button.staffOpen')
}

/**
 * Renders a template for one message. Validates every value first (registered, declared by `allowed`, acceptable
 * for its kind, links on permitted hosts), applies the approved fallbacks, and refuses any missing value.
 */
export function renderLayout(
  template: { subject: string | null; body: string; catalog: string },
  values: Readonly<Record<string, string>>,
  ctx: LayoutContext,
): Rendered {
  const problems: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    // An empty value is an unavailable one: the fallback applies, or it is reported as missing below.
    if (typeof value === 'string' && value.trim() === '' && variableSpec(name)) continue
    const p = valueProblem(name, value, ctx.linkHosts)
    if (p) problems[name] = p
  }
  if (Object.keys(problems).length) throw new TemplateValueError(problems)
  const body = applyFallbacks(template.body, values)
  const needed = new Set([...placeholdersOf(body), ...(template.subject ? placeholdersOf(template.subject) : [])])
  const missing = [...needed].filter((n) => (values[n] ?? '').trim() === '').sort()
  if (missing.length) throw new TemplateValuesError(missing)
  const clean: Record<string, string> = {}
  for (const n of needed) clean[n] = (values[n] as string).trim()

  // Each segment is formatted on its own (simple arguments never span the structure markers).
  const blocks = parseBody(body)
  const catalog: Record<string, string> = {}
  let i = 0
  const key = (text: string) => {
    const k = `s${i++}`
    catalog[k] = text
    return k
  }
  const keyed = blocks.map((b) =>
    b.kind === 'button'
      ? b
      : b.kind === 'list'
        ? { kind: 'list' as const, items: b.items.map((it) => it.map((s) => ({ ...s, key: key(s.text) }))) }
        : { kind: 'paragraph' as const, lines: b.lines.map((l) => l.map((s) => ({ ...s, key: key(s.text) }))) },
  )
  const subjectKey = template.subject ? key(template.subject) : null
  const tr = createTranslator(ctx.audience, ctx.locale, template.catalog, catalog)
  const fmt = (k: string) => tr.t(k, clean)

  const textBlocks: string[] = []
  const htmlBlocks: string[] = []
  const inlineHtml = (segs: (Segment & { key: string })[]) =>
    segs
      .map((s) => {
        const html = escapeHtml(fmt(s.key)).replace(/\n/g, '<br>')
        return s.bold ? `<strong style="font-weight:700;color:${MESSAGE_COLOURS.navy};">${html}</strong>` : html
      })
      .join('')
  const inlineText = (segs: (Segment & { key: string })[]) => segs.map((s) => fmt(s.key)).join('')
  const P = `margin:0 0 16px;font:16px/1.55 Arial,Helvetica,sans-serif;color:${MESSAGE_COLOURS.charcoal};`
  for (const b of keyed) {
    if (b.kind === 'button') {
      const url = clean[b.variable] as string
      textBlocks.push(url)
      const label = escapeHtml(buttonLabel(b.variable, ctx))
      htmlBlocks.push(
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;"><tr><td style="border-radius:6px;background:${MESSAGE_COLOURS.navy};">` +
          `<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font:700 16px/1.2 Arial,Helvetica,sans-serif;color:#FFFFFF;text-decoration:none;border-radius:6px;">${label}</a>` +
          `</td></tr></table>` +
          `<p style="margin:0 0 16px;font:13px/1.5 Arial,Helvetica,sans-serif;color:${MESSAGE_COLOURS.charcoal};word-break:break-all;">${escapeHtml(url)}</p>`,
      )
    } else if (b.kind === 'list') {
      textBlocks.push(b.items.map((it) => `- ${inlineText(it)}`).join('\n'))
      htmlBlocks.push(
        `<ul style="margin:0 0 16px;padding-left:22px;">${b.items
          .map((it) => `<li style="${P}margin:0 0 4px;">${inlineHtml(it)}</li>`)
          .join('')}</ul>`,
      )
    } else {
      textBlocks.push(b.lines.map(inlineText).join('\n'))
      htmlBlocks.push(`<p style="${P}">${b.lines.map(inlineHtml).join('<br>')}</p>`)
    }
  }
  const subject = subjectKey ? fmt(subjectKey).replace(/\s+/g, ' ').trim() : null
  const bodyText = textBlocks.join('\n\n')
  if (ctx.channel === 'sms') return { subject: null, text: bodyText, html: null }

  const footer = footerLines(ctx)
  const text = `${bodyText}\n\n--\n${footer.join('\n')}`
  const html =
    `<!doctype html><html lang="${ctx.locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light">` +
    `<title>${escapeHtml(subject ?? ctx.brand)}</title></head>` +
    `<body style="margin:0;padding:0;background:${MESSAGE_COLOURS.ivory};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MESSAGE_COLOURS.ivory};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid ${MESSAGE_COLOURS.stone};border-radius:8px;">` +
    `<tr><td style="padding:20px 24px;background:${MESSAGE_COLOURS.navy};border-radius:8px 8px 0 0;border-bottom:4px solid ${MESSAGE_COLOURS.gold};">` +
    `<span style="font:700 22px/1.2 Georgia,'Times New Roman',serif;color:#FFFFFF;letter-spacing:0.5px;">${escapeHtml(ctx.brand)}</span></td></tr>` +
    `<tr><td style="padding:24px;">${htmlBlocks.join('')}</td></tr>` +
    `<tr><td style="padding:16px 24px;border-top:1px solid ${MESSAGE_COLOURS.stone};font:13px/1.5 Arial,Helvetica,sans-serif;color:${MESSAGE_COLOURS.charcoal};">` +
    footer.map((l) => escapeHtml(l)).join('<br>') +
    `</td></tr></table></td></tr></table></body></html>`
  return { subject, text, html }
}

/** The footer: the brand and, on customer emails, the configured public phone and email or labelled placeholders. */
export function footerLines(ctx: Pick<LayoutContext, 'audience' | 'brand' | 'contact'>): string[] {
  if (ctx.audience !== 'customer') return [ctx.brand]
  const t = customerTranslator().t
  const placeholder = t('site.footer.contactPlaceholder')
  return [
    ctx.brand,
    `${t('site.footer.phone')}: ${ctx.contact?.phone ?? placeholder}`,
    `${t('site.footer.email')}: ${ctx.contact?.email ?? placeholder}`,
  ]
}
