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
      // A property record (TSK-0123) sits below the customer records: the same menu entry (apps/staff App.tsx).
      expect(NAV_IDS).toContain(type.screen === 'properties' ? 'customers' : type.screen)
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
    // Estimators also see pending estimates (estimate_to_write, TSK-0053), the customer's responses to published
    // estimates (estimate_response, TSK-0056), answers to offered windows that need new ones (window_offer_response,
    // TSK-0063: they offer estimate-visit windows) and estimate reminder drafts to send (estimate_reminder, TSK-0060).
    expect(visibleTypes(staff('estimator'), 'queue')).toEqual({
      // TSK-0044: duplicate suggestions, by the Estimator's PROPOSED customer.view_duplicates cell.
      // TSK-0051: replies to questions, by the Estimator's request.view cell.
      all: [
        'new_request',
        'review_hold',
        'safety_hold',
        'estimate_to_write',
        'estimate_response',
        'window_offer_response',
        'estimate_reminder',
        'candidate_match',
        'question_replied',
        // TSK-0125: a published estimate whose requested discount failed verification needs revising (estimate.revise).
        'discount_revision',
      ],
      // TSK-0049: customer replies on the Estimator's own threads; never the private Needs Linking list.
      // TSK-0051: question reminders to release on the Estimator's own requests (message.release_draft, own threads).
      own: ['delivery_failed', 'customer_replied', 'question_reminder'],
    })
    // Roles add up: a worker who is also office sees what office sees.
    expect(visibleTypes(staff('worker', 'office'), 'queue')).toEqual(visibleTypes(staff('office'), 'queue'))
  })

  it('[HH-COM-11][HH-OPS-01] appointment reminders to send are seen by the roles that manage booked visits (TSK-0067)', () => {
    for (const role of ['owner', 'office'] as const)
      expect(visibleTypes(staff(role), 'queue').all).toContain('appointment_reminder')
    const estimator = visibleTypes(staff('estimator'), 'queue')
    expect([...estimator.all, ...estimator.own]).not.toContain('appointment_reminder')
    const type = queueItemType('appointment_reminder')
    if (!type) throw new Error('appointment_reminder is declared')
    expect([type.subject, type.action, deepLink(type, 'v1')]).toEqual(['visit', 'release_reminder', '/schedule/v1'])
  })

  it("[HH-EST-16][HH-OPS-01] estimates waiting for the Owner's approval are Owner Decisions, the Owner's alone (TSK-0130)", () => {
    expect(visibleTypes(staff('owner'), 'owner_decisions').all).toContain('estimate_publication_approval')
    for (const role of ['office', 'estimator', 'worker'] as const) {
      const v = visibleTypes(staff(role), 'owner_decisions')
      expect([...v.all, ...v.own]).not.toContain('estimate_publication_approval')
    }
    const type = queueItemType('estimate_publication_approval')
    if (!type) throw new Error('estimate_publication_approval is declared')
    expect([type.section, type.subject, type.action, deepLink(type, 'v1')]).toEqual([
      'owner_decisions',
      'estimate_version',
      'decide',
      '/estimates/v1',
    ])
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
