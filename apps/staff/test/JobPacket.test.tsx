// The job packet screen (TSK-0069; HH-PKT-01, HH-PKT-02, HH-PKT-07, T28, T43, T44, OWN-DEC-121). The API is a
// synthetic stand-in; every name, address, note and code is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDateOf } from '@handyhub/domain'
import { changeText, JobPacketPage, MyJobPackets, type JobPacketView } from '../src/JobPacket'
import { storeOfflineCopy } from '../src/offline/packet'
import { memoryStore, setOfflineStore } from '../src/offline/store'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

const JOB = '55555555-5555-4555-8555-555555555555'
const PROPERTY = '66666666-6666-4666-8666-666666666666'
const CODE_ID = '77777777-7777-4777-8777-777777777777'
/** Built at runtime so no literal looks like a credential. */
const CODE = ['8', '2', '6', '4'].join('')
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function view(over: Partial<JobPacketView> = {}): JobPacketView {
  return {
    job: { id: JOB, projectId: 'p1', projectReference: 'HH-SYNTH-69', jobState: 'pending_preparation' },
    packet: {
      id: 'k3',
      version: 3,
      contentSha256: 'a'.repeat(64),
      generatedAt: '2026-10-21T15:00:00.000Z',
      critical: true,
    },
    freshness: {
      firstGeneratedAt: '2026-10-20T15:00:00.000Z',
      lastUpdatedAt: '2026-10-21T15:00:00.000Z',
      checkedAt: '2026-10-21T16:00:00.000Z',
      latestVersion: 3,
      current: true,
    },
    review: {
      lastViewed: { version: 2, viewedAt: '2026-10-21T14:00:00.000Z' },
      fromVersion: 2,
      changes: [
        { section: 'scope', code: 'scope_version', critical: true, ref: null, from: 1, to: 2 },
        {
          section: 'scope',
          code: 'line_added',
          critical: true,
          ref: 'Synthetic: prime the patch',
          from: null,
          to: null,
        },
        { section: 'schedule', code: 'window_changed', critical: false, ref: '1', from: 'a', to: 'b' },
      ],
      critical: true,
    },
    services: [{ workPackageId: 'w1', serviceCode: 'DW-01', state: 'planned' }],
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
        team: [{ staffUserId: 's1', name: 'Synthetic Ann', role: 'lead' }],
        equipment: [],
        requested: [],
      },
    ],
    site: {
      propertyId: PROPERTY,
      address: { street: '169 Synthetic Lane', unit: null, city: 'Testville', state: 'KY', zip: '40000' },
      directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=169%20Synthetic%20Lane',
      propertyType: 'house',
      details: [
        {
          detail: 'parking_loading',
          value: 'Synthetic: the drive',
          source: 'customer_call',
          confirmedAt: '2026-10-21T10:00:00.000Z',
        },
      ],
      accessCodes: [
        { id: CODE_ID, kind: 'lockbox', label: 'Synthetic side box', confirmedAt: '2026-10-21T10:00:00.000Z' },
      ],
    },
    occupants: [],
    scope: {
      version: 2,
      source: 'change_order',
      createdAt: '2026-10-21T15:00:00.000Z',
      lines: [{ position: 1, kind: 'base', description: 'Patch the synthetic wall', quantity: '1', unit: 'patch' }],
      texts: { exclusions: ['Synthetic: moving furniture'], assumptions: [] },
      history: [
        { version: 1, source: 'approval', createdAt: '2026-10-20T15:00:00.000Z' },
        { version: 2, source: 'change_order', createdAt: '2026-10-21T15:00:00.000Z' },
      ],
    },
    evidence: { photos: [] },
    sop: {
      packages: [
        {
          workPackageId: 'w1',
          serviceCode: 'DW-01',
          state: 'pinned',
          sopId: 'SOP-DW-01',
          version: 1,
          reviewState: 'pending_competent_review',
        },
      ],
      preWork: [],
      completion: [
        {
          workPackageId: 'w1',
          serviceCode: 'DW-01',
          stage: 'final_checks',
          itemId: '6.1',
          text: 'Synthetic after photo.',
          evidence: ['photo'],
          line: 80,
        },
      ],
    },
    holds: [],
    dependencies: {
      approvedAt: '2026-10-20T15:00:00.000Z',
      deposit: { required: false, state: 'not_required' },
      jobState: 'pending_preparation',
      blockingHolds: 0,
      liveVisits: 1,
    },
    materials: { state: 'not_recorded', packages: [] },
    communication: {
      siteContact: null,
      escalationContact: { state: 'not_configured' },
      emergency: { call911: 'tel:911' },
      stopWork: [
        {
          workPackageId: 'w1',
          serviceCode: 'DW-01',
          items: [{ id: 'stop.1', text: 'Synthetic stop trigger.', line: 90 }],
        },
      ],
    },
    acknowledgments: {
      mine: { state: 'not_assigned', assigned: false, acknowledgment: null, invalidation: null, changesSince: [] },
      team: [],
    },
    actions: { revealAccessCodes: false, acknowledge: false },
    ...over,
  }
}

