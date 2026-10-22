// Provider settings from the environment (TSK-0013; RULE-SYNTHETIC-DATA, HH-AUD-05). Names only live in the repo;
// the owner sets the values in Render. This is the small interface the configuration module (TSK-0007) replaces.
// - local and ci default to the in-memory fakes; a real provider is used only when explicitly selected.
// - staging and production have no default: until the owner selects a provider and sets every variable it needs,
//   the channel is NOT CONFIGURED (named missing variables, never a fake success). Fakes are refused there.
// - EMAIL_PROVIDER=log (TSK-0112): staging, local and ci only; production refuses to start with it (ConfigError). It
//   needs TEST_EMAIL_DESTINATIONS and writes each allowed email to the server log instead of sending it.
// - A webhook signing secret that is unset leaves that provider's inbound channel "not configured".
import { ConfigError, ENVIRONMENTS, type EnvironmentName } from '../config.js'
import { Secret } from './types.js'

export type Environment = EnvironmentName

/** Every provider variable, with what it is for. Values live in Render, never in the repository. */
export const PROVIDER_ENV_VARS = {
  EMAIL_PROVIDER:
    'fake (local and ci only), log (staging, local and ci; refused in production) or resend. Default: fake in local ' +
    'and ci, not configured elsewhere. log writes each email to an approved test address (TEST_EMAIL_DESTINATIONS, ' +
    'required) to the server log as STAGING_EMAIL_LOGGED, so invite and reset links can be read there; nothing is ' +
    'sent and it is never shown as delivered.',
  RESEND_API_KEY: 'Resend API key. Secret.',
  EMAIL_FROM: 'Sender address on the verified Resend domain.',
  EMAIL_REPLY_TO: 'Optional reply-to address.',
  RESEND_API_BASE_URL: 'Optional. Default https://api.resend.com.',
  RESEND_WEBHOOK_SECRET: 'Resend webhook signing secret (whsec_...). Unset: inbound email not configured. Secret.',
  SMS_PROVIDER: 'fake (local and ci only) or bird. Default: fake in local and ci, not configured elsewhere.',
  BIRD_API_KEY: 'Bird workspace API key (bk_<region>_...). Secret.',
  BIRD_SMS_FROM: 'The business number in E.164, held by the Bird workspace.',
  BIRD_API_BASE_URL: 'Optional. Default: the regional host named by the API key.',
  BIRD_WEBHOOK_SECRET: 'Bird webhook signing secret (whsec_...). Unset: inbound texts not configured. Secret.',
  INBOUND_EMAIL_ADDRESS:
    'The Resend receiving address customers reply to; each project email replies to its plus-addressed reply token. ' +
    'Unset: reply tokens not configured (replies match by thread headers and verified email only).',
  STORAGE_PROVIDER: 'fake (local and ci only) or r2. Default: fake in local and ci, not configured elsewhere.',
  R2_ACCOUNT_ID: 'Cloudflare account ID of the R2 bucket.',
  R2_BUCKET: 'Private R2 bucket name.',
  R2_ACCESS_KEY_ID: 'R2 access key scoped to the bucket. Secret.',
  R2_SECRET_ACCESS_KEY: 'R2 secret access key. Secret.',
  TEST_EMAIL_DESTINATIONS:
    'Approved test e-mail addresses, comma separated; outside production only these receive mail.',
  TEST_PHONE_DESTINATIONS: 'Approved test numbers in E.164, comma separated; outside production only these get texts.',
} as const

export type NotConfigured = { adapter: 'not_configured'; missing: string[] }
export type EmailSettings =
  | { adapter: 'fake' }
  /** Staging, local and ci only (refused in production): the message is written to the server log, never sent. */
  | { adapter: 'log' }
  | { adapter: 'resend'; apiKey: Secret; from: string; replyTo: string | null; apiBaseUrl: string }
  | NotConfigured
export type SmsSettings =
  { adapter: 'fake' } | { adapter: 'bird'; apiKey: Secret; from: string; apiBaseUrl: string } | NotConfigured
export type StorageSettings =
  | { adapter: 'fake' }
  | { adapter: 'r2'; accountId: string; bucket: string; accessKeyId: Secret; secretAccessKey: Secret }
  | NotConfigured

export type ProviderSettings = {
  environment: Environment
  email: EmailSettings
  sms: SmsSettings
  storage: StorageSettings
  webhookSecrets: { bird: Secret | null; resend: Secret | null }
  /**
   * TSK-0049: the receiving address of inbound email (INBOUND_EMAIL_ADDRESS). Project emails reply to
   * `<local>+<reply token>@<domain>`; null while not configured.
   */
  inbound: { emailAddress: { local: string; domain: string } | null }
  /** Approved test destinations (set by the owner); every non-production send must match one. */
  testDestinations: { emails: string[]; phones: string[] }
}

/** The environments where EMAIL_PROVIDER=log may be selected; production refuses to start with it. */
export const LOG_EMAIL_ENVIRONMENTS: readonly Environment[] = ['local', 'ci', 'staging']

const E164 = /^\+[1-9]\d{7,14}$/
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/

function list(value: string | undefined, valid: RegExp, name: string): string[] {
  const items = (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const item of items) if (!valid.test(item)) throw new ConfigError(`${name} holds an invalid entry`)
  return items
}

function choose(
  env: NodeJS.ProcessEnv,
  name: string,
  environment: Environment,
  real: string,
): 'fake' | 'real' | 'none' {
  const value = env[name]
  if (value === undefined || value === '') return environment === 'local' || environment === 'ci' ? 'fake' : 'none'
  if (value === 'fake') {
    if (environment !== 'local' && environment !== 'ci')
      throw new ConfigError(`${name}=fake is allowed only in local and ci`)
    return 'fake'
  }
  if (value === real) return 'real'
  throw new ConfigError(`${name} must be fake or ${real}`)
}

