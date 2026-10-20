// Delivery of one-time codes (TSK-0016; FACT-AUTOMATIC-MESSAGES #2, OWN-DEC-65, OWN-DEC-96, INT-Resend, INT-Bird,
// HH-COM-05, RULE-LANGUAGES). An automatic message: it sends as soon as the code is issued, by e-mail through Resend
// or by text through Bird, in English. The job:
// - rechecks the code at send time and sends nothing for a used, superseded or expired one ('cancelled');
// - derives the code from the code key and the row's nonce, so every retry sends the same code, under the job's
//   idempotency key, and no code is ever stored, logged or carried in the outbox;
// - goes through the destination guard, so outside production only approved test destinations receive it;
// - records the delivery state on the row; a provider that is NOT CONFIGURED, a temporary error or an unknown outcome
//   fails the attempt (retried, then visible to the Office in the exceptions queue); a refusal or a suppressed
//   destination is recorded on the row and not retried.
import { customerTranslator } from '@handyhub/i18n'
import type { Automation } from '../../platform/automation.js'
import { loadConfig } from '../../platform/config/index.js'
import type { Providers } from '../../providers/index.js'
import type { SendOutcome } from '../../providers/types.js'
import { CODE_ISSUED_EVENT, type CodeChannel } from './codes.js'
import { deriveCode, type CodeKeySettings } from './keys.js'

export class CodeDeliveryError extends Error {
  override name = 'CodeDeliveryError'
}

export type CodeDeliveryDeps = { providers: Pick<Providers, 'email' | 'sms'>; codeKey: CodeKeySettings }

/** The customer texts of a code message (English only). */
export function codeMessage(channel: CodeChannel, code: string, minutes: number) {
  const t = customerTranslator()
  return channel === 'email'
    ? { subject: t.t('code.email.subject'), text: t.t('code.email.text', { code, minutes }) }
    : { text: t.t('code.sms.text', { code, minutes }) }
}

export function codeDeliveryAutomation(deps: CodeDeliveryDeps): Automation {
  return {
    name: 'verification_code.send',
    trigger: { kind: 'event', eventTypes: [CODE_ISSUED_EVENT] },
    identity: 'system:identity.code_delivery',
    inputs: { description: 'verification_code id (aggregate); channel and purpose in the payload', version: 1 },
    idempotency:
      'The job key is the provider idempotency key and the code is derived again, so a retry is the same send.',
    effect: 'Sends one one-time code by e-mail (Resend) or text (Bird) and records the delivery state on the code.',
    retry: { maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 60_000 },
    timeoutMs: 20_000,
    exceptionOwner: 'office',
    audit: { action: 'verification_code.sent' },
    // The provider deduplicates by the same idempotency key and the code is the same, so re-running is safe.
    reconcile: async () => 'retry',
    async handle({ tx, job, idempotencyKey, log }) {
      const id = job.target.id
      if (!id) throw new CodeDeliveryError('the job names no code')
      const row = await tx
        .selectFrom('identity.verification_codes')
        .select(['id', 'channel', 'destination', 'nonce', 'expires_at', 'consumed_at', 'superseded_at', 'created_at'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()
      if (!row) throw new CodeDeliveryError('the code does not exist')
      const setState = (
        delivery_state: string,
        extra: { provider_message_id?: string; delivery_error?: string } = {},
      ) =>
        tx
          .updateTable('identity.verification_codes')
          .set({ delivery_state, ...extra })
          .where('id', '=', id)
          .execute()

      if (row.consumed_at || row.superseded_at || row.expires_at.getTime() <= Date.now()) {
        await setState('cancelled')
        return 'cancelled'
      }
      if (deps.codeKey.state !== 'configured') throw new CodeDeliveryError('CODE_HASH_KEY is not configured')
      const config = await loadConfig(tx)
      const limits = config.get('verification.limits')
      if (limits.state !== 'CONFIGURED') throw new CodeDeliveryError('verification.limits is NOT CONFIGURED')
      const code = deriveCode(deps.codeKey.key, row.id, row.nonce, limits.value.codeDigits)
      const minutes = Math.max(1, Math.round((row.expires_at.getTime() - row.created_at.getTime()) / 60_000))
      const channel = row.channel as CodeChannel

      let outcome: SendOutcome
      if (channel === 'email') {
        if (!deps.providers.email) throw new CodeDeliveryError('the e-mail provider is NOT CONFIGURED')
        const m = codeMessage('email', code, minutes) as { subject: string; text: string }
        outcome = await deps.providers.email.send({
          to: row.destination,
          subject: m.subject,
          text: m.text,
          tags: [{ name: 'message', value: 'verification_code' }],
          idempotencyKey,
        })
      } else {
        if (!deps.providers.sms) throw new CodeDeliveryError('the text-message provider is NOT CONFIGURED')
        outcome = await deps.providers.sms.send({
          to: row.destination,
          text: codeMessage('sms', code, minutes).text,
          category: 'authentication',
          idempotencyKey,
        })
      }
      // The outcome only: never the code, the message text or the destination.
      log.info({ codeId: row.id, channel, outcome: outcome.outcome }, 'verification code delivery')
      switch (outcome.outcome) {
        case 'accepted':
          await setState('sent', { provider_message_id: outcome.providerMessageId })
          return 'done'
        case 'suppressed':
          await setState('suppressed', { delivery_error: outcome.reason })
          return 'done'
        case 'rejected':
          await setState('failed', { delivery_error: outcome.errorCode })
          return 'done'
        case 'retryable_error':
        case 'outcome_unknown':
          throw new CodeDeliveryError(`delivery not confirmed: ${outcome.errorCode}`)
      }
    },
  }
}