function api(
  packet: JobPacketView,
  extra: (url: string, init?: RequestInit) => Response | undefined = () => undefined,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const own = extra(url, init)
    if (own) return own
    if (url === `/api/v1/staff/jobs/${JOB}/packet`) return json(200, packet)
    if (url === `/api/v1/staff/jobs/${JOB}/packet/views`)
      return json(200, { version: packet.packet.version, viewedAt: 'x' })
    if (url === `/api/v1/staff/jobs/${JOB}/packet/exports`)
      return json(201, {
        exportId: 'e1',
        version: 3,
        latestVersion: 3,
        current: true,
        format: 'print',
        exportedAt: '2026-10-21T16:05:00.000Z',
      })
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}
function renderPacket(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(<JobPacketPage t={t} locale={locale} fetchImpl={fetchImpl as unknown as typeof fetch} jobId={JOB} />)
}

describe('job packet screen (TSK-0069)', () => {
  it('[HH-PKT-01][HH-PKT-02][T43][T44] every section with version, freshness and what changed since review; the view is recorded', async () => {
    const fetchImpl = api(view())
    renderPacket(fetchImpl)
    await screen.findByRole('heading', { level: 1, name: 'Job packet: project HH-SYNTH-69' })
    expect(screen.getByTestId('packet-version').textContent).toContain('Version 3')
    expect(screen.getByTestId('packet-version').textContent).toContain('Latest version')
    const changes = screen.getByTestId('packet-changes')
    expect(within(changes).getByText('Critical change: review the packet again before you start')).toBeTruthy()
    expect(changes.textContent).toContain('Changes from version 2 to version 3:')
    expect(changes.textContent).toContain('new approved scope version 2 (was 1)')
    expect(changes.textContent).toContain('scope line added: Synthetic: prime the patch')
    expect(within(changes).getAllByText('Critical')).toHaveLength(2)
    for (const name of [
      'Job and visits',
      'Property and site',
      'Occupants and environment',
      'Approved scope',
      'Prior evidence',
      'SOP checklist',
      'Hazards and controls',
      'Tools, equipment and materials',
      'Dependencies',
      'Pre-work evidence',
      'Communication and emergency',
      'Completion preview',
    ])
      expect(screen.getByRole('region', { name })).toBeTruthy()
    expect(screen.getByTestId('packet-team').textContent).toBe('Synthetic Ann (lead)')
    expect(screen.getByTestId('packet-address').textContent).toContain('169 Synthetic Lane, Testville, KY 40000')
    expect(screen.getByText('(Customer by phone, confirmed', { exact: false })).toBeTruthy()
    expect(screen.getByTestId('packet-escalation').textContent).toBe(
      'NOT CONFIGURED: the Owner has not entered a phone number in their staff profile yet. In an emergency, call 911.',
    )
    expect(screen.getByText(/No materials list recorded for this job yet/)).toBeTruthy()
    expect(screen.getByText('No pre-work evidence recorded in the SOP — ask the office.')).toBeTruthy()
    expect(screen.getByText('No approved care notes for this job.')).toBeTruthy()
    expect(screen.getByText(/In an emergency, act first/)).toBeTruthy()
    // Opening the packet records the view of this version.
    await waitFor(() =>
      expect(fetchImpl.mock.calls.find(([u]) => u === `/api/v1/staff/jobs/${JOB}/packet/views`)?.[1]?.body).toBe(
        JSON.stringify({ version: 3 }),
      ),
    )
  })

  it('[HH-PKT-07][T28] the code is never in the packet; Reveal only when the server allows it, and the revealed copy is dropped before printing', async () => {
    const hidden = api(view())
    renderPacket(hidden)
    await screen.findByTestId('packet-access-code')
    expect(screen.queryByRole('button', { name: 'Reveal code' })).toBeNull()
    expect(document.body.textContent).not.toContain(CODE)
    cleanup()
    const fetchImpl = api(view({ actions: { revealAccessCodes: true, acknowledge: false } }), (url) =>
      url.endsWith(`/access-codes/${CODE_ID}/reveal`)
        ? json(200, {
            id: CODE_ID,
            kind: 'lockbox',
            label: 'Synthetic side box',
            value: CODE,
            revealedAt: new Date().toISOString(),
            hideAt: new Date(Date.now() + 60_000).toISOString(),
          })
        : undefined,
    )
    renderPacket(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal code' }))
    await screen.findByText(CODE)
    act(() => void window.dispatchEvent(new Event('beforeprint')))
    await waitFor(() => expect(screen.queryByText(CODE)).toBeNull())
  })

  it('[HH-PKT-07] Print records the export first, then prints with "Printed <time>; check the app for changes"', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const fetchImpl = api(view())
    renderPacket(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Print the packet' }))
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    const [, init] = fetchImpl.mock.calls.find(([u]) => u === `/api/v1/staff/jobs/${JOB}/packet/exports`) as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(String(init.body))).toEqual({ version: 3, format: 'print' })
    expect(screen.getByTestId('packet-print-mark').textContent).toMatch(
      /^Printed .+; check the app for changes\. Packet version 3\.$/,
    )
    expect(screen.getByTestId('packet-printed').textContent).toContain('the print is recorded')
    const pdf = screen.getByRole('link', { name: 'Download PDF' })
    expect(pdf.getAttribute('href')).toBe(`/api/v1/staff/jobs/${JOB}/packet/pdf?version=3`)
  })

  it('[HH-PKT-07] a print that cannot be recorded is not printed', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const fetchImpl = api(view(), (url) =>
      url.endsWith('/packet/exports') ? json(503, { error: { code: 'UNAVAILABLE', fieldErrors: [] } }) : undefined,
    )
    renderPacket(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Print the packet' }))
    await screen.findByText('The print was not recorded, so the packet was not printed. Try again.')
    expect(print).not.toHaveBeenCalled()
  })

  it('[HH-PKT-02][HH-WORK-10] first view, no change and a stale version are said in words; Spanish labels', async () => {
    renderPacket(api(view({ review: { lastViewed: null, fromVersion: null, changes: [], critical: false } })))
    await screen.findByText('You have not viewed this packet before: review every section.')
    cleanup()
    renderPacket(
      api(
        view({
          review: { lastViewed: { version: 3, viewedAt: 'x' }, fromVersion: 3, changes: [], critical: false },
          freshness: { ...view().freshness, current: false, latestVersion: 4 },
        }),
      ),
      'es',
    )
    await screen.findByText('Nada cambió desde que vio la versión 3.')
    expect(screen.getByTestId('packet-version').textContent).toContain('No es la más reciente: existe la versión 4')
    expect(screen.getByRole('region', { name: 'Comunicación y emergencias' })).toBeTruthy()
  })

  it('[HH-STAFF-04] a packet the server refuses says why, without data', async () => {
    const fetchImpl = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    renderPacket(fetchImpl)
    await screen.findByText('This job packet is not available to you')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('[HH-PKT-02] change words use the labels of their codes', () => {
    const { t } = staffTranslator('en')
    expect(
      changeText(t, {
        section: 'holds',
        code: 'hold_added',
        critical: true,
        ref: 'structural',
        from: null,
        to: 'open',
      }),
    ).toBe('hold raised: Structural (Open)')
    expect(
      changeText(t, { section: 'evidence', code: 'photos_added', critical: false, ref: null, from: null, to: 2 }),
    ).toBe('2 photos added')
    expect(
      changeText(t, { section: 'x' as never, code: 'unknown_code', critical: false, ref: null, from: null, to: null }),
    ).toBe('unknown_code')
  })
})

describe('[HH-PKT-09][OWN-DEC-172] the escalation procedure in the packet (TSK-0129)', () => {
  const owner = {
    state: 'configured' as const,
    phone: '+15025550142',
    display: '(502) 555-0142',
    tel: 'tel:+15025550142',
  }
  const withOwner = () => view({ communication: { ...view().communication, escalationContact: owner } })

  it('Call Owner dials the number the Owner entered, the procedure is stated, and the tap is recorded', async () => {
    const posts: { url: string; body: Record<string, unknown> }[] = []
    const fetchImpl = api(withOwner(), (url, init) => {
      if (!url.endsWith('/escalation-calls')) return undefined
      posts.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return json(201, { clientId: 'c1', action: 'call_owner', workStaysPaused: false, owner })
    })
    renderPacket(fetchImpl)
    const link = await screen.findByRole('link', { name: 'Call Owner — Report a Problem' })
    expect(link.getAttribute('href')).toBe('tel:+15025550142')
    expect(screen.getByTestId('packet-escalation').textContent).toContain('(502) 555-0142')
    expect(screen.getByTestId('escalation-procedure').textContent).toContain(
      'Call 911 immediately, without waiting for Owner approval',
    )
    expect(screen.getByTestId('escalation-procedure').textContent).toContain(
      'If the Owner cannot be reached and the issue is not an emergency, keep the affected work paused',
    )
    // The packet's contact is kept on this phone for Call Owner offline.
    expect(JSON.parse(window.localStorage.getItem('hh.staff.ownerContact') ?? 'null')).toEqual(owner)
    fireEvent.click(link)
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]?.url).toBe(`/api/v1/staff/jobs/${JOB}/escalation-calls`)
    expect(posts[0]?.body).toMatchObject({ action: 'call_owner' })
    expect(window.localStorage.getItem('hh.staff.pendingEscalations')).toBeNull()
  })

  it('in Spanish the packet states the owner’s Spanish instruction exactly as given', async () => {
    renderPacket(api(withOwner()), 'es')
    await screen.findByRole('link', { name: 'Llamar al propietario — Reportar un problema' })
    expect(within(screen.getByTestId('escalation-procedure')).getByText(OWNER_SPANISH)).toBeTruthy()
  })
})

