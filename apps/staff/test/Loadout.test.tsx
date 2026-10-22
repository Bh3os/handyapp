// The job loadout screen (TSK-0071; HH-PKT-05, HH-PKT-06, HH-WORK-02, T43, T45). The API is a synthetic stand-in;
// every name, note and item is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoadoutPage, plainLine, type LoadoutBlock, type LoadoutView } from '../src/Loadout'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const JOB = '55555555-5555-4555-8555-555555555571'
const WP = '66666666-6666-4666-8666-666666666671'
const WP2 = '77777777-7777-4777-8777-777777777771'
const HOLD = '88888888-8888-4888-8888-888888888871'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const block = (over: Partial<LoadoutBlock> = {}): LoadoutBlock => ({
  holdId: HOLD,
  workPackageId: WP,
  itemKey: '2',
  itemName: 'Synthetic gloves',
  state: 'open',
  version: 1,
  note: 'Synthetic gloves: the box is empty',
  raisedBy: { id: 's1', name: 'Synthetic Ann' },
  raisedAt: '2026-10-21T15:00:00.000Z',
  reviewStartedAt: null,
  resolutionNote: null,
  reviewer: null,
  resolvedAt: null,
  cancelReason: null,
  canceledAt: null,
  owner: { role: 'owner', action: 'provide_item_or_approve_substitute' },
  actions: { startReview: false, resolve: false, cancel: false },
  ...over,
})

function view(over: Partial<LoadoutView> = {}, blocks: LoadoutBlock[] = []): LoadoutView {
  return {
    jobId: JOB,
    projectReference: 'HH-SYNTH-71',
    packetVersion: 4,
    actions: { record: true },
    packages: [
      {
        workPackageId: WP,
        serviceId: 'SVC-CL-01',
        serviceCode: 'CL-01',
        position: 1,
        state: 'planned',
        loadout: {
          loadoutVersionId: 'lv1',
          inventoryId: 'FACT-INVENTORY-CL-01',
          version: 1,
          sourceFile: 'Required inventory/synthetic.md',
          pinnedAt: '2026-10-21T14:00:00.000Z',
        },
        readiness: {
          state: blocks.length ? 'blocked' : 'not_confirmed',
          unconfirmed: ['1', '2'],
          reported: [],
          blocks: blocks.map((b) => b.holdId),
        },
        groups: [
          {
            heading: 'C. Synthetic PPE',
            line: 3,
            notes: [{ lines: ['> FLAG (X): synthetic review note.'], line: 4 }],
            items: [
              {
                key: '1',
                name: 'Synthetic caddy',
                lines: ['- [ ] **Synthetic caddy:** carries things.', '\t- [ ] **Red:** synthetic sub-item.'],
                line: 5,
                criticality: 'required',
                category: 'not_classified',
                current: null,
              },
              {
                key: '2',
                name: 'Synthetic gloves',
                lines: ['- [ ] **Synthetic gloves:** protect hands.'],
                line: 7,
                criticality: 'required',
                category: 'not_classified',
                current: blocks.length
                  ? {
                      status: 'missing',
                      note: 'the box is empty',
                      substitute: null,
                      impacts: null,
                      recordedBy: { id: 's1', name: 'Synthetic Ann' },
                      recordedAt: '2026-10-21T15:00:00.000Z',
                    }
                  : null,
              },
            ],
          },
        ],
        proposed: { lines: ['Proposed additions in the vault file: Synthetic item (PROPOSED).'], line: null },
        blocks,
      },
      {
        workPackageId: WP2,
        serviceId: 'SVC-HI-06',
        serviceCode: 'HI-06',
        position: 2,
        state: 'planned',
        loadout: null,
        readiness: { state: 'not_configured', unconfirmed: [], reported: [], blocks: [] },
        groups: [],
        proposed: null,
        blocks: [],
      },
    ],
    ...over,
  }
}

function api(v: LoadoutView, post?: (url: string, init: RequestInit) => Response | undefined) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return post?.(url, init) ?? json(201, { blocksRaised: [], readiness: 'not_confirmed' })
    return json(200, v)
  })
}
function renderLoadout(fetchImpl: ReturnType<typeof api>, locale: StaffLocale = 'en') {
  const { t } = staffTranslator(locale)
  return render(
    <LoadoutPage
      t={t}
      locale={locale}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      jobId={JOB}
      href={(to) => `/staff${to}`}
    />,
  )
}

