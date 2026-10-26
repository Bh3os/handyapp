// The audit-retention section of the Owner's retention screen (TSK-0135; HH-SEC-08, HH-SEC-06, OWN-DEC-164). The API
// is a synthetic stand-in (RULE-SYNTHETIC-DATA): entry numbers, dates and hashes are test inputs; the period shown is
// whatever the server sends.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuditRetention,
  type AuditRangePreview,
  type AuditRetentionOperation,
  type AuditRetentionOverview,
} from '../src/AuditRetention'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const t = staffTranslator('en').t

const POLICY = {
  state: 'CONFIGURED' as const,
  years: 7,
  version: 1,
  timeZone: 'America/Kentucky/Louisville',
  minimumYears: 7,
}
const OVERVIEW: AuditRetentionOverview = {
  automaticDeletion: false,
  policy: POLICY,
  eligible: { count: 40, months: [{ month: '2016-09', fromSeq: '101', toSeq: '140', count: 40, archived: 0 }] },
  chain: { seals: 3, sealedThrough: '900', lastSealedAt: '2026-10-25T05:00:00.000Z' },
  operations: { archives: 0, deletions: 0, deletedEvents: 0 },
  backups: 'NOT_CONFIGURED',
}
const CONFIRM = ['legal_holds', 'litigation', 'security_incidents']
const preview = (over: Partial<AuditRangePreview> = {}): AuditRangePreview => ({
  range: {
    fromSeq: '101',
    toSeq: '140',
    count: 40,
    firstOccurredAt: '2016-09-10T15:00:00.000Z',
    lastOccurredAt: '2016-09-30T15:00:00.000Z',
    periodEndsAt: '2023-09-30T15:00:00.000Z',
  },
  notYetEligible: 0,
  archived: 0,
  policy: POLICY,
  checks: [
    { check: 'open_holds', result: 'none_found' },
    ...CONFIRM.map((check) => ({ check, result: 'not_recorded' as const })),
  ],
  confirm: CONFIRM,
  blockers: { archive: [], delete: [] },
  permanent: true,
  backups: 'NOT_CONFIGURED',
  ...over,
})
const OPERATION: AuditRetentionOperation = {
  id: '11111111-1111-4111-8111-111111111111',
  seq: '1',
  kind: 'delete',
  fromSeq: '101',
  toSeq: '140',
  count: 40,
  firstOccurredAt: '2016-09-10T15:00:00.000Z',
  lastOccurredAt: '2016-09-30T15:00:00.000Z',
  hashBefore: 'a'.repeat(64),
  hashAfter: 'b'.repeat(64),
  sealSeq: '3',
  reason: 'Synthetic: past its period.',
  authorizedBy: { id: '22222222-2222-4222-8222-222222222222', name: 'Synthetic Owner' },
  authorizedAt: '2026-10-26T15:00:00.000Z',
  checksConfirmed: CONFIRM,
}

function api(range: AuditRangePreview, trail: AuditRetentionOperation[] = []) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/staff/audit-retention')) return json(200, OVERVIEW)
    if (url.includes('/staff/audit-retention/operations')) return json(200, { items: trail, nextCursor: null })
    if (url.includes('/staff/audit-retention/range')) return json(200, range)
    if (url.includes('/staff/audit-retention/verification'))
      return json(200, {
        ok: true,
        checkedEvents: 860,
        seals: 3,
        sealedThrough: '900',
        archives: 0,
        deletions: 1,
        unsealedEvents: 2,
        mismatch: null,
        verifiedAt: '2026-10-26T15:00:00.000Z',
      })
    if (url.endsWith('/staff/audit-retention/delete') && init?.method === 'POST')
      return json(200, { operation: OPERATION, deleted: 40 })
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

describe('audit-retention workflow (TSK-0135, HH-SEC-08)', () => {
  it('[HH-SEC-08][HH-STAFF-08] shows the period, the eligible months and the chain; nothing is automatic', async () => {
    const fetchImpl = api(preview())
    render(<AuditRetention t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    expect(
      await screen.findByText(/^Audit entries are never edited\. 7 years after an entry was recorded/),
    ).toBeTruthy()
    expect(screen.getByText(/Nothing is archived or deleted automatically\./)).toBeTruthy()
    expect(screen.getByText(/the backup retention is NOT CONFIGURED/)).toBeTruthy()
    expect(screen.getByText('The hash chain is sealed through entry #900 (3 seals).')).toBeTruthy()
    expect(screen.getByText('2016-09: entries #101 to #140 (40 entries, 0 archived)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Verify the hash chain' }))
    expect(
      await screen.findByText('The chain verifies: 860 entries checked across 1 deletion and 0 archives.'),
    ).toBeTruthy()
  })

  it('[HH-SEC-08][RULE-HUMAN-REVIEW] Delete waits for every check and a reason, then sends the range and the checks', async () => {
    const fetchImpl = api(preview(), [OPERATION])
    render(<AuditRetention t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Review 2016-09' }))
    const range = await screen.findByTestId('audit-range')
    expect(within(range).getByText('Entries #101 to #140: 40 entries')).toBeTruthy()
    const del = within(range).getByRole('button', { name: /^Delete these entries permanently/ })
    expect(del.hasAttribute('disabled') || del.getAttribute('aria-disabled') === 'true').toBe(true)
    for (const label of [
      'No Legal holds covers these entries',
      'No Litigation covers these entries',
      'No Security incidents needing the records covers these entries',
    ])
      fireEvent.click(within(range).getByLabelText(label))
    fireEvent.change(within(range).getByLabelText('Reason (required)'), {
      target: { value: 'Synthetic: past its period.' },
    })
    fireEvent.click(within(range).getByRole('button', { name: 'Delete these entries permanently' }))
    await waitFor(() =>
      expect(
        fetchImpl.mock.calls.some(
          ([u, init]) =>
            String(u).endsWith('/staff/audit-retention/delete') && (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(true),
    )
    const call = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/staff/audit-retention/delete'))
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      fromSeq: '101',
      toSeq: '140',
      reason: 'Synthetic: past its period.',
      confirmedChecks: CONFIRM,
    })
    expect(await screen.findByText('The entries are deleted; the operation is in the trail.')).toBeTruthy()
    const trail = screen.getByRole('listitem', { name: 'Deleted: entries #101 to #140' })
    expect(within(trail).getByText(/by Synthetic Owner$/)).toBeTruthy()
    expect(within(trail).getByText('Reason: Synthetic: past its period.')).toBeTruthy()
  })

  it('[HH-SEC-08] a hold blocks deletion with its reason and leaves Archive', async () => {
    const fetchImpl = api(
      preview({
        checks: [{ check: 'open_holds', result: 'found', count: 1 }],
        blockers: { archive: [], delete: ['hold_found'] },
      }),
    )
    render(<AuditRetention t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Review 2016-09' }))
    const range = await screen.findByTestId('audit-range')
    // The blocked state and the Delete button's reason both say so.
    expect(within(range).getAllByText('Deletion is blocked for this range').length).toBeGreaterThanOrEqual(1)
    expect(within(range).getByText('A hold or an open case covers some entries: archive them instead.')).toBeTruthy()
    expect(within(range).queryByText(/covers these entries$/)).toBeNull()
    expect(within(range).getByRole('button', { name: /^Archive these entries/ })).toBeTruthy()
  })
})
