// Restore comparison and replay-file parsing (TSK-0106; T72, HH-NFR-03, HH-PRIV-03). Pure functions; the rehearsal
// against a real dump is test/integration/restore-rehearsal.test.ts.
import { describe, expect, it } from 'vitest'
import { parseExportedWithdrawals } from '../../src/modules/notifications/consent-replay.js'
import { compareFingerprints, type DatabaseFingerprint } from '../../src/platform/restore.js'

const base = (): DatabaseFingerprint => ({
  tables: {
    'crm.customers': { rows: 2, checksum: 'a' },
    'crm.projects': { rows: 3, checksum: 'b' },
  },
  relationships: { 'crm.projects.projects_customer_id_fkey': 3 },
  appendOnlyTriggers: ['platform.audit_events.audit_events_append_only'],
  migrations: ['0001', '0002'],
})

describe('compareFingerprints (TSK-0106, T72)', () => {
  it('[T72] the same data is no difference', () => {
    expect(compareFingerprints(base(), base())).toEqual([])
  })

  it('[T72] names missing and added tables, row counts, changed content, relationships, guards and migrations', () => {
    const after = base()
    delete after.tables['crm.customers']
    after.tables['crm.projects'] = { rows: 2, checksum: 'c' }
    after.tables['crm.extra'] = { rows: 0, checksum: 'd' }
    after.relationships['crm.projects.projects_customer_id_fkey'] = 2
    after.appendOnlyTriggers = []
    after.migrations = ['0001']
    expect(compareFingerprints(base(), after)).toEqual([
      { kind: 'table_missing', name: 'crm.customers' },
      { kind: 'table_added', name: 'crm.extra' },
      { kind: 'rows', name: 'crm.projects', before: 3, after: 2 },
      { kind: 'relationship', name: 'crm.projects.projects_customer_id_fkey', before: 3, after: 2 },
      { kind: 'append_only_trigger_missing', name: 'platform.audit_events.audit_events_append_only' },
      { kind: 'migrations', before: ['0001', '0002'], after: ['0001'] },
    ])
  })

  it('[T72] the same row count with other content is a content difference', () => {
    const after = base()
    after.tables['crm.customers'] = { rows: 2, checksum: 'z' }
    expect(compareFingerprints(base(), after)).toEqual([{ kind: 'content', name: 'crm.customers' }])
  })
})

describe('parseExportedWithdrawals (TSK-0106, HH-PRIV-03)', () => {
  const entry = {
    id: '00000000-0000-4000-8000-000000000001',
    purpose: 'transactional_sms',
    channel: 'sms',
    destination: '+15025550100',
    subjectKind: null,
    subjectId: null,
    source: 'sms_keyword',
    evidence: { keyword: 'STOP' },
    recordedAt: '2026-10-22T12:00:00.000Z',
  }

  it('[HH-PRIV-03] accepts an exported withdrawal list', () => {
    expect(parseExportedWithdrawals([entry])).toEqual([entry])
  })

  it('[HH-PRIV-03] refuses anything else before anything is applied', () => {
    expect(() => parseExportedWithdrawals({})).toThrow(/JSON list/)
    for (const bad of [
      { ...entry, id: 'not-a-uuid' },
      { ...entry, purpose: 'anything' },
      { ...entry, channel: 'fax' },
      { ...entry, source: 'guess' },
      { ...entry, evidence: [] },
      { ...entry, recordedAt: 'yesterday' },
    ])
      expect(() => parseExportedWithdrawals([bad])).toThrow(/entry 1/)
  })
})