describe('the job loadout (TSK-0071, HH-PKT-05)', () => {
  it('[HH-PKT-05][T43] shows each list as the file writes it, required items, readiness and NOT CONFIGURED', async () => {
    renderLoadout(api(view()))
    await screen.findByRole('heading', { level: 1, name: 'Loadout — HH-SYNTH-71' })
    const [cl, hi] = screen.getAllByTestId('loadout-package')
    if (!cl || !hi) throw new Error('two packages')
    expect(within(cl).getByTestId('loadout-readiness').textContent).toBe('Not confirmed yet')
    expect(within(cl).getByText('Synthetic caddy: carries things.')).toBeTruthy()
    expect(within(cl).getByText('Red: synthetic sub-item.')).toBeTruthy()
    expect(within(cl).getByText('FLAG (X): synthetic review note.')).toBeTruthy()
    expect(within(cl).getAllByText('Required')).toHaveLength(2)
    expect(within(cl).getByText('2 required items not confirmed loaded yet.')).toBeTruthy()
    expect(within(cl).getByText('Proposed additions (not approved; not on the loadout)')).toBeTruthy()
    expect(within(hi).getByTestId('loadout-readiness').textContent).toBe('NOT CONFIGURED')
    expect(within(hi).getByText(/no loadout list for this service yet/)).toBeTruthy()
    expect(within(hi).queryByRole('button')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open the job packet (version 4)' }).getAttribute('href')).toBe(
      `/staff/packets/${JOB}`,
    )
    expect(plainLine('- [ ] **A:** b')).toBe('A: b')
  })

  it('[HH-PKT-05][HH-PKT-06] a worker states missing with a note; the server answers the block', async () => {
    const fetchImpl = api(view(), (url) =>
      url.endsWith('/loadout/checks') ? json(201, { blocksRaised: [HOLD], readiness: 'blocked' }) : undefined,
    )
    renderLoadout(fetchImpl)
    const items = await screen.findAllByTestId('loadout-item')
    const gloves = items.find((i) => i.dataset['item'] === '2') as HTMLElement
    const caddy = items.find((i) => i.dataset['item'] === '1') as HTMLElement
    fireEvent.click(within(caddy).getByRole('radio', { name: 'Loaded' }))
    fireEvent.click(within(gloves).getByRole('radio', { name: 'Missing' }))
    fireEvent.change(within(gloves).getByLabelText('What you see (optional)'), {
      target: { value: 'the box is empty' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save the loadout for Routine House Cleaning' }))
    await screen.findByText('Saved. 1 task block raised: Start Work is blocked for this service.')
    const [url, init] = fetchImpl.mock.calls.find(([, i]) => i?.method === 'POST') as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/jobs/${JOB}/loadout/checks`)
    expect(JSON.parse(String(init.body))).toEqual({
      workPackageId: WP,
      items: [
        { key: '1', status: 'loaded' },
        { key: '2', status: 'missing', note: 'the box is empty' },
      ],
    })
    expect((init.headers as Record<string, string>)['idempotency-key']).toMatch(/^staff-/)
  })

  it('[HH-PKT-05] nothing chosen is said; a reader without the permission gets no controls; Spanish labels', async () => {
    renderLoadout(api(view()))
    fireEvent.click(await screen.findByRole('button', { name: 'Save the loadout for Routine House Cleaning' }))
    await screen.findByText('Choose Loaded, Missing or Damaged for at least one item.')
    cleanup()
    renderLoadout(api(view({ actions: { record: false } })), 'es')
    await screen.findByText('Carga — HH-SYNTH-71')
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getAllByTestId('loadout-readiness')[0]?.textContent).toBe('Aún sin confirmar')
  })
})

describe('task blocks (TSK-0071, HH-PKT-06, HH-WORK-02, T45)', () => {
  it('[HH-PKT-06][T45] a block shows its owner and action; a worker has no control over it', async () => {
    renderLoadout(api(view({ actions: { record: true } }, [block()])))
    const b = await screen.findByTestId('loadout-block')
    expect(within(b).getByText('Synthetic gloves')).toBeTruthy()
    expect(within(b).getByText(/Owner: the Owner\. Action: provide the item/)).toBeTruthy()
    expect(within(b).queryByRole('button')).toBeNull()
    expect(screen.getAllByTestId('loadout-readiness')[0]?.textContent).toBe('Blocked: critical shortage')
    expect(screen.getByText(/Start Work is blocked for this service until the Owner/)).toBeTruthy()
  })

  it('[HH-WORK-02] the Owner starts the review with the block version', async () => {
    const fetchImpl = api(
      view({ actions: { record: false } }, [block({ actions: { startReview: true, resolve: false, cancel: true } })]),
      (url) =>
        url.endsWith('/start-review') ? json(200, { holdId: HOLD, state: 'under_review', version: 2 }) : undefined,
    )
    renderLoadout(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Start review' }))
    await waitFor(() =>
      expect(
        fetchImpl.mock.calls.some(([u]) => u === `/api/v1/staff/loadout-blocks/${HOLD}/actions/start-review`),
      ).toBe(true),
    )
    const [, init] = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/start-review')) as [string, RequestInit]
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
  })

  it('[HH-PKT-06][HH-CHG-02] a substitute affecting the customer is refused as needing a change order', async () => {
    const fetchImpl = api(
      view({ actions: { record: false } }, [
        block({ state: 'under_review', version: 2, actions: { startReview: false, resolve: true, cancel: true } }),
      ]),
      (url) =>
        url.endsWith('/resolve')
          ? json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'body', code: 'CHANGE_ORDER_REQUIRED' }] } })
          : undefined,
    )
    renderLoadout(fetchImpl)
    fireEvent.click(await screen.findByRole('radio', { name: 'Approve a named substitute' }))
    fireEvent.change(screen.getByLabelText('Substitute (name it; never "equivalent")'), {
      target: { value: 'Synthetic other gloves' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Specification' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'The customer is affected' }))
    fireEvent.change(screen.getByLabelText('How it was resolved'), { target: { value: 'Synthetic note' } })
    fireEvent.change(screen.getByLabelText('Who assessed it'), { target: { value: 'Synthetic Owner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    await screen.findByText('A substitute that affects the customer needs a change order, which is not available yet.')
    const [, init] = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/resolve')) as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      resolution: 'substitute_approved',
      resolutionNote: 'Synthetic note',
      reviewer: 'Synthetic Owner',
      substitute: 'Synthetic other gloves',
      impacts: ['specification'],
      customerAffected: true,
    })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"2"')
  })
})
