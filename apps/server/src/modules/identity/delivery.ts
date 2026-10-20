// Delivery of one-time codes (TSK-0016; FACT-AUTOMATIC-MESSAGES #2, OWN-DEC-65, OWN-DEC-96, INT-Resend, INT-Bird,
// HH-COM-05, RULE-LANGUAGES). The code is the automatic message `contact.verification_code` of the notifications
// module (TSK-0047): it is sent only while that message is on the configured automatic list, with the current English
// template, through the Resend or Bird adapter and the test-destination guard, and recorded in
// platform.message_deliveries (metadata only, never the text).
// This file supplies the values at send time:
// - it rechecks the code and resolves to 'stale' (nothing sent) once it is used, superseded or expired;
// - it derives the code from the code key and the row's nonce, so a retried job renders the same code and reaches the
//   provider under the same delivery key; the code is never stored, logged or carried in the outbox;
// - the lifetime shown is the code's own, taken from configuration when it was issued.
import type { Tx } from '@handyhub/db'
import type { Automation } from '../../platform/automation.js'
import { loadConfig } from '../../platform/config/index.js'
import {
  notificationAutomation,
  releaseTemplateVersion,
  type NotificationProviders,
  type TemplateDraft,
} from '../notifications/index.js'
import type { CodeChannel } from './codes.js'
import { deriveCode, type CodeKeySettings } from './keys.js'

export class CodeDeliveryError extends Error {
  override name = 'CodeDeliveryError'
}

export const CODE_MESSAGE_KEY = 'contact.verification_code'

/**
 * PROPOSED wording of the code message (English only). The owner has not worded it, so it is not seeded (only
 * owner-worded templates are, T74): the owner releases it, or a changed version, with releaseProposedCodeTemplates or
 * the template release flow. Until then contact.verification_code is NOT CONFIGURED and deliveries fail visibly with
 * template_not_configured. The lifetime is a value from configuration, never part of the text.
 */
export const PROPOSED_CODE_TEMPLATES: readonly TemplateDraft[] = [
  {
    messageKey: CODE_MESSAGE_KEY,
    channel: 'email',
    locale: 'en',
    subject: 'Your HandyHub verification code',
    body: 'Your HandyHub verification code is {verificationCode}. It expires in {codeLifetimeMinutes} minutes. If you did not ask for this code, you can ignore this message.',
    translationReview: 'source',
  },
  {
    messageKey: CODE_MESSAGE_KEY,
    channel: 'sms',
    locale: 'en',
    subject: null,
    body: 'HandyHub code: {verificationCode}. It expires in {codeLifetimeMinutes} minutes. Do not share it.',
    translationReview: 'source',
  },
]

/** Releases the PROPOSED code templates as new versions (an owner action; callers authorize it first). */
export async function releaseProposedCodeTemplates(tx: Tx, releasedBy: string): Promise<void> {
  for (const draft of PROPOSED_CODE_TEMPLATES)
    await releaseTemplateVersion(tx, { ...draft, sourceIds: ['OWN-DEC-96', 'OWN-DEC-65'], releasedBy })
}

export type CodeDeliveryDeps = { providers: NotificationProviders; codeKey: CodeKeySettings }

export function codeDeliveryAutomation(deps: CodeDeliveryDeps): Automation {
  return notificationAutomation({
    messageKey: CODE_MESSAGE_KEY,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) throw new CodeDeliveryError('the job names no code')
      const row = await tx
        .selectFrom('identity.verification_codes')
        .select(['id', 'channel', 'destination', 'nonce', 'expires_at', 'consumed_at', 'superseded_at', 'created_at'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()
      if (!row) throw new CodeDeliveryError('the code does not exist')
      if (row.consumed_at || row.superseded_at || row.expires_at.getTime() <= Date.now()) return 'stale'
      // Not configured: the job fails visibly (exceptions queue, Office) instead of pretending a code was sent.
      if (deps.codeKey.state !== 'configured') throw new CodeDeliveryError('CODE_HASH_KEY is not configured')
      const limits = (await loadConfig(tx)).get('verification.limits')
      if (limits.state !== 'CONFIGURED') throw new CodeDeliveryError('verification.limits is NOT CONFIGURED')
      const minutes = Math.max(1, Math.round((row.expires_at.getTime() - row.created_at.getTime()) / 60_000))
      return {
        subjectKey: `verification_code:${row.id}`,
        record: { type: 'verification_code', id: row.id },
        recipients: [
          {
            kind: 'customer_contact',
            destinations: [
              { channel: row.channel as CodeChannel, destination: row.destination, permission: 'preferred' },
            ],
          },
        ],
        values: {
          verificationCode: deriveCode(deps.codeKey.key, row.id, row.nonce, limits.value.codeDigits),
          codeLifetimeMinutes: String(minutes),
        },
      }
    },
  })
}