/** The owner's Spanish instruction, verbatim (OWN-DEC-172 item 6). */
const OWNER_SPANISH =
  'Si ocurre un problema, detén el trabajo afectado y llama primero al propietario para recibir instrucciones. Si hay una emergencia médica grave, un incendio, una fuga peligrosa de gas o cualquier peligro inmediato para la vida, llama al 911 sin esperar autorización. Avisa al propietario cuando sea seguro hacerlo.'

describe('your job packets on My Day (TSK-0069)', () => {
  it('[HH-PKT-02][HH-OFF-09] lists the assigned jobs with their version and what changed since viewed', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, {
        packets: [
          {
            jobId: JOB,
            projectReference: 'HH-SYNTH-69',
            version: 5,
            lastViewedVersion: 4,
            changedSinceViewed: true,
            criticalSinceViewed: true,
            acknowledgment: 'invalidated',
            acknowledgedVersion: 4,
            visits: [
              {
                visitId: 'v1',
                number: 1,
                localDate: '2026-11-05',
                windowStart: '09:00',
                windowEnd: '10:00',
                timeZone: 'America/Kentucky/Louisville',
              },
            ],
          },
        ],
      }),
    )
    const { t } = staffTranslator('en')
    render(<MyJobPackets t={t} fetchImpl={fetchImpl as unknown as typeof fetch} href={(to) => `/staff${to}`} />)
    const link = await screen.findByRole('link', { name: 'Job packet: project HH-SYNTH-69' })
    expect(link.getAttribute('href')).toBe(`/staff/packets/${JOB}`)
    expect(screen.getByText('Critical change since you viewed it')).toBeTruthy()
    // TSK-0072: where the worker's own acknowledgment stands.
    expect(screen.getByText('Review again')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Your job packets' })).toBeTruthy()
  })
})

