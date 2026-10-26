// Change orders on the staff app (TSK-0081; HH-CHG-01, HH-CHG-02, HH-WORK-07, T53, OWN-DEC-203). The API is a
// synthetic stand-in; every name, reason and price is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Fetch } from '../src/api'
import { ChangeOrdersPage, type ChangeOrder, type ChangeOrdersData } from '../src/ChangeOrders'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const JOB = '33333333-3333-4333-8333-333333333381'
const WP = '44444444-4444-4444-8444-444444444481'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const href = (to: string) => `/staff${to}`
const t = (locale: StaffLocale) => staffTranslator(locale).t

const ORDER: ChangeOrder = {
  changeOrderId: 'co-1',
  number: 1,
  reference: 'HH-SYNTH081-C1',
  origin: 'worker_proposal',
  createdAt: '2026-10-23T14:00:00.000Z',
  current: {
    versionId: 'v-1',
    version: 1,
    state: 'draft',
    reason: 'Synthetic: rot behind the trim',
    scope: 'Synthetic: replace one trim board',
    scheduleImpact: null,
    hazards: null,
    resources: null,
    measurements: 'Synthetic: 4 ft',
    photoIds: ['p-1'],
    affectedSteps: [{ workPackageId: WP, stepId: '3.2' }],
    base: { snapshotId: 's-1', totalCents: 80_000 },
    chargesCents: 10_000,
    creditsCents: 3_000,
    revisedTotalCents: 87_000,
    lines: [
      {
        position: 1,
        kind: 'charge',
        description: 'Synthetic trim board',
        workPackageId: WP,
        quantity: '2',
        unit: 'ea',
        unitPriceCents: 5_000,
        amountCents: 10_000,
      },
      {
        position: 2,
        kind: 'credit',
        description: 'Synthetic: one wall removed',
        workPackageId: null,
        quantity: '1',
        unit: null,
        unitPriceCents: 3_000,
        amountCents: 3_000,
      },
    ],
    draftedBy: { id: 'w-1', name: 'Synthetic Worker' },
    draftedAt: '2026-10-23T14:00:00.000Z',
    updatedAt: '2026-10-23T14:00:00.000Z',
    reviewedBy: null,
    reviewedAt: null,
    withdrawnBy: null,
    withdrawnAt: null,
    withdrawReason: null,
    issuedBy: null,
    issuedAt: null,
    validUntil: null,
    validityReason: null,
    supersededAt: null,
    expiredAt: null,
    rowVersion: 2,
  },
  ownerApproval: null,
  history: [],
  actions: {
    edit: true,
    review: false,
    reopen: false,
    withdraw: true,
    issue: false,
    requestOwnerApproval: false,
    revise: false,
    decideOwnerApproval: false,
  },
}
function data(over: Partial<ChangeOrdersData> = {}): ChangeOrdersData {
  return {
    jobId: JOB,
    reference: 'HH-SYNTH081',
    jobState: 'in_progress',
    approved: { snapshotVersion: 1, totalCents: 80_000 },
    paidCents: 20_000,
    packages: [{ id: WP, code: 'PT-01', steps: [{ id: '3.2', stage: 3, text: 'Synthetic step' }] }],
    photos: [{ id: 'p-1', workPackageId: WP, phase: 'before', areaLabel: 'Synthetic wall' }],
    changeOrders: [ORDER],
    actions: { create: true, chooseOrigin: false },
    ...over,
  }
}

