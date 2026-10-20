import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checksum, listMigrations, MigrationError, planMigrations, type Migration } from '../../src/index.js'

const dirs: string[] = []
async function folder(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'hh-migrations-'))
  dirs.push(dir)
  for (const [name, sql] of Object.entries(files)) await writeFile(path.join(dir, name), sql)
  return dir
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

const m = (version: string, sql = `-- ${version}`): Migration => ({
  version,
  file: `${version}_m.sql`,
  sql,
  checksum: checksum(sql),
})
const applied = (x: Migration, sum = x.checksum) => ({ version: x.version, file: x.file, checksum: sum })

describe('migration files (TSK-0004, HH-ARC-01)', () => {
  it('lists NNNN_name.sql files in version order with their SHA-256 checksums', async () => {
    const dir = await folder({ '0002_b.sql': 'select 2', '0010_c.sql': 'select 10', '0001_a.sql': 'select 1' })
    const list = await listMigrations(dir)
    expect(list.map((x) => x.file)).toEqual(['0001_a.sql', '0002_b.sql', '0010_c.sql'])
    expect(list[0]?.checksum).toBe(checksum('select 1'))
    expect(list[0]?.checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses a misnamed .sql file instead of skipping it', async () => {
    const dir = await folder({ '0001_a.sql': '', '2_late.sql': '' })
    await expect(listMigrations(dir)).rejects.toThrow(MigrationError)
  })

  it('refuses two files with the same version', async () => {
    const dir = await folder({ '0001_a.sql': '', '0001_b.sql': '' })
    await expect(listMigrations(dir)).rejects.toThrow(/share version 0001/)
  })

  it('names every repository migration correctly', async () => {
    const list = await listMigrations()
    expect(list[0]?.file).toBe('0001_baseline.sql')
  })
})

describe('migration plan (TSK-0004)', () => {
  const [a, b, c] = [m('0001'), m('0002'), m('0003')]

  it('applies the pending migrations in version order after the applied ones', () => {
    expect(planMigrations([a, b, c], []).map((x) => x.version)).toEqual(['0001', '0002', '0003'])
    expect(planMigrations([a, b, c], [applied(a)]).map((x) => x.version)).toEqual(['0002', '0003'])
    expect(planMigrations([a, b, c], [applied(a), applied(b), applied(c)])).toEqual([])
  })

  it('refuses a changed applied migration', () => {
    expect(() => planMigrations([a, b], [applied(a, checksum('edited'))])).toThrow(/changed after it was applied/)
  })

  it('refuses when an applied migration is missing from the folder', () => {
    expect(() => planMigrations([b], [applied(a)])).toThrow(/missing from the migrations folder/)
  })

  it('refuses a new migration numbered below the latest applied one (forward-only)', () => {
    expect(() => planMigrations([a, b, c], [applied(a), applied(c)])).toThrow(/numbered below the latest applied/)
  })
})
