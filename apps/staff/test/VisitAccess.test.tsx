// The assigned workers' visit-day access and the Owner's extensions on the staff app (TSK-0128; HH-PKT-08, HH-OFF-02,
// OWN-DEC-171). The API is a synthetic stand-in; every name, reference, address and reason is synthetic
// (RULE-SYNTHETIC-DATA). Every instant is fixed.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fetch } from '../src/api'
import { VisitDayNotice } from '../src/JobPacket'
import { purgeOfflineCopies, readOfflineCopy, storeOfflineCopy, withoutVisitDay } from '../src/offline/packet'
import { memoryStore } from '../src/offline/store'
import { VisitAccessPage, type WorkerAccessView } from '../src/VisitAccess'

afterEach(cleanup)

const t = staffTranslator('en').t
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const VISIT = '55555555-5555-4555-8555-555555550128'
const ANN = '11111111-1111-4111-8111-111111110128'
const ZONE = 'America/Kentucky/Louisville'

const accessView = (over: Partial<WorkerAccessView> = {}): WorkerAccessView => ({
  visitId: VISIT,
  number: 2,
  purpose: 'service',
  state: 'confirmed',
  projectReference: 'HH-SYNTH128',
  window: { localDate: '2026-11-05', start: '09:00', end: '10:00', timeZone: ZONE },
  serviceDay: { startsAt: '2026-11-05T05:00:00.000Z', endsAt: '2026-11-06T05:00:00.000Z' },
  workers: [
    {
      staffUserId: ANN,
      name: 'Annabel Synthetic',
      role: 'lead',
      open: false,
      basis: null,
      endsAt: null,
      opensAt: '2026-11-05T05:00:00.000Z',
    },
  ],
  extensions: [],
  maxHours: 24,
  actions: { extend: true },
  ...over,
})

describe('VisitAccessPage (TSK-0128)', () => {
  it('[HH-PKT-08][OWN-DEC-171] shows when each worker sees the visit-day data and lets the Owner extend it', async () => {
    const posts: { url: string; body: unknown; key: string | null }[] = []
    const extended = accessView({
      workers: accessView().workers.map((w) => ({
        ...w,
        open: true,
        basis: 'extension' as const,
        endsAt: '2026-11-04T20:00:00.000Z',
      })),
      extensions: [
        {
          id: 'x-1',
          staffUserId: ANN,
          name: 'Annabel Synthetic',
          state: 'active',
          reason: 'Synthetic: early start',
          grantedBy: { id: 'o-1', name: 'Synthetic Owner' },
          startsAt: '2026-11-04T18:00:00.000Z',
          expiresAt: '2026-11-04T20:00:00.000Z',
          endedAt: null,
          endedBy: null,
          endReason: null,
        },
      ],
    })
    let answer: Response = json(201, extended)
    const fetchImpl: Fetch = async (input, init) => {
      if (init?.method !== 'POST') return json(200, accessView())
      posts.push({
        url: String(input),
        body: JSON.parse(String(init.body)),
        key: new Headers(init.headers).get('idempotency-key'),
      })
      return answer
    }
    render(<VisitAccessPage t={t} locale="en" fetchImpl={fetchImpl} visitId={VISIT} />)
    const page = await screen.findByTestId('visit-access')
    expect(within(page).getByTestId('visit-access-worker').textContent).toMatch(/Annabel Synthetic.*Opens Nov 5, 2026/)
    expect(page.textContent).toContain('only on the visit day in America/Kentucky/Louisville')
    expect(within(page).getByText('No extension has been granted on this visit.')).toBeTruthy()

    // A reason is required before anything is sent.
    fireEvent.change(within(page).getByLabelText(/Ends at/), { target: { value: '2026-11-04T15:00' } })
    fireEvent.click(within(page).getByRole('button', { name: 'Extend access' }))
    expect(within(page).getByRole('alert').textContent).toBe('Enter a reason.')
    expect(posts).toEqual([])

    // The server's refusal is said in words, with the limit it names.
    answer = json(400, {
      error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.expiresAt', code: 'EXPIRY_TOO_FAR' }] },
    })
    fireEvent.change(within(page).getByLabelText('Reason'), { target: { value: ' Synthetic: early start ' } })
    fireEvent.click(within(page).getByRole('button', { name: 'Extend access' }))
    await waitFor(() =>
      expect(within(page).getByRole('alert').textContent).toBe('Choose an end time at most 24 hours from now.'),
    )
    expect(posts[0]).toMatchObject({
      url: `/api/v1/staff/visits/${VISIT}/worker-access/extensions`,
      body: { staffUserId: ANN, reason: 'Synthetic: early start' },
    })
    expect(posts[0]?.key).toBeTruthy()

    answer = json(201, extended)
    fireEvent.click(within(page).getByRole('button', { name: 'Extend access' }))
    await waitFor(() => expect(within(page).getByRole('status').textContent).toBe('Extension recorded.'))
    expect(within(page).getByTestId('visit-access-worker').textContent).toContain('Open by Owner extension until')
    const ext = within(page).getByTestId('visit-access-extension')
    expect(ext.textContent).toContain('In force')
    expect(ext.textContent).toContain('Reason: Synthetic: early start')
    expect(within(ext).getByRole('button', { name: 'End now' })).toBeTruthy()
  })

  it('Office sees the access and the history but no extend form; a refusal says so', async () => {
    const fetchImpl: Fetch = async () => json(200, accessView({ actions: { extend: false } }))
    render(<VisitAccessPage t={t} locale="es" fetchImpl={fetchImpl} visitId={VISIT} />)
    const page = await screen.findByTestId('visit-access')
    expect(within(page).queryByRole('button')).toBeNull()
    cleanup()
    render(<VisitAccessPage t={t} locale="en" fetchImpl={async () => json(403, {})} visitId={VISIT} />)
    expect(await screen.findByText('You cannot open the worker access of this visit.')).toBeTruthy()
  })
})

