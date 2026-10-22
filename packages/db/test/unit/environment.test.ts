// The process side of the staging identification (TSK-0141; HH-OPS-05, OWN-DEC-191): a local or ci reset needs a
// DATABASE_URL on this machine, and a staging reset the staging database named in render.yaml. Hosts are synthetic.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isLocalDatabaseUrl, STAGING_DATABASE_NAME } from '../../src/environment.js'

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

  it('[HH-OPS-05] the staging database name is the one render.yaml and migration 0069 name', () => {
    const blueprint = readFileSync(new URL('../../../../render.yaml', import.meta.url), 'utf8')
    expect(blueprint).toMatch(new RegExp(`databaseName: ${STAGING_DATABASE_NAME}\\s`))
    const migration = readFileSync(new URL('../../migrations/0069_staging_reset.sql', import.meta.url), 'utf8')
    expect(migration).toContain(`current_database() = '${STAGING_DATABASE_NAME}'`)
  })
})
