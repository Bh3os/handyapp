// What changed between two job packet versions, and which changes are critical (TSK-0069; HH-PKT-02, HH-DATA-08,
// ENT-JobPacket, RULE-SAFETY-GATES). Every name, address detail and note is synthetic.
import { describe, expect, it } from 'vitest'
import { changedSections, hasCriticalChange, PACKET_SECTIONS, packetChanges, type PacketContent } from '../src/index.js'

const BASE: PacketContent = {
  identity: {
    projectId: 'p1',
    projectReference: 'HH-SYNTH-1',
    jobId: 'j1',
    jobState: 'pending_preparation',
    services: [{ workPackageId: 'w1', serviceId: 'SVC-DW-01', serviceCode: 'DW-01', position: 1, state: 'planned' }],
  },
  schedule: {
    visits: [
      {
        visitId: 'v1',
        number: 1,
        purpose: 'service',
        state: 'confirmed',
        localDate: '2026-11-05',
        windowStart: '09:00',
        windowEnd: '10:00',
        timeZone: 'America/Kentucky/Louisville',
        windowVersion: 1,
      },
    ],
  },
  assignment: {
    visits: [{ visitId: 'v1', number: 1, team: [{ staffUserId: 's-ann', name: 'Synthetic Ann', role: 'lead' }] }],
  },
  site_access: {
    propertyId: 'pr1',
    addressVersion: 1,
    propertyType: 'house',
    timeZone: 'America/Kentucky/Louisville',
    details: [
      {
        detail: 'parking_loading',
        value: 'Synthetic: the drive',
        source: 'customer_call',
        confirmedAt: '2026-10-20T10:00:00.000Z',
      },
    ],
    accessCodes: [
      { id: 'c1', kind: 'lockbox', label: 'Synthetic box', confirmedAt: '2026-10-20T10:00:00.000Z', version: 1 },
    ],
  },
  occupants: {
    details: [
      {
        detail: 'occupants_pets',
        value: 'Synthetic: one cat',
        source: 'request_form',
        confirmedAt: '2026-10-19T10:00:00.000Z',
      },
    ],
  },
  scope: {
    snapshotId: 's1',
    version: 1,
    source: 'approval',
    createdAt: '2026-10-21T10:00:00.000Z',
    lines: [
      { position: 1, kind: 'base', serviceCode: 'DW-01', description: 'Synthetic patch', quantity: '1', unit: 'patch' },
    ],
    texts: { exclusions: ['Synthetic: furniture'] },
    selectedOptions: [],
    history: [{ version: 1, source: 'approval', createdAt: '2026-10-21T10:00:00.000Z' }],
  },
  evidence: { photos: [{ id: 'ph1', uploadedAt: '2026-10-18T10:00:00.000Z', uploaderKind: 'customer' }] },
  sop: {
    packages: [
      {
        workPackageId: 'w1',
        serviceId: 'SVC-DW-01',
        serviceCode: 'DW-01',
        state: 'pinned',
        sopVersionId: 'sv1',
        sopId: 'SOP-DW-01',
        version: 1,
        title: 'Synthetic SOP',
        reviewState: 'pending_competent_review',
        spanishStatus: 'pending',
        contentSha256: 'a'.repeat(64),
        hazardSha256: 'b'.repeat(64),
        qualitySha256: 'c'.repeat(64),
      },
    ],
  },
  holds: { holds: [] },
  resources: { visits: [{ visitId: 'v1', number: 1, equipment: [], requested: [] }] },
  dependencies: {
    approvalId: 'a1',
    approvedAt: '2026-10-21T10:00:00.000Z',
    deposit: { required: false, state: 'not_required' },
  },
}

const codes = (before: PacketContent, after: PacketContent) =>
  packetChanges(before, after).map((c) => [c.section, c.code, c.critical])

