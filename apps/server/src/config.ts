// Environment schema, validated once at boot (TSK-0003; RULE-SYNTHETIC-DATA, OWN-DEC-73). The repository holds the
// variable names only; the owner sets every value in Render. An invalid or missing required value refuses to start,
// and every error names the variable, never its value.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const ENVIRONMENTS = ['local', 'ci', 'staging', 'production'] as const
export type EnvironmentName = (typeof ENVIRONMENTS)[number]

/** Environments that must run behind the access gate (OWN-DEC-73): the hosted test system, never production. */
export const GATE_REQUIRED_ENVIRONMENTS: readonly EnvironmentName[] = ['staging']
/** Environments that must have a database. */
export const DATABASE_REQUIRED_ENVIRONMENTS: readonly EnvironmentName[] = ['staging', 'production']

/** Every variable the server reads, with what it is for. Values live in Render, never in the repository. */
export const ENV_VARS = {
  HANDYHUB_ENV: 'Required. local, ci, staging or production.',
  DATABASE_URL: 'PostgreSQL connection string. Required in staging and production. Secret.',
  ACCESS_GATE_USERS:
    'Staging access gate testers, "name:password" pairs separated by commas. Required in staging, refused in production. Secret.',
  PORT: 'Port to listen on (Render sets it). Default 3000.',
  HOST: 'Interface to listen on. Default 127.0.0.1; 0.0.0.0 in the container.',
  SITE_DIR: 'Directory of the built public site. Default apps/site/dist.',
  STAFF_DIR:
    'Directory of the built staff app, served under /staff until host routing exists. Default apps/staff/dist.',
  STAFF_APP_URL:
    'Base URL of the staff app for links in staff emails, for example https://staff.handyhub247.com. Default in local and ci: http://<HOST>:<PORT>/staff; unset elsewhere: invite and reset emails are NOT CONFIGURED.',
  BOOTSTRAP_OWNER_EMAIL:
    'Email of the first Owner. While no Owner exists, the server creates that invited account at start and emails one invite link; no password is ever set from the environment.',
  BOOTSTRAP_OWNER_NAME: 'Optional display name of the first Owner.',
  TRUST_PROXY_HOPS: 'Proxies in front of the service that append to X-Forwarded-For. Default 0.',
  LOG_LEVEL: 'fatal, error, warn, info, debug, trace or silent. Default info.',
  CODE_HASH_KEY:
    'Key for one-time codes and client-address digests, at least 32 characters (TSK-0016). Unset in staging or production: codes NOT CONFIGURED; local and ci use a random key per process. Secret.',
} as const
export type EnvVarName = keyof typeof ENV_VARS

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** A tester of the access gate. The password is kept only as a keyed hash and never printed. */
export class AccessGateUser {
  readonly #nameHash: Buffer
  readonly #passwordHash: Buffer
  readonly #key: Buffer
  constructor(
    readonly name: string,
    password: string,
    key: Buffer,
  ) {
    this.#key = key
    this.#nameHash = gateHash(key, name)
    this.#passwordHash = gateHash(key, password)
  }
  /** Constant-time check of a presented name and password; both hashes are always compared. */
  matches(name: string, password: string): boolean {
    const nameOk = timingSafeEqual(this.#nameHash, gateHash(this.#key, name))
    const passwordOk = timingSafeEqual(this.#passwordHash, gateHash(this.#key, password))
    return nameOk && passwordOk
  }
  toJSON(): { name: string; password: string } {
    return { name: this.name, password: '[REDACTED]' }
  }
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `AccessGateUser(${this.name}, [REDACTED])`
  }
}

function gateHash(key: Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest()
}

export type AccessGateSettings = { enabled: false } | { enabled: true; realm: string; users: AccessGateUser[] }

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export interface Config {
  env: EnvironmentName
  databaseUrl: string | undefined
  port: number
  host: string
  siteDir: string | undefined
  staffDir: string | undefined
  /** Base URL of the staff app for emailed links; undefined while not configured. */
  staffAppUrl: string | undefined
  bootstrapOwner: { email: string; displayName: string | null } | null
  /** Secure, `__Host-` session cookies: staging and production. */
  secureCookies: boolean
  trustProxyHops: number
  logLevel: LogLevel
  accessGate: AccessGateSettings
  /** Outside production every response carries X-Robots-Tag: noindex and robots.txt disallows everything. */
  noindex: boolean
}

/** Tester names: a letter or digit, then letters, digits, ".", "_" or "-" (RFC 7617 forbids ":" in a user-id). */
const GATE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/
/** Passwords: 16 to 128 printable ASCII characters, no spaces or commas. */
const GATE_PASSWORD = /^[\x21-\x2b\x2d-\x7e]{16,128}$/
const GATE_PASSWORD_CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
const GATE_MAX_USERS = 25

/**
 * PROPOSED strength rule (from Bh3os/handyhub-app): besides the length, at least 3 of the 4 character classes and at
 * least 10 different characters, so a value such as "aaaaaaaaaaaaaaaa" or "password12345678" is refused.
 */
export function strongGatePassword(password: string): boolean {
  if (!GATE_PASSWORD.test(password)) return false
  const classes = GATE_PASSWORD_CLASSES.filter((c) => c.test(password)).length
  return classes >= 3 && new Set(password).size >= 10
}

/** Parses ACCESS_GATE_USERS. Every error names the variable and the entry number, never a name or a password. */
export function parseAccessGateUsers(raw: string, key: Buffer = randomBytes(32)): AccessGateUser[] {
  const entries = raw.split(',').map((e) => e.trim())
  if (entries.every((e) => e === '')) throw new ConfigError('ACCESS_GATE_USERS is set but names no tester')
  if (entries.length > GATE_MAX_USERS)
    throw new ConfigError(`ACCESS_GATE_USERS lists more than ${GATE_MAX_USERS} testers`)
  const seen = new Set<string>()
  return entries.map((entry, i) => {
    const n = i + 1
    const colon = entry.indexOf(':')
    if (colon < 1) throw new ConfigError(`ACCESS_GATE_USERS entry ${n} is not in the form name:password`)
    const name = entry.slice(0, colon)
    const password = entry.slice(colon + 1)
    if (!GATE_NAME.test(name))
      throw new ConfigError(
        `ACCESS_GATE_USERS entry ${n}: the name must be 1 to 32 letters, digits, ".", "_" or "-", starting with a letter or digit`,
      )
    if (!GATE_PASSWORD.test(password))
      throw new ConfigError(
        `ACCESS_GATE_USERS entry ${n}: the password must be 16 to 128 characters with no spaces or commas`,
      )
    if (!strongGatePassword(password))
      throw new ConfigError(
        `ACCESS_GATE_USERS entry ${n}: the password must mix at least 3 of lower-case letters, capitals, digits and symbols, with at least 10 different characters`,
      )
    if (seen.has(name.toLowerCase())) throw new ConfigError(`ACCESS_GATE_USERS entry ${n} repeats an earlier name`)
    seen.add(name.toLowerCase())
    return new AccessGateUser(name, password, key)
  })
}

function oneOf<T extends string>(name: EnvVarName, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value))
    throw new ConfigError(`${name} must be one of ${allowed.join(', ')}`)
  return value as T
}

