// Two origins: host sides, configuration, security headers and safe file lookup (TSK-0017; OWN-DEC-133, HH-ARC-06,
// HH-SEC-02). Origins and pages are synthetic.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { afterAll, describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, type Config } from '../../src/config.js'
import {
  contentSecurityPolicy,
  fileIn,
  hostSide,
  HSTS,
  inlineHashes,
  isPrivatePath,
  securityHeaders,
  surfaceAllowed,
  surfaceOf,
} from '../../src/hosts.js'
import { testConfig } from '../fixtures/env.js'

const dir = mkdtempSync(join(tmpdir(), 'hosts-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const SPLIT = { PUBLIC_ORIGIN: 'https://www.example.test', STAFF_ORIGIN: 'https://staff.example.test' }

describe('origins from the environment (TSK-0017, OWN-DEC-133)', () => {
  it('[OWN-DEC-133] both unset: one host serves every surface (local, ci, the single Render URL)', () => {
    expect(testConfig().hosts).toEqual({ mode: 'single' })
  })

  it('[OWN-DEC-133] both set: split hosts, and staff email links default to the staff origin', () => {
    const config = testConfig(SPLIT)
    expect(config.hosts).toEqual({
      mode: 'split',
      publicOrigin: 'https://www.example.test',
      staffOrigin: 'https://staff.example.test',
      publicHost: 'www.example.test',
      staffHost: 'staff.example.test',
    })
    expect(config.staffAppUrl).toBe('https://staff.example.test')
    expect(testConfig({ ...SPLIT, STAFF_APP_URL: 'https://links.example.test' }).staffAppUrl).toBe(
      'https://links.example.test',
    )
  })

  it('[OWN-DEC-133] one without the other, the same host twice, a path or plain http outside local/ci are refused', () => {
    expect(() => testConfig({ PUBLIC_ORIGIN: SPLIT.PUBLIC_ORIGIN })).toThrow(ConfigError)
    expect(() => testConfig({ STAFF_ORIGIN: SPLIT.STAFF_ORIGIN })).toThrow(ConfigError)
    expect(() => testConfig({ ...SPLIT, STAFF_ORIGIN: 'https://WWW.example.test' })).toThrow(/different hosts/)
    expect(() => testConfig({ ...SPLIT, STAFF_ORIGIN: 'https://staff.example.test/app' })).toThrow(ConfigError)
    expect(() => testConfig({ ...SPLIT, STAFF_ORIGIN: 'ftp://staff.example.test' })).toThrow(ConfigError)
    expect(() => testConfig({ ...SPLIT, STAFF_ORIGIN: 'not a url' })).toThrow(ConfigError)
    expect(
      testConfig({ PUBLIC_ORIGIN: 'http://public.localhost:4312', STAFF_ORIGIN: 'http://staff.localhost:4312' }).hosts,
    ).toMatchObject({ publicHost: 'public.localhost:4312', staffHost: 'staff.localhost:4312' })
    const staging = {
      HANDYHUB_ENV: 'staging',
      DATABASE_URL: 'postgres://synthetic@db.example.test/app',
      ACCESS_GATE_USERS: `owner:${['Synthetic', 'Gate', 'Fixture', '11!x'].join('-')}`,
    }
    expect(() => loadConfig({ ...staging, ...SPLIT, PUBLIC_ORIGIN: 'http://www.example.test' })).toThrow(/https/)
    expect(loadConfig({ ...staging, ...SPLIT }).hosts.mode).toBe('split')
  })
})

describe('host sides and API surfaces (TSK-0017, HH-ARC-06)', () => {
  const split = testConfig(SPLIT).hosts
  it('[HH-ARC-06] the Host header names the side; any other host is unknown', () => {
    expect(hostSide(split, 'www.example.test')).toBe('public')
    expect(hostSide(split, 'STAFF.example.test')).toBe('staff')
    expect(hostSide(split, 'evil.example.test')).toBe('unknown')
    expect(hostSide(split, undefined)).toBe('unknown')
    expect(hostSide({ mode: 'single' }, 'anything')).toBe('any')
  })

  it('[HH-ARC-06] each surface answers on its own side only', () => {
    expect(surfaceOf('/staff/auth/session')).toBe('staff')
    expect(surfaceOf('/customer/x?y=1')).toBe('customer')
    expect(surfaceOf('/public')).toBe('public')
    expect(surfaceOf('/staffing/x')).toBeNull()
    expect(surfaceOf('/auth/session')).toBeNull()
    expect(surfaceAllowed('staff', 'staff')).toBe(true)
    expect(surfaceAllowed('staff', 'public')).toBe(false)
    expect(surfaceAllowed('customer', 'staff')).toBe(false)
    expect(surfaceAllowed('public', 'public')).toBe(true)
    expect(surfaceAllowed('public', 'unknown')).toBe(false)
    expect(surfaceAllowed('staff', 'any')).toBe(true)
    expect(isPrivatePath('public', '/services/drywall')).toBe(false)
    for (const url of ['/portal/', '/api/v1/public/requests', '/access/x', '/project/x', '/account', '/staff/'])
      expect(isPrivatePath('public', url), url).toBe(true)
    expect(isPrivatePath('staff', '/')).toBe(true)
  })
})

describe('security headers (TSK-0017, HH-SEC-02)', () => {
  const headersFor = (config: Config, side: 'public' | 'staff' | 'any', url: string) => {
    const set: Record<string, string> = {}
    const reply = { header: (k: string, v: string) => ((set[k] = v), reply) } as unknown as FastifyReply
    securityHeaders(config, contentSecurityPolicy({ scripts: [], styles: [] }))(
      { hostSide: side, url } as FastifyRequest,
      reply,
    )
    return set
  }
  const production = { ...testConfig(), env: 'production', noindex: false } as Config
  const staging = { ...testConfig(), env: 'staging', noindex: true } as Config

  it('[HH-SEC-02] HSTS in staging and production only', () => {
    expect(headersFor(staging, 'public', '/')['strict-transport-security']).toBe(HSTS)
    expect(headersFor(production, 'staff', '/')['strict-transport-security']).toBe(HSTS)
    expect(headersFor(testConfig(), 'any', '/')['strict-transport-security']).toBeUndefined()
  })

  it('[HH-SEC-02] in production the staff host and the portal are noindex; the public site is indexable', () => {
    expect(headersFor(production, 'staff', '/')['x-robots-tag']).toBe('noindex, nofollow')
    expect(headersFor(production, 'public', '/portal/x')['x-robots-tag']).toBe('noindex, nofollow')
    expect(headersFor(production, 'public', '/services')['x-robots-tag']).toBeUndefined()
    expect(headersFor(production, 'public', '/services')['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headersFor(production, 'staff', '/sign-in')['referrer-policy']).toBe('no-referrer')
    expect(headersFor(staging, 'public', '/services')['x-robots-tag']).toBe('noindex, nofollow')
  })

  it('[HH-SEC-02] inline scripts and styles are allowed by hash only; external scripts are not hashed', () => {
    mkdirSync(join(dir, 'site', 'nested'), { recursive: true })
    writeFileSync(join(dir, 'site', 'a.html'), '<script>one()</script><script type="module" src="/x.js"></script>')
    writeFileSync(join(dir, 'site', 'nested', 'b.html'), '<style>p{color:red}</style><script>one()</script>')
    const hashes = inlineHashes(join(dir, 'site'))
    expect(hashes.scripts).toHaveLength(1)
    expect(hashes.styles).toHaveLength(1)
    const csp = contentSecurityPolicy(hashes)
    expect(csp).toContain(`script-src 'self' ${hashes.scripts[0]}`)
    expect(csp).toContain("object-src 'none'")
    expect(inlineHashes(join(dir, 'missing'))).toEqual({ scripts: [], styles: [] })
  })

  it('[HH-SEC-02] a URL path never names a file outside the root', () => {
    const root = join(dir, 'root')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'in.txt'), 'in')
    writeFileSync(join(dir, 'out.txt'), 'out')
    expect(fileIn(root, '/in.txt')).toBe(join(root, 'in.txt'))
    for (const p of ['/../out.txt', '/..%2fout.txt', '/%2e%2e/out.txt', '/x/../../out.txt', '/%E0%A4%A', '/'])
      expect(fileIn(root, p), p).toBeNull()
  })
})
