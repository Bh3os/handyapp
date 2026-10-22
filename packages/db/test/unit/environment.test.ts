// The process side of the staging identification (TSK-0141; HH-OPS-05, OWN-DEC-191): a local or ci reset needs a
// DATABASE_URL on this machine, and a staging reset the staging database named in render.yaml. Hosts are synthetic.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isLocalDatabaseUrl, isStagingDatabaseName, STAGING_DATABASE_PATTERN } from '../../src/environment.js'

describe('staging identification inputs (TSK-0141)', () => {
  it('[HH-OPS-05] loopback hosts and local sockets are local; anything else is not', () => {
    for (const url of [
      'postgres://u:p@127.0.0.1:5432/db',
      'postgres://u@127.0.0.2/db',
      'postgres://u@localhost/db',
      'postgresql://u@[::1]:5432/db',
      'postgres:///db',
      'postgres:///db?host=/var/run/postgresql',
    ])
      expect(isLocalDatabaseUrl(url), url).toBe(true)
    for (const url of [
      undefined,
      '',
      'not a url',
      'postgres://u@db.example.test/db',
      'postgres://u@10.0.0.5/db',
      'postgres://u@127.0.0.1.example.test/db',
      'postgres://u@localhost/db?host=db.example.test',
    ])
      expect(isLocalDatabaseUrl(url), String(url)).toBe(false)
  })

  it("[HH-OPS-05] the staging database name: the base name or Render's 4-character recreate suffix, nothing else", () => {
    for (const name of ['handyhub_staging_db', 'handyhub_staging_db_vdqz', 'handyhub_staging_db_a1b2'])
      expect(isStagingDatabaseName(name), name).toBe(true)
    for (const name of [
      'handyhub_production_db',
      'handyhub_staging_db_',
      'handyhub_staging_db_VDQZ',
      'handyhub_staging_db_vdqz1',
      'handyhub_staging_db2',
      'x_handyhub_staging_db',
      'postgres',
    ])
      expect(isStagingDatabaseName(name), name).toBe(false)
    // render.yaml names a matching database, and migration 0069 applies the same pattern in the database.
    const blueprint = readFileSync(new URL('../../../../render.yaml', import.meta.url), 'utf8')
    const named = /databaseName: (\S+)/.exec(blueprint)?.[1] ?? ''
    expect(isStagingDatabaseName(named), named).toBe(true)
    const migration = readFileSync(new URL('../../migrations/0069_staging_reset.sql', import.meta.url), 'utf8')
    expect(migration).toContain(`current_database() ~ '${STAGING_DATABASE_PATTERN.source}'`)
  })
})