describe('ChangeOrdersPage (TSK-0081)', () => {
  it('[HH-WORK-07][T53] the approved scope stays apart; a proposal is labelled not approved, with its credit', async () => {
    render(<ChangeOrdersPage t={t('en')} fetchImpl={vi.fn(async () => json(200, data()))} jobId={JOB} href={href} />)
    expect(await screen.findByRole('heading', { name: 'Change orders · HH-SYNTH081' })).toBeTruthy()
    expect(screen.getByTestId('change-orders-approved').textContent).toContain(
      'Approved total: $800.00 (approved scope version 1). Paid so far: $200.00.',
    )
    const order = screen.getByTestId('change-order')
    expect(within(order).getByRole('heading').textContent).toBe('HH-SYNTH081-C1 Draft')
    expect(within(order).getByTestId('change-order-not-approved').textContent).toBe(
      'Proposed, not approved: do not do this work and do not promise a price.',
    )
    const rows = within(order).getAllByRole('row')
    expect(rows[2]?.textContent).toContain('Credit (lowers the total)')
    expect(rows[2]?.textContent).toContain('− $30.00')
    expect(within(order).getByTestId('change-order-revised').textContent).toBe('$870.00')
    expect(within(order).getByTestId('change-order-steps-list').textContent).toBe('PT-01 Item 3.2')
    // A worker sees no origin choice and cannot review.
    expect(within(order).queryByRole('button', { name: 'Mark as reviewed' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Propose a change' }))
    const form = screen.getByTestId('change-order-form')
    expect(within(form).queryByLabelText('Where the change comes from')).toBeNull()
  })

  it('[HH-CHG-02] a worker proposes a change: lines in dollars sent as cents, steps and photos named', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST' ? json(201, { changeOrderId: 'co-2' }) : json(200, data({ changeOrders: [] })),
    )
    render(<ChangeOrdersPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Propose a change' }))
    const form = screen.getByTestId('change-order-form')
    fireEvent.change(within(form).getByLabelText('Reason for the change'), { target: { value: 'Synthetic reason' } })
    fireEvent.change(within(form).getByLabelText('Proposed scope'), { target: { value: 'Synthetic scope' } })
    const line = within(form).getByTestId('change-order-line-input')
    fireEvent.change(within(line).getByLabelText('Description'), { target: { value: 'Synthetic board' } })
    fireEvent.change(within(line).getByLabelText('Quantity'), { target: { value: '2.5' } })
    fireEvent.change(within(line).getByLabelText('Unit price (USD)'), { target: { value: '49.99' } })
    fireEvent.click(within(form).getByLabelText(/Item 3\.2/))
    fireEvent.click(within(form).getByLabelText(/Before · Synthetic wall/))
    fireEvent.click(within(form).getByRole('button', { name: 'Save the draft' }))
    await waitFor(() => expect(fetchImpl.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(true))
    const [url, init] = fetchImpl.mock.calls.find(([, i]) => i?.method === 'POST') as [string, RequestInit]
    expect(String(url)).toContain(`/staff/jobs/${JOB}/change-orders`)
    expect(JSON.parse(String(init.body))).toEqual({
      reason: 'Synthetic reason',
      scope: 'Synthetic scope',
      scheduleImpact: null,
      hazards: null,
      resources: null,
      measurements: null,
      photoIds: ['p-1'],
      affectedSteps: [{ workPackageId: WP, stepId: '3.2' }],
      lines: [
        {
          kind: 'charge',
          description: 'Synthetic board',
          workPackageId: null,
          quantity: '2.5',
          unit: null,
          unitPriceCents: 4_999,
        },
      ],
    })
  })

  it('[HH-CHG-01] an estimator reviews with If-Match; a refused review says why, in Spanish', async () => {
    const reviewable = { ...ORDER, actions: { ...ORDER.actions, review: true } }
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(409, {
            error: {
              code: 'CONFLICT',
              message: '',
              fieldErrors: [{ field: 'body.lines', code: 'CREDIT_EXCEEDS_REMAINING_CHARGE', message: '' }],
              requestId: 'r',
              retryable: false,
            },
          })
        : json(200, data({ changeOrders: [reviewable], actions: { create: true, chooseOrigin: true } })),
    )
    render(<ChangeOrdersPage t={t('es')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const order = await screen.findByTestId('change-order')
    fireEvent.click(within(order).getByRole('button', { name: 'Marcar como revisada' }))
    await waitFor(() =>
      expect(within(order).getByRole('alert').textContent).toBe(
        'El crédito es mayor que lo que queda por cobrar: el propietario se encarga de un reembolso o crédito.',
      ),
    )
    const [url, init] = fetchImpl.mock.calls.find(([, i]) => i?.method === 'POST') as [string, RequestInit]
    expect(String(url)).toContain('/staff/change-orders/co-1/actions/review')
    expect((init.headers as Record<string, string>)['if-match']).toBe('"2"')
    // Staff choose the origin of a new draft.
    fireEvent.click(screen.getByRole('button', { name: 'Redactar una orden de cambio' }))
    expect(screen.getByLabelText('De dónde viene el cambio')).toBeTruthy()
  })

  it('[HH-CHG-02][OWN-DEC-173] publishing: the Owner approval it needs, the Owner’s decision, and the issued validity', async () => {
    const reviewed: ChangeOrder = {
      ...ORDER,
      current: { ...ORDER.current, state: 'reviewed' },
      ownerApproval: {
        required: true,
        reasons: ['discretionary_credit'],
        flags: [],
        latest: { approvalId: 'a-1', state: 'pending', rowVersion: 1, comment: null },
      },
      actions: { ...ORDER.actions, edit: false, issue: true, decideOwnerApproval: true },
    }
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(200, { ok: true })
        : json(200, data({ changeOrders: [reviewed], actions: { create: true, chooseOrigin: true } })),
    )
    render(<ChangeOrdersPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const order = await screen.findByTestId('change-order')
    expect(within(order).getByTestId('change-order-owner-approval').textContent).toContain(
      'Owner approval: Waiting for the Owner',
    )
    const decision = within(order).getByTestId('change-order-owner-decision')
    fireEvent.click(within(decision).getByLabelText('Reject it'))
    fireEvent.change(within(decision).getByLabelText('Your reason (kept with the decision)'), {
      target: { value: 'Synthetic: too large a credit' },
    })
    fireEvent.click(within(decision).getByRole('button', { name: 'Record the decision' }))
    await waitFor(() =>
      expect(fetchImpl.mock.calls.some(([u]) => String(u).includes('/publication-approvals/'))).toBe(true),
    )
    const [url, init] = fetchImpl.mock.calls.find(([u]) => String(u).includes('/publication-approvals/')) as [
      string,
      RequestInit,
    ]
    expect(String(url)).toContain('/staff/publication-approvals/a-1/decision')
    expect(JSON.parse(String(init.body))).toEqual({ decision: 'reject', comment: 'Synthetic: too large a credit' })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
    cleanup()
    // Issued: the validity is shown and the version can only be revised or withdrawn.
    const issued: ChangeOrder = {
      ...ORDER,
      current: {
        ...ORDER.current,
        state: 'issued',
        issuedBy: { id: 'e-1', name: 'Synthetic Estimator' },
        issuedAt: '2026-10-23T15:00:00.000Z',
        validUntil: '2026-10-31T03:59:59.999Z',
      },
      actions: { ...ORDER.actions, edit: false, revise: true },
    }
    render(
      <ChangeOrdersPage
        t={t('en')}
        fetchImpl={vi.fn(async () => json(200, data({ changeOrders: [issued] })))}
        jobId={JOB}
        href={href}
      />,
    )
    const sent = await screen.findByTestId('change-order')
    expect(within(sent).getByRole('heading').textContent).toBe('HH-SYNTH081-C1 Sent to the customer')
    expect(within(sent).getByTestId('change-order-issued').textContent).toContain(
      'Sent to the customer by Synthetic Estimator',
    )
    expect(within(sent).getByRole('button', { name: 'Revise (replaces the sent version)' })).toBeTruthy()
    expect(within(sent).queryByRole('button', { name: 'Edit the draft' })).toBeNull()
  })

  it('[HH-CHG-02][T53] in person: a code to the verified contact, the box and the typed name; never a signature', async () => {
    const issued: ChangeOrder = {
      ...ORDER,
      current: {
        ...ORDER.current,
        state: 'issued',
        issuedBy: { id: 'e-1', name: 'Synthetic Estimator' },
        issuedAt: '2026-10-23T14:00:00.000Z',
        validUntil: '2026-10-31T04:59:59.000Z',
        rowVersion: 5,
      },
      inPersonApproval: {
        contentDigest: 'd'.repeat(64),
        totalCents: 87_000,
        termsDocumentId: 'estimate-terms-synthetic',
        termsSha256: 'e'.repeat(64),
        blockedBy: null,
        channels: [{ channel: 'email', sentTo: 's***@example.test' }],
      },
      actions: { ...ORDER.actions, edit: false, withdraw: false, captureInPersonApproval: true },
    }
    const posts: { url: string; body: Record<string, unknown> }[] = []
    let approved = false
    const fetchImpl: Fetch = async (input, init) => {
      const url = String(input)
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        posts.push({ url, body })
        if (url.endsWith('/in-person/code'))
          return json(202, {
            versionId: 'v-1',
            channel: 'email',
            sentTo: 's***@example.test',
            expiresAt: '2026-10-23T15:10:00.000Z',
          })
        if (body['code'] === '000000')
          return json(400, {
            error: {
              code: 'VALIDATION_FAILED',
              message: '',
              fieldErrors: [{ field: 'body.code', code: 'invalid_code', message: '' }],
            },
          })
        approved = true
        return json(201, { decision: 'approved' })
      }
      if (!approved) return json(200, data({ changeOrders: [issued] }))
      return json(
        200,
        data({
          changeOrders: [
            {
              ...issued,
              inPersonApproval: null,
              actions: { ...issued.actions, captureInPersonApproval: false },
              current: {
                ...issued.current,
                state: 'approved',
                customerDecision: {
                  kind: 'approved',
                  method: 'in_person_code',
                  fullName: 'Synthetic Customer',
                  reason: null,
                  codeChannel: 'email',
                  capturedBy: { id: 'w-1', name: 'Synthetic Worker' },
                  scopeVersion: 2,
                  at: '2026-10-23T15:00:00.000Z',
                },
              },
            },
          ],
        }),
      )
    }
    render(<ChangeOrdersPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const panel = await screen.findByTestId('change-order-in-person')
    expect(within(panel).queryByText(/signature/i)).not.toBeNull()
    expect(within(panel).queryByLabelText(/signature/i)).toBeNull()
    fireEvent.click(within(panel).getByRole('button', { name: 'Send code to the customer' }))
    expect(await within(panel).findByText('Code sent to s***@example.test.')).toBeTruthy()
    expect(posts[0]).toEqual({
      url: '/api/v1/staff/change-orders/co-1/in-person/code',
      body: { version: 1, channel: 'email' },
    })
    fireEvent.change(within(panel).getByLabelText('Code the customer received'), { target: { value: '000000' } })
    fireEvent.click(within(panel).getByRole('checkbox'))
    fireEvent.change(within(panel).getByLabelText(/full name/i), { target: { value: 'Synthetic Customer' } })
    fireEvent.click(within(panel).getByRole('button', { name: "Record the customer's approval" }))
    expect(await within(panel).findByRole('alert')).toHaveProperty(
      'textContent',
      'That code is not right, or it expired. Check it or send a new one.',
    )
    fireEvent.change(within(panel).getByLabelText('Code the customer received'), { target: { value: '123456' } })
    fireEvent.click(within(panel).getByRole('button', { name: "Record the customer's approval" }))
    await waitFor(() => expect(screen.getByTestId('change-order-decision')).toBeTruthy())
    expect(posts[2]?.body).toEqual({
      version: 1,
      channel: 'email',
      code: '123456',
      contentDigest: 'd'.repeat(64),
      totalCents: 87_000,
      termsDocumentId: 'estimate-terms-synthetic',
      termsSha256: 'e'.repeat(64),
      acceptTerms: true,
      fullName: 'Synthetic Customer',
    })
    expect(screen.getByTestId('change-order-decision').textContent).toContain(
      'In person, code by email, recorded by Synthetic Worker.',
    )
    expect(screen.queryByTestId('change-order-in-person')).toBeNull()
  })
})
