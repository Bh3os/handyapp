// Synthetic seed framework (TSK-0004; RULE-SYNTHETIC-DATA, HH-AUD-05). `pnpm db:seed` runs the registered seeders
// in order, each in its own transaction, with a fixed seed so every run produces the same records.
// - Refuses to run unless HANDYHUB_ENV is local, ci or staging: production, and an unset or unknown environment, fail
//   before the database is touched.
// - Contact values come only from the context: e-mail addresses on reserved test domains (RFC 2606 / RFC 6761) and
//   phone numbers in the NANP 555-0100 to 555-0199 range reserved for fictional use. Seeders that take values from
//   fixtures check them with assertTestEmail / assertTestPhone.
import type { Db, Tx } from './client.js'
import { withTx } from './tx.js'

/** Fixed seed: the same seeders always produce the same synthetic records. */
export const DEFAULT_SEED = 20_261_020

export const SEED_ENVIRONMENTS = ['local', 'ci', 'staging'] as const
export type SeedEnvironment = (typeof SEED_ENVIRONMENTS)[number]

export class SeedRefusedError extends Error {
  override name = 'SeedRefusedError'
}

/** Reads HANDYHUB_ENV and refuses any environment that may hold real data. */
export function seedEnvironment(env: NodeJS.ProcessEnv = process.env): SeedEnvironment {
  const value = env['HANDYHUB_ENV']
  if (value === 'production') throw new SeedRefusedError('Seeding is refused in production')
  if (env['NODE_ENV'] === 'production') throw new SeedRefusedError('Seeding is refused when NODE_ENV=production')
  if (!(SEED_ENVIRONMENTS as readonly string[]).includes(value ?? ''))
    throw new SeedRefusedError(`Seeding needs HANDYHUB_ENV set to one of ${SEED_ENVIRONMENTS.join(', ')}`)
  return value as SeedEnvironment
}

/** Deterministic pseudo-random numbers (mulberry32). */
export type Rng = { next(): number; int(min: number, max: number): number; pick<T>(items: readonly T[]): T }

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from an empty list')
      return items[Math.floor(next() * items.length)] as (typeof items)[number]
    },
  }
}

// Reserved for documentation and testing: RFC 2606 (example.com/.net/.org) and RFC 6761 (.test, .example, .invalid).
export const TEST_EMAIL_DOMAINS = ['example.test', 'example.com', 'example.net', 'example.org'] as const
const TEST_TLDS = ['test', 'example', 'invalid']
// Area codes used for synthetic numbers; only the 555-01xx subscriber range makes a number fictional.
export const TEST_PHONE_AREA_CODES = ['502', '812'] as const

export function isTestEmail(value: string): boolean {
  const at = value.lastIndexOf('@')
  if (at < 1) return false
  const domain = value.slice(at + 1).toLowerCase()
  if ((TEST_EMAIL_DOMAINS as readonly string[]).some((d) => domain === d || domain.endsWith(`.${d}`))) return true
  return TEST_TLDS.includes(domain.split('.').at(-1) ?? '') && domain.includes('.')
}

/** E.164 numbers in the NANP fictional range: +1 NXX 555 01XX. */
export function isTestPhone(value: string): boolean {
  return /^\+1[2-9]\d{2}55501\d{2}$/.test(value)
}

export function assertTestEmail(value: string): string {
  if (!isTestEmail(value)) throw new SeedRefusedError('Seed e-mail addresses must use a reserved test domain')
  return value
}

export function assertTestPhone(value: string): string {
  if (!isTestPhone(value)) throw new SeedRefusedError('Seed phone numbers must be in the 555-0100 to 555-0199 range')
  return value
}

export type SeedContext = {
  trx: Tx
  environment: SeedEnvironment
  rng: Rng
  /** A unique synthetic address, for example `customer-1@example.test`. */
  email(label: string): string
  /** A unique synthetic E.164 number, for example `+15025550100`. */
  phone(): string
}

export type Seeder = { name: string; run(ctx: SeedContext): Promise<void> }
export type SeedOptions = { environment: SeedEnvironment; seed?: number }

/**
 * Synthetic contact values: unique test-domain addresses and fictional 555-01xx numbers. Also used by the staging
 * fresh-test-data generator (TSK-0141), so every generated contact comes from the same reserved ranges.
 */
export function syntheticContacts(): Pick<SeedContext, 'email' | 'phone'> {
  const counters = new Map<string, number>()
  let phones = 0
  return {
    email(label) {
      const slug =
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'person'
      const n = (counters.get(slug) ?? 0) + 1
      counters.set(slug, n)
      return assertTestEmail(`${slug}-${n}@${TEST_EMAIL_DOMAINS[0]}`)
    },
    phone() {
      const perArea = 100
      if (phones >= perArea * TEST_PHONE_AREA_CODES.length) throw new Error('No synthetic phone numbers left')
      const area = TEST_PHONE_AREA_CODES[Math.floor(phones / perArea)] as string
      const line = 100 + (phones % perArea)
      phones++
      return assertTestPhone(`+1${area}5550${line}`)
    },
  }
}

/** Runs the seeders in order, each in one transaction, all from the same fixed seed. Returns the seeder names run. */
export async function runSeeders(db: Db, seeders: readonly Seeder[], options: SeedOptions): Promise<string[]> {
  if (!(SEED_ENVIRONMENTS as readonly string[]).includes(options.environment))
    throw new SeedRefusedError(`Seeding is refused in ${String(options.environment)}`)
  const rng = createRng(options.seed ?? DEFAULT_SEED)
  const contacts = syntheticContacts()
  const ran: string[] = []
  for (const seeder of seeders) {
    await withTx(db, (trx) => seeder.run({ trx, environment: options.environment, rng, ...contacts }))
    ran.push(seeder.name)
  }
  return ran
}
