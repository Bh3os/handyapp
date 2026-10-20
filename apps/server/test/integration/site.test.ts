// The public site facts read against PostgreSQL 16 (TSK-0020; HH-CUS-05, HH-CUS-07, FACT-PUBLIC-CONTACT,
// FACT-PAYMENT-METHODS, FACT-NO-SURCHARGE). Contact values used here are synthetic (RULE-SYNTHETIC-DATA).
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { testConfig } from '../fixtures/env.js'

let t: TestDatabase
let app: FastifyInstance
beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig(), api: { db: t.db } })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const read = () => app.inject({ method: 'GET', url: '/api/v1/public/site' })

describe('public site facts come from configuration (TSK-0020)', () => {
  it('[HH-CUS-07][HH-CUS-05] a guest reads the brand, the decided payment methods and the unset contact', async () => {
    const res = await read()
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.json()).toEqual({
      brand: 'HandyHub',
      // FACT-PUBLIC-CONTACT (OWN-DEC-131): not provided, so no value is sent and the site shows a labelled placeholder.
      contact: { configured: false, phone: null, email: null },
      paymentMethods: ['square_payment_link', 'square_tap_to_pay', 'cash', 'check', 'zelle', 'cash_app', 'chime'],
    })
  })

  it('[HH-CUS-07] never sends a surcharge field or the placeholder payment destinations', async () => {
    const text = (await read()).body
    expect(text).not.toMatch(/surcharge|convenience|fee/i)
    expect(text).not.toContain('[Payment email or phone]')
    expect(text).not.toContain('[$Cashtag]')
    expect(text).not.toContain('[Payee name]')
  })

  it('[HH-CUS-05] once the owner sets the public contact, the configured values are returned', async () => {
    await recordPolicyVersion(t.db, {
      key: 'business.public_contact',
      value: { phone: '(502) 555-0199', email: 'site-contact@example.test' },
      sourceIds: ['FACT-PUBLIC-CONTACT'],
      changedBy: 'staff-synthetic-owner',
      reason: 'Synthetic test change',
    })
    expect((await read()).json().contact).toEqual({
      configured: true,
      phone: '(502) 555-0199',
      email: 'site-contact@example.test',
    })
  })
})

describe('truthful outage state (TSK-0020)', () => {
  it('[HH-CUS-05] answers a retryable UNAVAILABLE, never invented facts, when the database is not there', async () => {
    const down = await buildApp({ config: testConfig() })
    const res = await down.inject({ method: 'GET', url: '/api/v1/public/site' })
    await down.close()
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toMatchObject({ code: 'UNAVAILABLE', retryable: true })
  })
})
