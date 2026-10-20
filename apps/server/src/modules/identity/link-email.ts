// The automation that emails invite and reset links (TSK-0014; OWN-DEC-114, FACT-AUTOMATIC-MESSAGES "Staff accounts
// (automatic)", HH-COM-03). It runs from the outbox event `staff_link.issued` through the job queue:
// - it rechecks at send time that the link is still open and the account not disabled; otherwise it sends nothing;
// - it creates the token, stores its hash with the delivery and emails the link in the recipient's staff locale;
// - each attempt has its own provider idempotency key derived from its token, so a retry after an unknown outcome can
//   at worst send a second, valid link, never a dead one; the earlier token was never stored.
// No email provider (NOT CONFIGURED) or a missing STAFF_APP_URL fails the job into the exceptions queue (Owner),
// never a fake success.
import { staffTranslator } from '@handyhub/i18n'
import type { Automation } from '../../platform/automation.js'
import type { Providers } from '../../providers/index.js'
import { deliverToken, LINK_EVENT, type LinkPurpose } from './links.js'
import { hashToken } from './tokens.js'

export type LinkEmailDeps = {
  providers: Pick<Providers, 'email'>
  /** Base URL of the staff app, for example https://staff.handyhub247.com; undefined while not configured. */
  staffAppUrl: string | undefined
}

export class LinkEmailNotConfiguredError extends Error {
  override name = 'LinkEmailNotConfiguredError'
}

export function staffLinkEmailAutomation(deps: LinkEmailDeps): Automation {
  return {
    name: 'staff_link.email',
    trigger: { kind: 'event', eventTypes: [LINK_EVENT] },
    identity: 'system:staff_link_email',
    inputs: { description: 'linkId and purpose of an issued staff invite or reset link', version: 1 },
    idempotency: 'One delivery per link: the token hash is written only while the link is undelivered and open.',
    effect: 'Emails one staff invite or password-reset link to the account email',
    retry: { maxAttempts: 5, baseDelayMs: 30_000, maxDelayMs: 15 * 60_000 },
    timeoutMs: 30_000,
    exceptionOwner: 'owner',
    audit: { action: 'staff_link.email' },
    async handle({ tx, job, idempotencyKey, log }) {
      const linkId = String(job.payload['linkId'] ?? '')
      const link = await tx
        .selectFrom('identity.staff_links as l')
        .innerJoin('identity.staff_users as u', 'u.id', 'l.staff_user_id')
        .select(['l.id', 'l.purpose', 'l.expires_at', 'u.email', 'u.locale', 'u.status'])
        .where('l.id', '=', linkId)
        .executeTakeFirst()
      if (!link || link.status === 'disabled') return 'cancelled'
      if (!deps.providers.email) throw new LinkEmailNotConfiguredError('email provider is NOT CONFIGURED')
      if (!deps.staffAppUrl) throw new LinkEmailNotConfiguredError('STAFF_APP_URL is NOT CONFIGURED')
      const token = await deliverToken(tx, link.id)
      if (!token) return 'cancelled'
      const purpose = link.purpose as LinkPurpose
      const { t } = staffTranslator(link.locale === 'es' ? 'es' : 'en')
      const url = `${deps.staffAppUrl.replace(/\/$/, '')}/${purpose === 'invite' ? 'invite' : 'reset'}/${token}`
      const hours = Math.max(1, Math.round((new Date(link.expires_at).getTime() - Date.now()) / 3_600_000))
      const outcome = await deps.providers.email.send({
        to: link.email,
        subject: t(purpose === 'invite' ? 'email.staffInvite.subject' : 'email.staffReset.subject'),
        text: t(purpose === 'invite' ? 'email.staffInvite.body' : 'email.staffReset.body', { url, hours }),
        tags: [{ name: 'kind', value: purpose === 'invite' ? 'staff_invite' : 'staff_reset' }],
        idempotencyKey: `${idempotencyKey}:${hashToken(token).slice(0, 16)}`,
      })
      switch (outcome.outcome) {
        case 'accepted':
          return 'done'
        case 'suppressed':
          log.warn({ reason: outcome.reason }, 'STAFF_LINK_EMAIL_SUPPRESSED')
          return 'cancelled'
        default:
          throw new Error(`staff link email ${outcome.outcome}: ${outcome.errorCode}`)
      }
    },
  }
}
