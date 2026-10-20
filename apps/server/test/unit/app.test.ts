import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'

const siteDir = mkdtempSync(join(tmpdir(), 'site-'))
writeFileSync(join(siteDir, 'index.html'), '<!doctype html><title>t</title><h1>Synthetic page</h1>')
afterAll(() => rmSync(siteDir, { recursive: true, force: true }))

describe('server skeleton (TSK-0001, HH-AUD-01)', () => {
  it('serves the built public site from the given directory', async () => {
    const app = await buildApp({ siteDir })
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.body).toContain('Synthetic page')
    await app.close()
  })

  it('answers 404 for an unknown path', async () => {
    const app = await buildApp({ siteDir })
    const res = await app.inject({ method: 'GET', url: '/no-such-page' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
