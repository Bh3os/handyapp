// The configured providers (TSK-0013). Each channel is a real adapter, a fake (local and ci only) or null while it is
// NOT CONFIGURED; callers show that state and never pretend a message was sent or a file was kept. Every email and
// text goes through the destination guard, so outside production only approved test destinations are reached.
import pino from 'pino'
import type { Logger } from '../platform/logger.js'
import { BirdSmsSender, FakeSmsSender } from './bird/index.js'
import { destinationPolicy, guardEmail, guardSms, type DestinationPolicy } from './destinations.js'
import { FakeObjectStorage, R2ObjectStorage, type ObjectStorage } from './r2/index.js'
import { FakeEmailSender, ResendEmailSender } from './resend/index.js'
import type { ProviderSettings } from './settings.js'
import type { EmailSender, SmsSender } from './types.js'

export type Providers = {
  email: EmailSender | null
  sms: SmsSender | null
  storage: ObjectStorage | null
  policy: DestinationPolicy
  /** The unguarded fakes, for tests to read what was "sent"; null when the channel is not a fake. */
  fakes: { email: FakeEmailSender | null; sms: FakeSmsSender | null; storage: FakeObjectStorage | null }
}

export function createProviders(
  settings: ProviderSettings,
  options: { logger?: Logger; fetchImpl?: typeof fetch } = {},
): Providers {
  const log = options.logger ?? pino({ enabled: false })
  const policy = destinationPolicy(settings)
  const fakeEmail = settings.email.adapter === 'fake' ? new FakeEmailSender() : null
  const fakeSms = settings.sms.adapter === 'fake' ? new FakeSmsSender() : null
  const fakeStorage = settings.storage.adapter === 'fake' ? new FakeObjectStorage() : null
  const email =
    settings.email.adapter === 'resend' ? new ResendEmailSender(settings.email, options.fetchImpl) : fakeEmail
  const sms = settings.sms.adapter === 'bird' ? new BirdSmsSender(settings.sms, options.fetchImpl) : fakeSms
  const storage = settings.storage.adapter === 'r2' ? new R2ObjectStorage(settings.storage) : fakeStorage
  return {
    email: email ? guardEmail(email, policy, log) : null,
    sms: sms ? guardSms(sms, policy, log) : null,
    storage,
    policy,
    fakes: { email: fakeEmail, sms: fakeSms, storage: fakeStorage },
  }
}

/** Names and states only, never a key, an address or a number. */
export function providerStatus(settings: ProviderSettings) {
  const state = (s: { adapter: string; missing?: string[] }) =>
    s.adapter === 'not_configured' ? { provider: 'not_configured', missing: s.missing ?? [] } : { provider: s.adapter }
  return {
    email: state(settings.email),
    sms: state(settings.sms),
    storage: state(settings.storage),
    inbound: {
      bird: settings.webhookSecrets.bird ? 'configured' : 'not_configured',
      resend: settings.webhookSecrets.resend ? 'configured' : 'not_configured',
    },
    testDestinations: settings.environment === 'production' ? 'off' : 'on',
  }
}

export type { DestinationPolicy } from './destinations.js'
export type { ObjectStorage } from './r2/index.js'
export type { ProviderSettings } from './settings.js'
export type { EmailMessage, EmailSender, SendOutcome, SmsMessage, SmsSender } from './types.js'