function integer(name: EnvVarName, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max)
    throw new ConfigError(`${name} must be a whole number from ${min} to ${max}`)
  return n
}

/** Reads and validates the environment. Throws ConfigError naming the first problem. */
export function loadConfig(source: Readonly<Record<string, string | undefined>>): Config {
  const get = (name: EnvVarName): string | undefined => {
    const v = source[name]
    return v === undefined || v.trim() === '' ? undefined : v
  }

  const rawEnv = get('HANDYHUB_ENV')
  if (rawEnv === undefined) throw new ConfigError(`HANDYHUB_ENV is required (${ENVIRONMENTS.join(', ')})`)
  const env = oneOf('HANDYHUB_ENV', rawEnv, ENVIRONMENTS)

  const databaseUrl = get('DATABASE_URL')
  if (databaseUrl === undefined && DATABASE_REQUIRED_ENVIRONMENTS.includes(env))
    throw new ConfigError(`DATABASE_URL is required in ${env}`)
  if (databaseUrl !== undefined) {
    if (!URL.canParse(databaseUrl) || !['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol))
      throw new ConfigError('DATABASE_URL must be a postgres:// or postgresql:// connection string')
  }

  const gateRaw = get('ACCESS_GATE_USERS')
  let accessGate: AccessGateSettings
  if (gateRaw !== undefined && env === 'production')
    throw new ConfigError(
      'ACCESS_GATE_USERS is refused in production: the access gate is a staging setting (OWN-DEC-73)',
    )
  if (gateRaw === undefined) {
    // A deleted or forgotten value must never serve staging publicly: the service refuses to start instead.
    if (GATE_REQUIRED_ENVIRONMENTS.includes(env))
      throw new ConfigError(
        `ACCESS_GATE_USERS is required in ${env} (OWN-DEC-73): the environment is open to the owner and named testers only`,
      )
    accessGate = { enabled: false }
  } else {
    accessGate = { enabled: true, realm: `HandyHub ${env}`, users: parseAccessGateUsers(gateRaw) }
  }

  const logLevelRaw = get('LOG_LEVEL')
  const port = integer('PORT', get('PORT'), 3000, 0, 65535)
  const host = get('HOST') ?? '127.0.0.1'
  const staffAppUrl = get('STAFF_APP_URL')
  if (staffAppUrl !== undefined && !(URL.canParse(staffAppUrl) && /^https?:$/.test(new URL(staffAppUrl).protocol)))
    throw new ConfigError('STAFF_APP_URL must be an http or https URL')
  if ((env === 'staging' || env === 'production') && staffAppUrl?.startsWith('http:'))
    throw new ConfigError(`STAFF_APP_URL must use https in ${env}`)
  const ownerEmail = get('BOOTSTRAP_OWNER_EMAIL')?.trim().toLowerCase()
  if (ownerEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))
    throw new ConfigError('BOOTSTRAP_OWNER_EMAIL must be an email address')
  const local = env === 'local' || env === 'ci'
  return {
    env,
    databaseUrl,
    port,
    host,
    siteDir: get('SITE_DIR'),
    staffDir: get('STAFF_DIR'),
    staffAppUrl: staffAppUrl ?? (local && port !== 0 ? `http://${host}:${port}/staff` : undefined),
    bootstrapOwner: ownerEmail ? { email: ownerEmail, displayName: get('BOOTSTRAP_OWNER_NAME')?.trim() || null } : null,
    secureCookies: !local,
    trustProxyHops: integer('TRUST_PROXY_HOPS', get('TRUST_PROXY_HOPS'), 0, 0, 5),
    logLevel: logLevelRaw === undefined ? 'info' : oneOf('LOG_LEVEL', logLevelRaw, LOG_LEVELS),
    accessGate,
    noindex: env !== 'production',
  }
}
