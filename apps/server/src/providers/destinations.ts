// Approved test destinations (TSK-0013; HH-AUD-05, RULE-SYNTHETIC-DATA, OWN-DEC-22). Outside production every send,
// to a real provider or a fake, must go to an approved test destination; any other destination is suppressed before
// the provider is called, and logged with a masked address. Production sends to real customers only after the
// owner's go decision, which is the only environment without the allowlist.
// - staging: only the destinations the owner approved (TEST_EMAIL_DESTINATIONS, TEST_PHONE_DESTINATIONS);
// - local and ci: those, plus the reserved synthetic ones (example.test and the 555-01xx fictional numbers).
import { isTestEmail, isTestPhone } from '@handyhub/db'
import type { Logger } from '../platform/logger.js'
import type { Environment, ProviderSettings } from './settings.js'
import type { EmailMessage, EmailSender, SendOutcome, SmsMessage, SmsSender } from './types.js'

export type DestinationPolicy = {
  environment: Environment
  allows(kind: 'email' | 'phone', destination: string): boolean
}

const E164 = /^\+[1-9]\d{7,14}$/

export function destinationPolicy(
  settings: Pick<ProviderSettings, 'environment' | 'testDestinations'>,
): DestinationPolicy {
  const emails = new Set(settings.testDestinations.emails.map((e) => e.toLowerCase()))
  const phones = new Set(settings.testDestinations.phones)
  const synthetic = settings.environment === 'local' || settings.environment === 'ci'
  return {
    environment: settings.environment,
    allows(kind, destination) {
      if (settings.environment === 'production') return true
      if (kind === 'email') {
        const d = destination.trim().toLowerCase()
        return emails.has(d) || (synthetic && isTestEmail(d))
      }
      return phones.has(destination) || (synthetic && isTestPhone(destination))
    },
  }
}

/** For logs: the first character and the domain of an address, the last two digits of a number. */
export function maskDestination(kind: 'email' | 'phone', destination: string): string {
  if (kind === 'email') {
    const at = destination.lastIndexOf('@')
    return at > 0 ? `${destination[0]}***@${destination.slice(at + 1)}` : '***'
  }
  return destination.length > 2 ? `***${destination.slice(-2)}` : '***'
}

function suppressed(
  log: Logger,
  kind: 'email' | 'phone',
  destination: string,
  idempotencyKey: string,
  reason: 'not_on_test_allowlist' | 'invalid_destination',
): SendOutcome {
  log.warn(
    { channel: kind, destination: maskDestination(kind, destination), idempotencyKey, reason },
    'send suppressed',
  )
  return { outcome: 'suppressed', reason }
}

export function guardEmail(sender: EmailSender, policy: DestinationPolicy, log: Logger): EmailSender {
  return {
    provider: sender.provider,
    async send(message: EmailMessage) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to))
        return suppressed(log, 'email', message.to, message.idempotencyKey, 'invalid_destination')
      if (!policy.allows('email', message.to))
        return suppressed(log, 'email', message.to, message.idempotencyKey, 'not_on_test_allowlist')
      return sender.send(message)
    },
  }
}

export function guardSms(sender: SmsSender, policy: DestinationPolicy, log: Logger): SmsSender {
  return {
    provider: sender.provider,
    async send(message: SmsMessage) {
      if (!E164.test(message.to))
        return suppressed(log, 'phone', message.to, message.idempotencyKey, 'invalid_destination')
      if (!policy.allows('phone', message.to))
        return suppressed(log, 'phone', message.to, message.idempotencyKey, 'not_on_test_allowlist')
      return sender.send(message)
    },
  }
}
