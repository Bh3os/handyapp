// Integration tests run against a real PostgreSQL 16 (CI: the postgres:16 service; locally: TEST_DATABASE_URL).
// A missing TEST_DATABASE_URL fails the run instead of skipping it. The per-test fresh database harness is TSK-0004.
import pg from 'pg'
import { describe, expect, it } from 'vitest'

const url = process.env['TEST_DATABASE_URL']

describe('integration database (TSK-0002, HH-AUD-03)', () => {
  it('reaches PostgreSQL 16 through TEST_DATABASE_URL', async () => {
    expect(url, 'TEST_DATABASE_URL must be set for integration tests').toBeTruthy()
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      const res = await client.query<{ v: string }>("select current_setting('server_version_num') as v")
      expect(Math.floor(Number(res.rows[0]?.v) / 10000)).toBe(16)
    } finally {
      await client.end()
    }
  })
})
