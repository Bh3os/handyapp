// The staging log email sender (TSK-0112; HH-COM-03, HH-AUD-05, RULE-SYNTHETIC-DATA, OWN-DEC-152 section 14).
// EMAIL_PROVIDER=log, allowed in staging, local and ci only (the settings refuse it in production). Staging has no
// email provider yet, so the first Owner's invite (staff_link.email) could not be sent; this sender writes the message
// to the server log instead, where the operator reads the invite or reset link.
// - It "delivers" only to the approved test addresses (TEST_EMAIL_DESTINATIONS), checked here as well as by the
//   destination guard; any other address is suppressed and nothing about the message is logged.
// - One warn line, STAGING_EMAIL_LOGGED, carrying exactly the address, the subject and the plain-text body: no HTML,
//   no tags, no idempotency key, never a credential (it holds none).
// - It answers like a provider that accepted the message, but its provider name `log` is a test provider
//   (isTestProvider), so the message is never shown as delivered.
// - Like the providers, a repeated idempotency key answers with the first result and logs nothing new.
import { randomUUID } from 'node:crypto'
import type { Logger } from '../platform/logger.js'
import type { EmailMessage, EmailSender, SendOutcome } from './types.js'

/** How many idempotency keys are remembered for repeats; older ones fall out first. */
const REMEMBERED_KEYS = 1000

export const STAGING_EMAIL_LOGGED = 'STAGING_EMAIL_LOGGED'

export class LogEmailSender implements EmailSender {
  readonly provider = 'log' as const
  readonly #allowed: ReadonlySet<string>
  readonly #log: Logger
  readonly #sent = new Map<string, string>()

  constructor(testEmails: readonly string[], log: Logger) {
    this.#allowed = new Set(testEmails.map((e) => e.trim().toLowerCase()))
    this.#log = log
  }

  async send(message: EmailMessage): Promise<SendOutcome> {
    if (!this.#allowed.has(message.to.trim().toLowerCase()))
      return { outcome: 'suppressed', reason: 'not_on_test_allowlist' }
    const earlier = this.#sent.get(message.idempotencyKey)
    if (earlier) return { outcome: 'accepted', providerMessageId: earlier, status: 'queued' }
    const providerMessageId = `log-email-${randomUUID()}`
    this.#log.warn({ to: message.to, subject: message.subject, text: message.text }, STAGING_EMAIL_LOGGED)
    this.#sent.set(message.idempotencyKey, providerMessageId)
    if (this.#sent.size > REMEMBERED_KEYS) this.#sent.delete(this.#sent.keys().next().value as string)
    return { outcome: 'accepted', providerMessageId, status: 'queued' }
  }
}