describe('VisitDayNotice (TSK-0128)', () => {
  const when = (iso: string) => iso.slice(0, 16)
  it('[HH-PKT-08] says when the visit-day data opens, that it is over, until when it shows and that copies stay', () => {
    const { rerender } = render(
      <VisitDayNotice
        t={t}
        when={when}
        access={{ mode: 'closed', basis: null, endsAt: null, opensAt: '2026-11-05T05:00:00.000Z' }}
      />,
    )
    expect(screen.getByTestId('visit-day-closed').textContent).toContain('on the visit day only, from 2026-11-05T05:00')
    rerender(<VisitDayNotice t={t} when={when} access={{ mode: 'closed', basis: null, endsAt: null, opensAt: null }} />)
    expect(screen.getByTestId('visit-day-closed').textContent).toContain('The visit day is over')
    rerender(
      <VisitDayNotice
        t={t}
        when={when}
        access={{ mode: 'visit_day', basis: 'extension', endsAt: '2026-11-06T07:00:00.000Z', opensAt: null }}
      />,
    )
    const open = screen.getByTestId('visit-day-open').textContent ?? ''
    expect(open).toContain('Access extended by the Owner until 2026-11-06T07:00')
    expect(open).toContain('Removing access cannot erase screenshots, printouts or anything already copied.')
    rerender(<VisitDayNotice t={t} when={when} access={{ mode: 'full', basis: null, endsAt: null, opensAt: null }} />)
    expect(screen.queryByTestId('visit-day-open')).toBeNull()
  })
})

describe('the offline copy loses the visit-day data when the access ends (TSK-0128, HH-OFF-02)', () => {
  const NOW = new Date('2026-11-05T15:00:00.000Z')
  const packetView = (access: { mode: string; endsAt: string | null }) => ({
    job: { id: 'job-128', projectReference: 'HH-SYNTH128' },
    packet: { version: 4, contentSha256: 'b'.repeat(64) },
    site: {
      address: { street: '128 Synthetic Lane', unit: null, city: 'Testville', state: 'KY', zip: '40000' },
      directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=128%20Synthetic%20Lane',
      serviceArea: { city: 'Testville', state: 'KY' },
      details: [{ detail: 'site_contact', value: 'Synthetic neighbour, (502) 555-0128' }],
      accessCodes: [{ id: 'c-1', kind: 'lockbox' }],
    },
    communication: { siteContact: { detail: 'site_contact', value: 'Synthetic neighbour, (502) 555-0128' } },
    customer: { firstName: 'Rosalind' },
    access: { ...access, basis: 'visit_day', opensAt: null },
    evidence: { photos: [] },
    dependencies: { deposit: null },
  })
  const visits = [
    { localDate: '2026-11-05', timeZone: ZONE },
    { localDate: '2026-11-07', timeZone: ZONE },
  ]

  it('[HH-OFF-02][T49] read after the visit-day access ended: no address, site contact or first name is left', async () => {
    const store = memoryStore()
    const endsAt = '2026-11-06T05:00:00.000Z'
    expect((await storeOfflineCopy(store, packetView({ mode: 'visit_day', endsAt }), visits, {}, NOW)).state).toBe(
      'ready',
    )
    const during = await readOfflineCopy(store, 'job-128', new Date('2026-11-06T04:59:59.000Z'))
    expect(JSON.stringify(during?.view)).toContain('128 Synthetic Lane')
    // The copy outlives the day (a later visit), but the visit-day data does not.
    const after = await readOfflineCopy(store, 'job-128', new Date('2026-11-06T05:00:00.000Z'))
    expect(after).not.toBeNull()
    const text = JSON.stringify(after?.view)
    for (const gone of ['128 Synthetic Lane', '555-0128', 'Rosalind', 'lockbox', 'maps/dir'])
      expect(text).not.toContain(gone)
    expect(text).toContain('Testville')
    expect(after?.visitDayUntil).toBeNull()
    // And it is the stored copy itself that changed, not only what was shown.
    expect(JSON.stringify((await store.getPacket('job-128'))?.view)).not.toContain('128 Synthetic Lane')
  })

  it('the purge on reconnect trims a kept copy the same way; a copy taken before the day holds none of it', async () => {
    const store = memoryStore()
    await storeOfflineCopy(
      store,
      packetView({ mode: 'visit_day', endsAt: '2026-11-05T16:00:00.000Z' }),
      visits,
      {},
      NOW,
    )
    await purgeOfflineCopies(store, ['job-128'], new Date('2026-11-05T16:00:00.000Z'))
    expect(JSON.stringify((await store.getPacket('job-128'))?.view)).not.toContain('Rosalind')
    const closed = withoutVisitDay(packetView({ mode: 'visit_day', endsAt: null })) as { access: { mode: string } }
    expect(closed.access.mode).toBe('closed')
    const before = memoryStore()
    await storeOfflineCopy(before, { ...packetView({ mode: 'closed', endsAt: null }) }, visits, {}, NOW)
    expect((await before.getPacket('job-128'))?.visitDayUntil).toBeNull()
  })
})