describe('packetChanges (TSK-0069, HH-PKT-02, HH-DATA-08)', () => {
  it('[HH-PKT-02] the first version and an unchanged packet list nothing; key order does not matter', () => {
    expect(packetChanges(null, BASE)).toEqual([])
    expect(packetChanges(BASE, structuredClone(BASE))).toEqual([])
    // jsonb gives object keys back in its own order: the same content.
    const reverse = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverse)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v)
                .reverse()
                .map(([k, x]) => [k, reverse(x)]),
            )
          : v
    expect(packetChanges(BASE, reverse(BASE) as PacketContent)).toEqual([])
  })

  it('[HH-PKT-02][HH-DATA-08] scope: a new accepted version and its lines are critical', () => {
    const after: PacketContent = {
      ...BASE,
      scope: {
        ...BASE.scope,
        version: 2,
        source: 'change_order',
        lines: [
          ...BASE.scope.lines,
          {
            position: 2,
            kind: 'base',
            serviceCode: 'DW-01',
            description: 'Synthetic prime',
            quantity: '1',
            unit: 'coat',
          },
        ],
        texts: { exclusions: ['Synthetic: furniture', 'Synthetic: ceiling'] },
      },
    }
    expect(codes(BASE, after)).toEqual([
      ['scope', 'scope_version', true],
      ['scope', 'line_added', true],
      ['scope', 'text_changed', true],
    ])
    expect(packetChanges(BASE, after)[1]?.ref).toBe('Synthetic prime')
  })

  it('[HH-DATA-08][T44] assignment: a reassignment removes one worker and adds another, both critical', () => {
    const after: PacketContent = {
      ...BASE,
      assignment: {
        visits: [{ visitId: 'v1', number: 1, team: [{ staffUserId: 's-ben', name: 'Synthetic Ben', role: 'lead' }] }],
      },
    }
    const changes = packetChanges(BASE, after)
    expect(changes).toEqual([
      { section: 'assignment', code: 'worker_added', critical: true, ref: '1', from: null, to: 'Synthetic Ben' },
      { section: 'assignment', code: 'worker_removed', critical: true, ref: '1', from: 'Synthetic Ann', to: null },
    ])
    expect(hasCriticalChange(changes)).toBe(true)
  })

  it('[HH-PKT-02][HH-SCH-07] schedule: a moved window is a new version that is not critical', () => {
    const after: PacketContent = {
      ...BASE,
      schedule: {
        visits: [
          {
            ...(BASE.schedule.visits[0] as PacketContent['schedule']['visits'][number]),
            localDate: '2026-11-06',
            windowVersion: 2,
          },
        ],
      },
    }
    const changes = packetChanges(BASE, after)
    expect(changes).toEqual([
      {
        section: 'schedule',
        code: 'window_changed',
        critical: false,
        ref: '1',
        from: '2026-11-05 09:00-10:00 America/Kentucky/Louisville',
        to: '2026-11-06 09:00-10:00 America/Kentucky/Louisville',
      },
    ])
    expect(hasCriticalChange(changes)).toBe(false)
  })

  it('[HH-DATA-08][OWN-DEC-121] site access: a changed value or an access code change is critical; a reconfirmation is not', () => {
    const reconfirmed: PacketContent = {
      ...BASE,
      site_access: {
        ...BASE.site_access,
        details: [
          {
            ...(BASE.site_access.details[0] as PacketContent['site_access']['details'][number]),
            confirmedAt: '2026-10-22T10:00:00.000Z',
          },
        ],
      },
    }
    expect(codes(BASE, reconfirmed)).toEqual([['site_access', 'detail_reconfirmed', false]])
    const changed: PacketContent = {
      ...BASE,
      site_access: {
        ...BASE.site_access,
        addressVersion: 2,
        details: [
          {
            detail: 'parking_loading',
            value: 'Synthetic: the street',
            source: 'customer_call',
            confirmedAt: '2026-10-22T10:00:00.000Z',
          },
        ],
        accessCodes: [
          { id: 'c1', kind: 'lockbox', label: 'Synthetic box', confirmedAt: '2026-10-22T10:00:00.000Z', version: 2 },
        ],
      },
    }
    expect(codes(BASE, changed)).toEqual([
      ['site_access', 'address_changed', true],
      ['site_access', 'detail_changed', true],
      ['site_access', 'access_code_changed', true],
    ])
    const removed: PacketContent = { ...BASE, site_access: { ...BASE.site_access, accessCodes: [] } }
    expect(codes(BASE, removed)).toEqual([['site_access', 'access_code_removed', true]])
    // Occupant details are listed, not critical (PROPOSED).
    const pets: PacketContent = { ...BASE, occupants: { details: [] } }
    expect(codes(BASE, pets)).toEqual([['occupants', 'detail_removed', false]])
  })

  it('[HH-PKT-02][HH-PKT-03] SOP: a new pinned version is critical; a sign-off of the same version is not', () => {
    const pin = BASE.sop.packages[0] as PacketContent['sop']['packages'][number]
    const signed: PacketContent = { ...BASE, sop: { packages: [{ ...pin, reviewState: 'approved' }] } }
    expect(codes(BASE, signed)).toEqual([['sop', 'sop_review_state', false]])
    const next: PacketContent = {
      ...BASE,
      sop: { packages: [{ ...pin, sopVersionId: 'sv2', version: 2, contentSha256: 'd'.repeat(64) }] },
    }
    expect(codes(BASE, next)).toEqual([['sop', 'sop_version', true]])
  })

  it('[HH-PKT-02][RULE-SAFETY-GATES] holds: raised, changed and no longer blocking are all critical', () => {
    const hold = {
      holdId: 'h1',
      kind: 'review',
      category: 'structural',
      scopeType: 'request',
      state: 'open',
      note: 'Synthetic: a sagging joist',
      source: 'qualification',
      raisedAt: '2026-10-22T10:00:00.000Z',
    }
    const raised: PacketContent = { ...BASE, holds: { holds: [hold] } }
    expect(codes(BASE, raised)).toEqual([['holds', 'hold_added', true]])
    const reviewing: PacketContent = { ...BASE, holds: { holds: [{ ...hold, state: 'under_review' }] } }
    expect(codes(raised, reviewing)).toEqual([['holds', 'hold_changed', true]])
    expect(codes(reviewing, BASE)).toEqual([['holds', 'hold_ended', true]])
  })

  it('[HH-PKT-02] photos, equipment, job and deposit states are new versions that are not critical', () => {
    const after: PacketContent = {
      ...BASE,
      identity: { ...BASE.identity, jobState: 'ready' },
      evidence: { photos: [] },
      resources: {
        visits: [
          { visitId: 'v1', number: 1, equipment: [{ equipmentId: 'e1', name: 'Synthetic ladder' }], requested: [] },
        ],
      },
      dependencies: { ...BASE.dependencies, deposit: { required: true, state: 'satisfied' } },
    }
    const changes = packetChanges(BASE, after)
    expect(changes.map((c) => [c.section, c.code, c.critical])).toEqual([
      ['identity', 'job_state', false],
      ['evidence', 'photos_removed', false],
      ['resources', 'equipment_changed', false],
      ['dependencies', 'deposit_state', false],
    ])
    expect(changedSections(changes)).toEqual(['identity', 'evidence', 'resources', 'dependencies'])
    expect(changedSections(changes).every((s) => PACKET_SECTIONS.includes(s))).toBe(true)
  })
})
