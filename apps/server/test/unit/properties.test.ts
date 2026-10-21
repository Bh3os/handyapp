// Property records and access-code sealing (TSK-0045; HH-CRM-02, HH-CRM-03, HH-SEC-04, T28). The key and the codes
// are synthetic and built at runtime (RULE-SYNTHETIC-DATA).
import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import { ACCESS_SECRET_KINDS, DETAIL_SOURCES, PROPERTY_DETAILS } from '@handyhub/domain'
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { decide, type StaffActor } from '@handyhub/policy'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config.js'
import { MODULES } from '../../src/modules/index.js'
import { openAccessCode, sealAccessCode } from '../../src/modules/properties/index.js'
import { Secret } from '../../src/providers/types.js'

const KEY = new Secret(['synthetic', 'access', 'code', 'unit', 'key', 'for', 'tests'].join('-'))
const OTHER_KEY = new Secret(['another', 'synthetic', 'access', 'code', 'unit', 'key'].join('-'))
const VALUE = ['SYNX', '4711', 'QV'].join('-')

describe('access-code sealing (TSK-0045, HH-CRM-03)', () => {
  it('[HH-CRM-03] a sealed code opens only with the same key and the same row', () => {
    const id = randomUUID()
    const sealed = sealAccessCode(KEY, id, VALUE)
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(sealed).not.toContain(VALUE)
    expect(openAccessCode(KEY, id, sealed)).toBe(VALUE)
    // A fresh IV every time: the same code never seals the same way twice.
    expect(sealAccessCode(KEY, id, VALUE)).not.toBe(sealed)
    expect(() => openAccessCode(KEY, randomUUID(), sealed)).toThrow()
    expect(() => openAccessCode(OTHER_KEY, id, sealed)).toThrow()
    const [v, iv, tag, data] = sealed.split('.') as [string, string, string, string]
    const flipped = `${data.startsWith('A') ? 'B' : 'A'}${data.slice(1)}`
    expect(() => openAccessCode(KEY, id, [v, iv, tag, flipped].join('.'))).toThrow()
    expect(() => openAccessCode(KEY, id, 'v2.a.b.c')).toThrow(/format/)
  })

  it('[HH-CRM-03][HH-SEC-04] ACCESS_CODE_ENCRYPTION_KEY: optional, at least 32 characters, never the MFA key, never printed', () => {
    const raw = ['synthetic', 'access', 'code', 'config', 'key', 'value', 'x'].join('-')
    expect(loadConfig({ HANDYHUB_ENV: 'ci' }).accessCodeKey).toBeNull()
    expect(() => loadConfig({ HANDYHUB_ENV: 'ci', ACCESS_CODE_ENCRYPTION_KEY: 'short' })).toThrow(
      'ACCESS_CODE_ENCRYPTION_KEY must be at least 32 characters',
    )
    expect(() => loadConfig({ HANDYHUB_ENV: 'ci', ACCESS_CODE_ENCRYPTION_KEY: raw, MFA_ENCRYPTION_KEY: raw })).toThrow(
      'ACCESS_CODE_ENCRYPTION_KEY must differ from MFA_ENCRYPTION_KEY',
    )
    const config = loadConfig({ HANDYHUB_ENV: 'ci', ACCESS_CODE_ENCRYPTION_KEY: raw })
    expect(config.accessCodeKey?.reveal()).toBe(raw)
    expect(JSON.stringify(config)).not.toContain(raw)
    expect(inspect(config)).not.toContain(raw)
  })
})

describe('property record contract (TSK-0045, HH-CRM-02, HH-CRM-03)', () => {
  it('[HH-CRM-02] the staff labels cover exactly the domain codes', () => {
    expect([...LABEL_FAMILIES.propertyDetail]).toEqual([...PROPERTY_DETAILS])
    expect([...LABEL_FAMILIES.detailSource]).toEqual([...DETAIL_SOURCES])
    expect([...LABEL_FAMILIES.accessSecretKind]).toEqual([...ACCESS_SECRET_KINDS])
  })

  it('[HH-CRM-03][T28] only the reveal response has a field for a code; code writes and the reveal take no idempotency key', () => {
    const routes = MODULES.find((m) => m.name === 'properties')?.routes ?? []
    expect(routes.map((r) => r.operationId)).toEqual([
      'getStaffProperty',
      'editPropertyAddress',
      'editPropertyType',
      'editPropertyDetail',
      'confirmPropertyDetail',
      'addAccessCode',
      'replaceAccessCode',
      'confirmAccessCode',
      'removeAccessCode',
      'revealAccessCode',
    ])
    for (const r of routes) {
      const responses = JSON.stringify(r.schema.response)
      if (r.operationId === 'revealAccessCode') expect(responses).toContain('"value"')
      else expect(responses).not.toMatch(/"(value|sealed\w*)":\{"type":"string"\}/)
      if (
        /AccessCode$/.test(r.operationId) &&
        r.operationId !== 'confirmAccessCode' &&
        r.operationId !== 'removeAccessCode'
      )
        expect(r.idempotency, r.operationId).toBe('none')
      expect(r.actors).toEqual(['staff'])
      // Staff routes only: the customer surface never serves property records or codes.
      expect(r.path.startsWith('/staff/')).toBe(true)
    }
    const revealRoute = routes.find((r) => r.operationId === 'revealAccessCode')
    expect(revealRoute).toMatchObject({
      permission: 'access_code.reveal',
      businessDate: true,
      audit: 'access_code.reveal',
    })
    expect(revealRoute?.rateLimit).toMatchObject({ limit: 30, windowSeconds: 3600 })
  })

  it('[T28][RULE-SERVER-AUTHZ] the reveal rule: assigned, on the visit date, online; Owner and Office audited', () => {
    const worker: StaffActor = {
      kind: 'staff',
      userId: 'w-1',
      roles: ['worker'],
      capabilities: [],
      status: 'active',
      freshAuth: false,
    }
    const now = new Date('2026-10-21T15:00:00Z')
    const visit = {
      assignments: [
        { staffUserId: 'w-1', from: new Date('2026-10-21T00:00:00Z'), to: new Date('2026-10-22T04:00:00Z') },
      ],
      visitDate: '2026-10-21',
    }
    const ctx = { now, online: true, today: '2026-10-21' }
    expect(decide(worker, 'access_code.reveal', visit, ctx)).toMatchObject({ effect: 'allow', audit: true })
    // What the server sends today: no assignment recorded.
    expect(decide(worker, 'access_code.reveal', { assignments: [] }, ctx)).toMatchObject({ reason: 'NOT_ASSIGNED' })
    expect(decide(worker, 'access_code.reveal', visit, { ...ctx, today: '2026-10-22' })).toMatchObject({
      reason: 'NOT_VISIT_DATE',
    })
    expect(decide(worker, 'access_code.reveal', visit, { ...ctx, online: false })).toMatchObject({ reason: 'OFFLINE' })
    // The business time zone NOT CONFIGURED: no date, refused, never allowed.
    expect(decide(worker, 'access_code.reveal', visit, { now, online: true })).toMatchObject({ effect: 'deny' })
    const owner: StaffActor = { ...worker, userId: 'o-1', roles: ['owner'] }
    expect(decide(owner, 'access_code.reveal', {}, { now })).toMatchObject({ effect: 'allow', audit: true })
  })
})