function required(env: NodeJS.ProcessEnv, names: string[]): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {}
  const missing: string[] = []
  for (const n of names) {
    const v = env[n]
    if (v === undefined || v.trim() === '') missing.push(n)
    else values[n] = v.trim()
  }
  return { values, missing }
}

const secretOrNull = (v: string | undefined) => (v && v.trim() ? new Secret(v.trim()) : null)

/** The inbound receiving address, split for plus-addressing; its local part may not carry a '+' of its own. */
export function inboundAddress(value: string | undefined): { local: string; domain: string } | null {
  const v = value?.trim().toLowerCase()
  if (!v) return null
  const m = /^([a-z0-9._-]{1,40})@([a-z0-9.-]+\.[a-z]{2,})$/.exec(v)
  if (!m) throw new ConfigError('INBOUND_EMAIL_ADDRESS must be a plain address such as replies@<receiving domain>')
  return { local: m[1] as string, domain: m[2] as string }
}

/** Bird API keys name their region (`bk_us1_...`); the regional host follows from it. */
export function birdApiBaseUrl(apiKey: string): string {
  const m = /^b[km]_([a-z]{2}\d)_/.exec(apiKey)
  return `https://${m?.[1] ?? 'us1'}.platform.bird.com`
}

export function readProviderSettings(env: NodeJS.ProcessEnv = process.env): ProviderSettings {
  const environment = env['HANDYHUB_ENV'] as Environment
  if (!(ENVIRONMENTS as readonly string[]).includes(environment ?? ''))
    throw new ConfigError(`HANDYHUB_ENV must be one of ${ENVIRONMENTS.join(', ')}`)

  const testDestinations = {
    emails: list(env['TEST_EMAIL_DESTINATIONS'], EMAIL, 'TEST_EMAIL_DESTINATIONS').map((e) => e.toLowerCase()),
    phones: list(env['TEST_PHONE_DESTINATIONS'], E164, 'TEST_PHONE_DESTINATIONS'),
  }

  let email: EmailSettings = { adapter: 'not_configured', missing: ['EMAIL_PROVIDER'] }
  const logEmail = env['EMAIL_PROVIDER'] === 'log'
  if (logEmail) {
    // TSK-0112: the staging log sender. Production never starts with it (an allowlist, so no new environment slips in).
    if (!LOG_EMAIL_ENVIRONMENTS.includes(environment))
      throw new ConfigError(`EMAIL_PROVIDER=log is allowed only in ${LOG_EMAIL_ENVIRONMENTS.join(', ')}`)
    email = testDestinations.emails.length
      ? { adapter: 'log' }
      : { adapter: 'not_configured', missing: ['TEST_EMAIL_DESTINATIONS'] }
  }
  const emailChoice = logEmail ? 'none' : choose(env, 'EMAIL_PROVIDER', environment, 'resend')
  if (emailChoice === 'fake') email = { adapter: 'fake' }
  if (emailChoice === 'real') {
    const r = required(env, ['RESEND_API_KEY', 'EMAIL_FROM'])
    email = r.missing.length
      ? { adapter: 'not_configured', missing: r.missing }
      : {
          adapter: 'resend',
          apiKey: new Secret(r.values['RESEND_API_KEY'] as string),
          from: r.values['EMAIL_FROM'] as string,
          replyTo: env['EMAIL_REPLY_TO']?.trim() || null,
          apiBaseUrl: env['RESEND_API_BASE_URL']?.trim() || 'https://api.resend.com',
        }
  }

  let sms: SmsSettings = { adapter: 'not_configured', missing: ['SMS_PROVIDER'] }
  const smsChoice = choose(env, 'SMS_PROVIDER', environment, 'bird')
  if (smsChoice === 'fake') sms = { adapter: 'fake' }
  if (smsChoice === 'real') {
    const r = required(env, ['BIRD_API_KEY', 'BIRD_SMS_FROM'])
    const key = r.values['BIRD_API_KEY'] ?? ''
    sms = r.missing.length
      ? { adapter: 'not_configured', missing: r.missing }
      : {
          adapter: 'bird',
          apiKey: new Secret(key),
          from: r.values['BIRD_SMS_FROM'] as string,
          apiBaseUrl: env['BIRD_API_BASE_URL']?.trim() || birdApiBaseUrl(key),
        }
  }

  let storage: StorageSettings = { adapter: 'not_configured', missing: ['STORAGE_PROVIDER'] }
  const storageChoice = choose(env, 'STORAGE_PROVIDER', environment, 'r2')
  if (storageChoice === 'fake') storage = { adapter: 'fake' }
  if (storageChoice === 'real') {
    const r = required(env, ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'])
    storage = r.missing.length
      ? { adapter: 'not_configured', missing: r.missing }
      : {
          adapter: 'r2',
          accountId: r.values['R2_ACCOUNT_ID'] as string,
          bucket: r.values['R2_BUCKET'] as string,
          accessKeyId: new Secret(r.values['R2_ACCESS_KEY_ID'] as string),
          secretAccessKey: new Secret(r.values['R2_SECRET_ACCESS_KEY'] as string),
        }
  }

  return {
    environment,
    email,
    sms,
    storage,
    webhookSecrets: {
      bird: secretOrNull(env['BIRD_WEBHOOK_SECRET']),
      resend: secretOrNull(env['RESEND_WEBHOOK_SECRET']),
    },
    inbound: { emailAddress: inboundAddress(env['INBOUND_EMAIL_ADDRESS']) },
    testDestinations,
  }
}