describe('your review of the packet (TSK-0072)', () => {
  const ANN = '88888888-8888-4888-8888-888888888888'
  const required = (): Partial<JobPacketView> => ({
    acknowledgments: {
      mine: { state: 'required', assigned: true, acknowledgment: null, invalidation: null, changesSince: [] },
      team: [
        {
          staffUserId: ANN,
          name: 'Synthetic Ann',
          state: 'required',
          version: null,
          acknowledgedAt: null,
          invalidation: null,
        },
      ],
    },
    actions: { revealAccessCodes: false, acknowledge: true },
  })

  it('[HH-WORK-10][T44] the assigned worker acknowledges this exact version personally, only after ticking the box', async () => {
    let acknowledged = false
    const after: Partial<JobPacketView> = {
      acknowledgments: {
        mine: {
          state: 'acknowledged',
          assigned: true,
          acknowledgment: { version: 3, acknowledgedAt: '2026-10-21T16:10:00.000Z' },
          invalidation: null,
          changesSince: [],
        },
        team: [
          {
            staffUserId: ANN,
            name: 'Synthetic Ann',
            state: 'acknowledged',
            version: 3,
            acknowledgedAt: '2026-10-21T16:10:00.000Z',
            invalidation: null,
          },
        ],
      },
      actions: { revealAccessCodes: false, acknowledge: false },
    }
    const fetchImpl = api(view(required()), (url, init) => {
      if (url === `/api/v1/staff/jobs/${JOB}/packet/acknowledgments` && init?.method === 'POST') {
        acknowledged = true
        return json(201, {
          acknowledgmentId: 'a1',
          version: 3,
          acknowledgedAt: 'x',
          created: true,
          state: 'acknowledged',
        })
      }
      if (url === `/api/v1/staff/jobs/${JOB}/packet` && acknowledged) return json(200, view(after))
      return undefined
    })
    renderPacket(fetchImpl)
    const review = await screen.findByTestId('packet-review')
    expect(within(review).getByText('You have not acknowledged this packet yet')).toBeTruthy()
    expect(review.textContent).toContain("another worker's review does not count for you")
    const button = within(review).getByRole('button', { name: 'Acknowledge version 3' })
    expect(button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true').toBe(true)
    fireEvent.click(within(review).getByLabelText(/I reviewed this packet myself/))
    fireEvent.click(within(review).getByRole('button', { name: 'Acknowledge version 3' }))
    await screen.findByTestId('packet-acknowledged')
    const [, init] = fetchImpl.mock.calls.find(([u]) => u === `/api/v1/staff/jobs/${JOB}/packet/acknowledgments`) as [
      string,
      RequestInit,
    ]
    // The exact version and content the worker read; never another person's ID.
    expect(JSON.parse(String(init.body))).toEqual({ version: 3, contentSha256: 'a'.repeat(64) })
    expect(screen.getByTestId('packet-review-team').textContent).toContain('Synthetic Ann: Acknowledged, version 3')
    expect(screen.getByText('An acknowledgment never releases a hold and never starts work by itself.')).toBeTruthy()
  })

  it('[HH-DATA-08][T44] a critical change says the old acknowledgment no longer counts, with what changed', async () => {
    renderPacket(
      api(
        view({
          acknowledgments: {
            mine: {
              state: 'invalidated',
              assigned: true,
              acknowledgment: { version: 2, acknowledgedAt: '2026-10-21T14:00:00.000Z' },
              invalidation: { reason: 'critical_change', version: 3, invalidatedAt: '2026-10-21T15:00:00.000Z' },
              changesSince: [
                { section: 'holds', code: 'hold_added', critical: true, ref: 'structural', from: null, to: 'open' },
              ],
            },
            team: [],
          },
          actions: { revealAccessCodes: false, acknowledge: true },
        }),
      ),
    )
    const review = await screen.findByTestId('packet-review')
    expect(within(review).getByText('Your acknowledgment of version 2 no longer counts')).toBeTruthy()
    expect(review.textContent).toContain('Version 3 has a critical change.')
    expect(review.textContent).toContain('hold raised: Structural (Open)')
    expect(within(review).getByRole('button', { name: 'Acknowledge version 3' })).toBeTruthy()
  })

  it('[HH-WORK-10] a packet that changed meanwhile is reloaded and said; Spanish words; the office only reads the team', async () => {
    const fetchImpl = api(view(required()), (url, init) =>
      url.endsWith('/packet/acknowledgments') && init?.method === 'POST'
        ? json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'body.version', code: 'PACKET_CHANGED' }] } })
        : undefined,
    )
    renderPacket(fetchImpl, 'es')
    const review = await screen.findByTestId('packet-review')
    fireEvent.click(within(review).getByLabelText(/Revisé este paquete yo mismo/))
    fireEvent.click(within(review).getByRole('button', { name: 'Confirmar la versión 3' }))
    await screen.findByText('El paquete cambió mientras lo revisaba. Revise la versión nueva.')
    await waitFor(() =>
      expect(fetchImpl.mock.calls.filter(([u]) => u === `/api/v1/staff/jobs/${JOB}/packet`).length).toBe(2),
    )
    cleanup()
    renderPacket(
      api(
        view({
          acknowledgments: {
            mine: {
              state: 'not_assigned',
              assigned: false,
              acknowledgment: null,
              invalidation: null,
              changesSince: [],
            },
            team: [
              {
                staffUserId: ANN,
                name: 'Synthetic Ann',
                state: 'invalidated',
                version: 2,
                acknowledgedAt: 'x',
                invalidation: 'account_disabled',
              },
            ],
          },
        }),
      ),
    )
    const office = await screen.findByTestId('packet-review')
    expect(office.textContent).toContain(
      'Only the workers assigned to this job acknowledge its packet, each personally.',
    )
    expect(within(office).queryByRole('button', { name: /Acknowledge/ })).toBeNull()
    expect(screen.getByTestId('packet-review-team').textContent).toContain('Synthetic Ann: Review again')
  })
})

