// Loadouts, critical shortages and their resolution (TSK-0071; HH-PKT-05, HH-PKT-06, HH-WORK-01, HH-WORK-02, T45).
import { describe, expect, it } from 'vitest'
import {
  isAvailable,
  loadoutReadiness,
  packetChanges,
  raisesTaskBlock,
  taskBlockResolutionProblems,
  type LoadoutContent,
  type LoadoutStatus,
  type PacketContent,
} from '../src/index.js'

const content: LoadoutContent = {
  groups: [
    {
      heading: 'Synthetic tools',
      line: 1,
      notes: [],
      items: [
        {
          key: '1',
          name: 'Synthetic drill',
          lines: ['- [ ] **Synthetic drill:** for tests.'],
          line: 2,
          criticality: 'required',
          category: 'not_classified',
        },
        {
          key: '2',
          name: 'Synthetic gloves',
          lines: ['- [ ] **Synthetic gloves:** for tests.'],
          line: 3,
          criticality: 'required',
          category: 'not_classified',
        },
        {
          key: '3',
          name: 'Synthetic extra',
          lines: ['- [ ] **Synthetic extra:** for tests.'],
          line: 4,
          criticality: 'nice_to_have',
          category: 'not_classified',
        },
      ],
    },
  ],
  proposed: null,
}
const latest = (entries: [string, LoadoutStatus][]) => new Map(entries)

describe('loadout readiness (HH-PKT-05, HH-WORK-01)', () => {
  it('[HH-PKT-05] no pinned list is NOT CONFIGURED, never ready', () => {
    expect(loadoutReadiness({ content: null, latest: latest([]), blockingHolds: [] }).state).toBe('not_configured')
  })

  it('[HH-PKT-05] ready only when every required item is loaded or has an approved substitute', () => {
    expect(loadoutReadiness({ content, latest: latest([]), blockingHolds: [] })).toEqual({
      state: 'not_confirmed',
      unconfirmed: ['1', '2'],
      reported: [],
      blocks: [],
    })
    const r = loadoutReadiness({
      content,
      latest: latest([
        ['1', 'loaded'],
        ['2', 'substitute_approved'],
        ['3', 'missing'],
      ]),
      blockingHolds: [],
    })
    // A missing nice-to-have item is reported and blocks nothing.
    expect(r).toEqual({ state: 'ready', unconfirmed: [], reported: ['3'], blocks: [] })
  })

  it('[HH-PKT-06][T45] a blocking task block keeps the package blocked, whatever was stated since', () => {
    const r = loadoutReadiness({
      content,
      latest: latest([
        ['1', 'loaded'],
        ['2', 'loaded'],
      ]),
      blockingHolds: ['h1'],
    })
    expect(r.state).toBe('blocked')
    expect(r.blocks).toEqual(['h1'])
  })

  it('[HH-PKT-06] only a missing or damaged required item raises a task block', () => {
    expect(raisesTaskBlock('required', 'missing')).toBe(true)
    expect(raisesTaskBlock('required', 'damaged')).toBe(true)
    expect(raisesTaskBlock('required', 'loaded')).toBe(false)
    expect(raisesTaskBlock('nice_to_have', 'missing')).toBe(false)
    expect(isAvailable('loaded')).toBe(true)
    expect(isAvailable('damaged')).toBe(false)
    expect(isAvailable(null)).toBe(false)
  })
})

describe('resolving a task block (HH-PKT-06, HH-WORK-02, HH-CHG-02)', () => {
  it('[HH-WORK-02] item provided needs a "loaded" statement after the block', () => {
    expect(taskBlockResolutionProblems({ resolution: 'item_provided', loadedAfterBlock: false })).toEqual([
      'ITEM_NOT_CONFIRMED_LOADED',
    ])
    expect(taskBlockResolutionProblems({ resolution: 'item_provided', loadedAfterBlock: true })).toEqual([])
  })

  it('[HH-PKT-06] a substitute is named with what it affects; one affecting the customer is a change order', () => {
    expect(taskBlockResolutionProblems({ resolution: 'substitute_approved', loadedAfterBlock: false })).toEqual([
      'SUBSTITUTE_REQUIRED',
      'IMPACTS_REQUIRED',
    ])
    expect(
      taskBlockResolutionProblems({
        resolution: 'substitute_approved',
        loadedAfterBlock: false,
        substitute: 'Synthetic other drill',
        impacts: ['specification'],
        customerAffected: true,
      }),
    ).toEqual(['CHANGE_ORDER_REQUIRED'])
    expect(
      taskBlockResolutionProblems({
        resolution: 'substitute_approved',
        loadedAfterBlock: false,
        substitute: 'Synthetic other drill',
        impacts: ['equivalent'],
        customerAffected: false,
      }),
    ).toEqual(['IMPACTS_REQUIRED'])
    expect(
      taskBlockResolutionProblems({
        resolution: 'substitute_approved',
        loadedAfterBlock: false,
        substitute: 'Synthetic other drill',
        impacts: [],
        customerAffected: false,
      }),
    ).toEqual([])
  })
})

describe('the loadout in the packet (T43, HH-PKT-02)', () => {
  const base = (loadout?: PacketContent['resources']['loadout']): PacketContent =>
    ({
      identity: { projectId: 'p', projectReference: 'R', jobId: 'j', jobState: 's', services: [] },
      schedule: { visits: [] },
      assignment: { visits: [] },
      site_access: {
        propertyId: 'x',
        addressVersion: 1,
        propertyType: 'house',
        timeZone: 'America/Kentucky/Louisville',
        details: [],
        accessCodes: [],
      },
      occupants: { details: [] },
      scope: {
        snapshotId: null,
        version: 1,
        source: 'approval',
        createdAt: null,
        lines: [],
        texts: {},
        selectedOptions: [],
        history: [],
      },
      evidence: { photos: [] },
      sop: { packages: [] },
      holds: { holds: [] },
      resources: { visits: [], ...(loadout ? { loadout } : {}) },
      dependencies: { approvalId: 'a', approvedAt: '2026-10-21T00:00:00.000Z', deposit: null },
    }) as PacketContent
  const pinned = (sha: string) => [
    {
      workPackageId: 'w',
      serviceCode: 'DW-01',
      state: 'pinned' as const,
      loadoutVersionId: 'v',
      version: 1,
      contentSha256: sha,
      items: [],
    },
  ]

  it('[HH-PKT-02] PROPOSED: a new or changed list is a new version that is not critical; the same list is no change', () => {
    expect(packetChanges(base(pinned('a')), base(pinned('a')))).toEqual([])
    expect(packetChanges(base(pinned('a')), base(pinned('b')))).toEqual([
      { section: 'resources', code: 'loadout_changed', critical: false, ref: 'DW-01', from: 1, to: 1 },
    ])
    // A version written before loadouts existed has none.
    expect(packetChanges(base(), base(pinned('a')))[0]).toMatchObject({ code: 'loadout_changed', critical: false })
  })
})
