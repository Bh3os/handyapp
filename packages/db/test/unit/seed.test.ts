import { describe, expect, it } from 'vitest'
import {
  assertTestEmail,
  assertTestPhone,
  createRng,
  type Db,
  isTestEmail,
  isTestPhone,
  runSeeders,
  type SeedEnvironment,
  seedEnvironment,
  SeedRefusedError,
} from '../../src/index.js'

describe('seed environment guard (TSK-0004, RULE-SYNTHETIC-DATA, HH-AUD-05)', () => {
  it('refuses production, NODE_ENV=production and an unset or unknown environment', () => {
    expect(() => seedEnvironment({ HANDYHUB_ENV: 'production' })).toThrow(SeedRefusedError)
    expect(() => seedEnvironment({ HANDYHUB_ENV: 'local', NODE_ENV: 'production' })).toThrow(SeedRefusedError)
    expect(() => seedEnvironment({})).toThrow(SeedRefusedError)
    expect(() => seedEnvironment({ HANDYHUB_ENV: 'prod' })).toThrow(SeedRefusedError)
  })

  it('allows local, ci and staging', () => {
    for (const e of ['local', 'ci', 'staging']) expect(seedEnvironment({ HANDYHUB_ENV: e })).toBe(e)
  })

  it('refuses production in runSeeders before the database is touched', async () => {
    const untouchable = new Proxy({} as Db, {
      get() {
        throw new Error('database touched')
      },
    })
    const seeder = { name: 'never', run: async () => undefined }
    await expect(runSeeders(untouchable, [seeder], { environment: 'production' as SeedEnvironment })).rejects.toThrow(
      SeedRefusedError,
    )
  })
})

describe('synthetic values (TSK-0004, RULE-SYNTHETIC-DATA)', () => {
  it('produces the same sequence from the same seed', () => {
    const run = (seed: number) => {
      const r = createRng(seed)
      return [r.next(), r.int(1, 6), r.pick(['a', 'b', 'c']), r.next()]
    }
    expect(run(7)).toEqual(run(7))
    expect(run(7)).not.toEqual(run(8))
    const r = createRng(1)
    for (let i = 0; i < 1000; i++) {
      const v = r.int(1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
    }
  })

  it('accepts only reserved test e-mail domains', () => {
    for (const ok of ['a@example.test', 'a@example.com', 'a@mail.example.org', 'a@shop.test', 'a@x.invalid'])
      expect(isTestEmail(ok), ok).toBe(true)
    for (const bad of ['a@gmail.com', 'a@example.com.evil.net', 'a@test', 'no-at-sign', '@example.test'])
      expect(isTestEmail(bad), bad).toBe(false)
    expect(() => assertTestEmail('someone@gmail.com')).toThrow(SeedRefusedError)
  })

  it('accepts only E.164 numbers in the fictional 555-0100 to 555-0199 range', () => {
    for (const ok of ['+15025550100', '+18125550199']) expect(isTestPhone(ok), ok).toBe(true)
    for (const bad of ['+15025550200', '+15025551234', '5025550100', '+10255550100', '+150255501000'])
      expect(isTestPhone(bad), bad).toBe(false)
    expect(() => assertTestPhone('+15025551234')).toThrow(SeedRefusedError)
  })
})
