// Staff navigation from the permission matrix (TSK-0040; S00 step 4, S01, HH-STAFF-06, HH-STAFF-04, RULE-SERVER-AUTHZ).
import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, navigationFor, rowFor, STAFF_ROLES } from '../src/index.js'

describe('staff navigation by role (TSK-0040, HH-STAFF-06)', () => {
  it('[HH-STAFF-06] each role gets its own menu and home: the queue for office roles and the Owner, My Day for workers', () => {
    expect(navigationFor(['owner'])).toEqual({
      home: 'queue',
      items: [
        'queue',
        'my-day',
        'requests',
        'customers',
        'estimates',
        'schedule',
        'inbox',
        'payments',
        'cases',
        'staff',
        'audit',
        'dashboard',
        'settings',
      ],
      search: ['requests', 'customers'],
    })
    expect(navigationFor(['office'])).toEqual({
      home: 'queue',
      items: ['queue', 'my-day', 'requests', 'customers', 'schedule', 'inbox', 'payments', 'cases', 'audit'],
      search: ['requests', 'customers'],
    })
    expect(navigationFor(['estimator'])).toEqual({
      home: 'queue',
      items: ['queue', 'requests', 'customers', 'estimates', 'schedule', 'inbox'],
      search: ['requests', 'customers'],
    })
    // Worker grants are record-scoped (assigned jobs): they open from My Day, never from the menu or search.
    expect(navigationFor(['worker'])).toEqual({ home: 'my-day', items: ['my-day'], search: [] })
  })

  it('[HH-STAFF-04] deny by default: no role, an unknown role or a customer column grants nothing', () => {
    const empty = { home: null, items: [], search: [] }
    expect(navigationFor([])).toEqual(empty)
    expect(navigationFor(['admin', 'customer', 'guest', 'ai'])).toEqual(empty)
  })

  it('[HH-STAFF-03] several role grants combine; every item is opened by a top-level matrix grant', () => {
    const both = navigationFor(['estimator', 'worker'])
    expect(both.home).toBe('queue')
    expect(both.items).toEqual(['queue', 'my-day', 'requests', 'customers', 'estimates', 'schedule', 'inbox'])
    for (const role of STAFF_ROLES)
      for (const id of navigationFor([role]).items) {
        const item = NAV_ITEMS.find((i) => i.id === id)
        expect(
          item?.gate.some((a) => ['any', 'own_staff'].includes(rowFor(a)?.cells[role].rules[a]?.scope ?? 'none')),
        ).toBe(true)
      }
  })
})
