import { describe, expect, it } from 'vitest'
import {
  AutomationDeclarationError,
  createAutomationRegistry,
  retryDelayMs,
  type Automation,
} from '../../src/platform/automation.js'

const declared = (over: Partial<Automation> = {}): Automation => ({
  name: 'test_receipt.send',
  trigger: { kind: 'event', eventTypes: ['request.submitted'] },
  identity: 'system.test_receipt',
  inputs: { description: 'request id', version: 1 },
  idempotency: 'one per request: job key',
  effect: 'writes one synthetic effect row',
  retry: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 8000 },
  timeoutMs: 5000,
  exceptionOwner: 'owner',
  audit: { action: 'test_receipt.sent' },
  handle: async () => undefined,
  ...over,
})

describe('automation declarations (TSK-0012, HH-AUTO-01)', () => {
  it('accepts a complete declaration and routes events to it', () => {
    const r = createAutomationRegistry([declared()])
    expect(r.forEvent('request.submitted').map((a) => a.name)).toEqual(['test_receipt.send'])
    expect(r.forEvent('estimate.published')).toEqual([])
  })

  it('refuses a consumer without trigger, identity, inputs, idempotency, retry, timeout, exception owner or audit', () => {
    const missing: [string, Partial<Automation>][] = [
      ['trigger', { trigger: { kind: 'event', eventTypes: [] } }],
      ['identity', { identity: ' ' }],
      ['inputs', { inputs: { description: 'x', version: 0 } }],
      ['idempotency', { idempotency: '' }],
      ['effect', { effect: '' }],
      ['retry', { retry: { maxAttempts: 0, baseDelayMs: 1, maxDelayMs: 1 } }],
      ['retry', { retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 5 } }],
      ['timeoutMs', { timeoutMs: 0 }],
      ['exceptionOwner', { exceptionOwner: 'nobody' as never }],
      ['audit', { audit: { action: 'Sent' } }],
    ]
    for (const [part, over] of missing) {
      expect(() => createAutomationRegistry([declared(over)]), part).toThrow(AutomationDeclarationError)
      expect(() => createAutomationRegistry([declared(over)]), part).toThrow(new RegExp(part))
    }
    const noAudit: Partial<Automation> = declared()
    delete noAudit.audit
    expect(() => createAutomationRegistry([noAudit as Automation])).toThrow(/audit/)
  })

  it('refuses two automations with the same name', () => {
    expect(() => createAutomationRegistry([declared(), declared()])).toThrow(/declared twice/)
  })

  it('backs off exponentially and stays within the declared bound (HH-ARC-09)', () => {
    const retry = { maxAttempts: 6, baseDelayMs: 1000, maxDelayMs: 8000 }
    expect([1, 2, 3, 4, 5, 6].map((n) => retryDelayMs(retry, n))).toEqual([1000, 2000, 4000, 8000, 8000, 8000])
  })
})
