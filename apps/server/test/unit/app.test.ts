import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { testConfig } from '../fixtures/env.js'

const siteDir = mkdtempSync(join(tmpdir(), 'site-'))
writeFileSync(join(siteDir, 'index.html'), '<!doctype html><title>t</title><h1>Synthetic page</h1>')
afterAll(() => rmSync(siteDir, { recursive: true, force: true }))

describe('server skeleton (TSK-0001, HH-AUD-01)', () => {
  it('serves the built public site from the given directory', async () => {
    const app = await buildApp({ config: { ...testConfig(), siteDir } })
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.body).toContain('Synthetic page')
    await app.close()
  })

  it('answers 404 for an unknown path', async () => {
    const app = await buildApp({ config: { ...testConfig(), siteDir } })
    const res = await app.inject({ method: 'GET', url: '/no-such-page' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})

describe('former Spanish public URLs (TSK-0102, HH-LANG-01, OWN-DEC-45)', () => {
  it('[HH-LANG-01][RULE-LANGUAGES] /es and /es/... answer 301 with the English page, never another host', async () => {
    const app = await buildApp({ config: { ...testConfig(), siteDir } })
    const cases: [string, string][] = [
      ['/es', '/'],
      ['/es/', '/'],
      ['/es/services/drywall-patching', '/services/drywall-patching'],
      ['/es/request?zip=40000', '/request?zip=40000'],
      ['/es//elsewhere.example', '/elsewhere.example'],
    ]
    for (const [from, to] of cases) {
      const res = await app.inject({ method: 'GET', url: from })
      expect(res.statusCode, from).toBe(301)
      expect(res.headers['location'], from).toBe(to)
    }
    // A path that only starts with the letters is not a Spanish URL.
    expect((await app.inject({ method: 'GET', url: '/estimates-guide' })).statusCode).toBe(404)
    await app.close()
  })
})
