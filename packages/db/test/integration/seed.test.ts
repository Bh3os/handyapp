// The seed framework against a real database (TSK-0004, RULE-SYNTHETIC-DATA).
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isTestEmail, isTestPhone, runSeeders, SEEDERS, type Seeder } from '../../src/index.js'
import { createTestDatabase, type TestDatabase } from '../../src/testing.js'

let t: TestDatabase
beforeAll(async () => {
  t = await createTestDatabase()
  await sql`CREATE TABLE public.people (email text NOT NULL, phone text NOT NULL, score int NOT NULL)`.execute(t.db)
})
afterAll(async () => {
  await t.drop()
})

const people: Seeder = {
  name: 'people',
  async run(ctx) {
    for (let i = 0; i < 3; i++)
      await sql`INSERT INTO public.people VALUES (${ctx.email('Test Customer')}, ${ctx.phone()}, ${ctx.rng.int(1, 1000)})`.execute(
        ctx.trx,
      )
  },
}
const rows = async () =>
  (await sql<{ email: string; phone: string; score: number }>`SELECT * FROM public.people`.execute(t.db)).rows

describe('synthetic seeds (TSK-0004, RULE-SYNTHETIC-DATA)', () => {
  it('writes only test e-mail domains and fictional phone numbers, identically on every run (fixed seed)', async () => {
    expect(await runSeeders(t.db, [people], { environment: 'ci' })).toEqual(['people'])
    const first = await rows()
    expect(first.map((r) => r.email)).toEqual([
      'test-customer-1@example.test',
      'test-customer-2@example.test',
      'test-customer-3@example.test',
    ])
    expect(first.map((r) => r.phone)).toEqual(['+15025550100', '+15025550101', '+15025550102'])
    expect(first.every((r) => isTestEmail(r.email) && isTestPhone(r.phone))).toBe(true)

    await sql`DELETE FROM public.people`.execute(t.db)
    await runSeeders(t.db, [people], { environment: 'ci' })
    expect(await rows()).toEqual(first)
  })

  it('rolls back a failing seeder and stops before the next one', async () => {
    await sql`DELETE FROM public.people`.execute(t.db)
    const failing: Seeder = {
      name: 'failing',
      async run(ctx) {
        await sql`INSERT INTO public.people VALUES (${ctx.email('x')}, ${ctx.phone()}, 1)`.execute(ctx.trx)
        throw new Error('seed failed')
      },
    }
    await expect(runSeeders(t.db, [failing, people], { environment: 'local' })).rejects.toThrow('seed failed')
    expect(await rows()).toEqual([])
  })

  it('runs the registered seeders against the migrated schema', async () => {
    await expect(runSeeders(t.db, SEEDERS, { environment: 'ci' })).resolves.toEqual(SEEDERS.map((s) => s.name))
  })
})
