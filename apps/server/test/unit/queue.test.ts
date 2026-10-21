// The action queue's item-type registry (TSK-0041; HH-OPS-01, HH-OPS-02, HH-STAFF-06, ROLE-MATRIX, HH-LANG-03).
import { REQUEST_STATES } from '@handyhub/domain'
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { ACTIONS, listingScope, NAV_IDS, type StaffActor } from '@handyhub/policy'
import { describe, expect, it } from 'vitest'
import { visibleSections, visibleTypes } from '../../src/modules/queue/items.js'
import { bandRank, deepLink, QUEUE_ACTIONS, QUEUE_ITEM_TYPES, queueItemType } from '../../src/modules/queue/registry.js'

const staff = (...roles: StaffActor['roles']): StaffActor => ({
  kind: 'staff',
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  roles,
  capabilities: [],
  status: 'active',
  freshAuth: false,
})

describe('queue item types (TSK-0041, HH-OPS-01)', () => {
  it('[HH-OPS-01][HH-LANG-03] every type, reason and action has its staff label family, and nothing more', () => {
    expect(QUEUE_ITEM_TYPES.map((t) => t.id)).toEqual([...LABEL_FAMILIES.queueItemType])
    const reasons = new Set(QUEUE_ITEM_TYPES.flatMap((t) => [...t.reasons]))
    expect([...reasons].sort()).toEqual([...LABEL_FAMILIES.queueReason].sort())
    expect([...QUEUE_ACTIONS]).toEqual([...LABEL_FAMILIES.queueAction])
    expect([...LABEL_FAMILIES.requestState]).toEqual([...REQUEST_STATES])
  })

  it('[HH-OPS-01] each type names a matrix action, a staff screen and only its own restricted reasons', () => {
    for (const type of QUEUE_ITEM_TYPES) {
      expect(ACTIONS).toContain(type.view)
      expect(NAV_IDS).toContain(type.screen)
      const restricted = 'restricted' in type ? type.restricted : undefined
      if (restricted) {
        expect(ACTIONS).toContain(restricted.action)
        expect(type.reasons).toContain(restricted.generic)
        for (const r of restricted.reasons) expect(type.reasons).toContain(r)
      }
    }
    const newRequest = queueItemType('new_request')
    if (!newRequest) throw new Error('new_request is declared')
    expect(deepLink(newRequest, 'abc')).toBe('/requests/abc')
  })

  it('[HH-STAFF-06][HH-OPS-01] Owner Decisions are owner-only in the matrix; workers have no queue at all', () => {
    for (const type of QUEUE_ITEM_TYPES.filter((t) => t.section === 'owner_decisions')) {
      expect(listingScope(['owner'], [], type.view)).toBe('all')
      for (const role of ['office', 'estimator', 'worker'])
        expect(listingScope([role], ['collect'], type.view)).not.toBe('all')
    }
    expect(visibleSections(staff('owner'))).toEqual(['queue', 'owner_decisions'])
    expect(visibleSections(staff('office'))).toEqual(['queue'])
    expect(visibleSections(staff('estimator'))).toEqual(['queue'])
    expect(visibleSections(staff('worker'))).toEqual([])
    // Estimators also see pending estimates (estimate_to_write, TSK-0053).
    expect(visibleTypes(staff('estimator'), 'queue')).toEqual({
      // TSK-0044: duplicate suggestions, by the Estimator's PROPOSED customer.view_duplicates cell.
      all: ['new_request', 'review_hold', 'safety_hold', 'estimate_to_write', 'candidate_match'],
      // TSK-0049: customer replies on the Estimator's own threads; never the private Needs Linking list.
      own: ['delivery_failed', 'customer_replied'],
    })
    // Roles add up: a worker who is also office sees what office sees.
    expect(visibleTypes(staff('worker', 'office'), 'queue')).toEqual(visibleTypes(staff('office'), 'queue'))
  })

  it('[HH-OPS-01] an item past its due time ranks as time-sensitive at the least', () => {
    const now = new Date('2026-10-20T12:00:00Z')
    const past = new Date('2026-10-20T11:00:00Z')
    expect(bandRank('safety', past, now)).toBe(1)
    expect(bandRank('today_change', null, now)).toBe(2)
    expect(bandRank('other', past, now)).toBe(3)
    expect(bandRank('other', new Date('2026-10-20T13:00:00Z'), now)).toBe(4)
  })
})