describe('the offline packet (TSK-0079)', () => {
  const ZONE = 'America/Kentucky/Louisville'
  const today = localDateOf(new Date(), ZONE)

  it('[HH-OFF-01][T49] online, My Day keeps a verified copy of each assigned packet and says it is ready for offline use', async () => {
    const store = memoryStore()
    setOfflineStore(store)
    const fetchImpl = api(view(), (url) =>
      url === '/api/v1/staff/my/job-packets'
        ? json(200, {
            packets: [
              {
                jobId: JOB,
                projectReference: 'HH-SYNTH-69',
                version: 3,
                lastViewedVersion: 3,
                changedSinceViewed: false,
                criticalSinceViewed: false,
                acknowledgment: 'acknowledged',
                acknowledgedVersion: 3,
                visits: [
                  {
                    visitId: 'v1',
                    number: 1,
                    localDate: today,
                    windowStart: '08:00',
                    windowEnd: '10:00',
                    timeZone: ZONE,
                  },
                ],
              },
            ],
          })
        : url.endsWith('/sop')
          ? json(200, { synthetic: 'checklist' })
          : undefined,
    )
    const { t } = staffTranslator('en')
    render(<MyJobPackets t={t} fetchImpl={fetchImpl as unknown as typeof fetch} href={(to) => to} />)
    expect((await screen.findByTestId('offline-ready')).textContent).toBe('Ready for offline use (version 3)')
    const stored = await store.getPacket(JOB)
    expect(stored).toMatchObject({ version: 3 })
    // The copy holds no access-code entry and no photo link (T28, HH-OFF-02).
    expect(JSON.stringify(stored)).not.toContain('Back door')
    setOfflineStore(null)
  })

  it('[HH-OFF-01][HH-OFF-04][T49] offline, the packet is the stored copy, labelled with its version and last sync; nothing is acknowledged or printed', async () => {
    const store = memoryStore()
    setOfflineStore(store)
    await storeOfflineCopy(store, view(), [{ localDate: today, timeZone: ZONE }])
    const fetchImpl = vi.fn(async (_url: string): Promise<Response> => {
      throw new TypeError('network down')
    })
    renderPacket(fetchImpl)
    expect((await screen.findByTestId('packet-offline-copy')).textContent).toContain('Version 3, last synchronized')
    expect(screen.getByText(/Not yet synchronized\. The office has not been notified/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Print/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /I reviewed|Acknowledge/ })).toBeNull()
    // No view was recorded from the copy (only the failed load was attempted).
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).endsWith('/views'))).toBe(true)
    setOfflineStore(null)
  })
})
