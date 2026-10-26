// What staff may see listed, from the permission matrix (TSK-0041; HH-OPS-01, HH-OPS-02, HH-STAFF-04).
import { describe, expect, it } from 'vitest'
import { heldScopes, listingScope } from '../src/index.js'

describe('listing scopes (TSK-0041, HH-OPS-01)', () => {
  it('[HH-OPS-02][HH-STAFF-04] a role lists all records, only its own, or none, exactly as its matrix grant reads', () => {
    expect(listingScope(['owner'], [], 'request.view')).toBe('all')
    expect(listingScope(['worker'], [], 'request.view')).toBe('none')
    expect(listingScope(['estimator'], [], 'message.reply')).toBe('own')
    // Assignment-scoped grants are reached from the record, never listed.
    expect(heldScopes(['worker'], [], 'message.propose_reply')).toEqual(['assigned'])
    expect(listingScope(['worker'], [], 'message.propose_reply')).toBe('none')
    // TSK-0155: a worker's own proposals are listed as their own.
    expect(listingScope(['worker'], [], 'message.follow_own_proposal')).toBe('own')
    // A capability-bound grant needs the capability.
    expect(heldScopes(['worker'], [], 'payment.view')).toEqual([])
    expect(heldScopes(['worker'], ['collect'], 'payment.view')).toEqual(['assigned'])
    // Listing ignores fresh sign-in and the written reason, which the act itself still needs.
    expect(listingScope(['owner'], [], 'deposit.waive')).toBe('all')
    expect(listingScope(['office'], [], 'deposit.waive')).toBe('none')
  })

  it('[HH-STAFF-04] deny by default: unknown actions, unknown roles and protected rows list nothing', () => {
    expect(heldScopes(['owner'], [], 'export.everything')).toEqual([])
    expect(heldScopes(['admin'], [], 'request.view')).toEqual([])
    expect(heldScopes(['owner'], [], 'hold.override_critical')).toEqual([])
    expect(heldScopes(['owner'], [], 'audit.delete')).toEqual([])
  })
})
