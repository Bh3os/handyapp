// Publishing, the version lifecycle and the version history in the staff builder, and the Owner's publishing setting
// (TSK-0055; HH-EST-04, T26, T32, OWN-DEC-118). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EstimateLifecycle, EstimatePublishingSetting, type Lifecycle } from '../src/EstimateLifecycle'

afterEach(cleanup)

const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const NONE = {
  publish: false,
  requestReview: false,
  returnToDraft: false,
  withdraw: false,
  expire: false,
  recordDecline: false,
  revise: false,
}
const ESTIMATOR = { id: 'staff-1', name: 'Synthetic Estimator' }
const OWNER = { id: 'staff-2', name: 'Synthetic Owner' }

function lifecycle(over: Partial<Lifecycle> = {}): Lifecycle {
  return {
    effectiveState: 'draft',
    publishedAt: null,
    publishedBy: null,
    validUntil: null,
    termsVersion: null,
    firstViewedAt: null,
    customerPdf: null,
    revisedFrom: null,
    current: null,
    actions: { ...NONE, publish: true, requestReview: true },
    history: [
      {
        versionId: V1,
        version: 1,
        state: 'draft',
        effectiveState: 'draft',
        stateChangedAt: '2026-10-21T15:00:00.000Z',
        createdBy: ESTIMATOR,
        createdAt: '2026-10-21T15:00:00.000Z',
        revisedFromVersion: null,
        lastEditedBy: ESTIMATOR,
        lastEditedAt: '2026-10-21T15:00:00.000Z',
        publishedBy: null,
        publishedAt: null,
        validUntil: null,
        totalCents: 133_333,
      },
    ],
    ...over,
  }
}
type View = { id: string; version: number; rowVersion: number; readiness: { ready: boolean }; lifecycle: Lifecycle }
const view = (over: Partial<View> = {}): View => ({
  id: V1,
  version: 1,
  rowVersion: 3,
  readiness: { ready: true },
  lifecycle: lifecycle(),
  ...over,
})

function renderPanel(v: View, fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  const onView = vi.fn()
  const go = vi.fn()
  render(
    <EstimateLifecycle
      t={t}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      view={v}
      onView={onView}
      go={go}
      href={(to) => `/staff${to}`}
    />,
  )
  return { onView, go }
}

describe('the lifecycle panel (TSK-0055, HH-EST-04)', () => {
  it('[S04] publishes only after a confirmation, with the version shown, and shows the server answer', async () => {
    const published = view({
      rowVersion: 4,
      lifecycle: lifecycle({
        effectiveState: 'published',
        publishedAt: '2026-10-21T15:00:00.000Z',
        publishedBy: ESTIMATOR,
        validUntil: '2026-11-04T15:00:00.000Z',
        termsVersion: 'test-estimate-terms-1',
        customerPdf: { sha256: 'a'.repeat(64), byteSize: 1234 },
        actions: { ...NONE, withdraw: true, expire: true, recordDecline: true, revise: true },
      }),
    })
    const fetchImpl = vi.fn(async () => json(200, published))
    const { onView } = renderPanel(view(), fetchImpl)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(fetchImpl).not.toHaveBeenCalled()
    const confirm = screen.getByRole('group', { name: 'Publish version 1 to the customer?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Publish now' }))
    await screen.findByText('Published. The customer notice is queued.')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/estimate-versions/${V1}/publish`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['if-match']).toBe('"3"')
    expect(onView).toHaveBeenCalledWith(published)
  })

  it('[HH-EST-05] Publish stays inactive with the reason while the readiness check lists something', () => {
    renderPanel(view({ readiness: { ready: false } }), vi.fn())
    const button = screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText('Resolve every reason under “Ready to publish?” first.')).toBeTruthy()
  })

  it('[T26] a refusal names every reason: the role, a NOT CONFIGURED value, a line and a review hold', async () => {
    const fetchImpl = vi.fn(async () =>
      json(409, {
        error: {
          code: 'CONFLICT',
          fieldErrors: [
            { field: 'readiness.legal.estimate_terms', code: 'NOT_CONFIGURED', message: '' },
            { field: 'lines[0]', code: 'QUANTITY_UNKNOWN', message: '' },
            { field: 'holds', code: 'REVIEW_HOLD_OPEN', message: '' },
          ],
        },
      }),
    )
    renderPanel(view(), fetchImpl)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }))
    await screen.findByText('Not done. The server refused it:')
    expect(screen.getByText('Estimate terms version is NOT CONFIGURED')).toBeTruthy()
    expect(screen.getByText('Line 1: The quantity is still unknown.')).toBeTruthy()
    expect(screen.getByText('A review hold on the request must be resolved before publishing.')).toBeTruthy()
  })

  it('withdrawing needs a written reason before anything is sent; the reason is sent with the version', async () => {
    const fetchImpl = vi.fn(async () => json(200, view()))
    renderPanel(
      view({ lifecycle: lifecycle({ effectiveState: 'published', actions: { ...NONE, withdraw: true } }) }),
      fetchImpl,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw this version' }))
    expect(await screen.findByText('Write the reason first.')).toBeTruthy()
    expect(fetchImpl).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Synthetic: wrong project.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw this version' }))
    await screen.findByText('Withdrawn. The version is kept.')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/estimate-versions/${V1}/withdraw`)
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Synthetic: wrong project.' })
  })

  it('[T32] revising opens the new version; the history shows creator, reviser and publisher', async () => {
    const fetchImpl = vi.fn(async () => json(201, { versionId: V2, version: 2 }))
    const history = [
      {
        ...lifecycle().history[0],
        state: 'superseded',
        effectiveState: 'superseded',
        publishedBy: ESTIMATOR,
        publishedAt: '2026-10-21T15:00:00.000Z',
        validUntil: '2026-11-04T15:00:00.000Z',
      },
      {
        ...lifecycle().history[0],
        versionId: V2,
        version: 2,
        state: 'published',
        effectiveState: 'published',
        createdBy: OWNER,
        revisedFromVersion: 1,
        publishedBy: OWNER,
        publishedAt: '2026-10-22T15:00:00.000Z',
        validUntil: '2026-11-05T15:00:00.000Z',
        totalCents: 107_333,
      },
    ] as Lifecycle['history']
    const { go } = renderPanel(
      view({
        lifecycle: lifecycle({
          effectiveState: 'superseded',
          current: { versionId: V2, version: 2 },
          actions: { ...NONE, revise: true },
          history,
        }),
      }),
      fetchImpl,
    )
    expect(screen.getByText('The current version of this estimate is')).toBeTruthy()
    const table = screen.getByRole('table', { name: 'Version history' })
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1] as HTMLElement).getByText('Superseded')).toBeTruthy()
    expect(within(rows[1] as HTMLElement).getByText(/^Created by Synthetic Estimator/)).toBeTruthy()
    expect(within(rows[2] as HTMLElement).getByText(/^Revised from version 1 by Synthetic Owner/)).toBeTruthy()
    expect(within(rows[2] as HTMLElement).getByText(/^Synthetic Owner,/)).toBeTruthy()
    expect(within(rows[2] as HTMLElement).getByText('$1,073.33')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Revise as a new version' }))
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith(`/estimates/${V2}`))
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['if-match']).toBeUndefined()
  })

  it('[HH-LANG-01] reads in Spanish for a Spanish-speaking staff member', () => {
    renderPanel(view(), vi.fn(), 'es')
    expect(screen.getByRole('heading', { name: 'Publicación y versiones' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeTruthy()
  })
})

describe("the Owner's publishing setting (OWN-DEC-118, T26)", () => {
  it('saves whether Estimators may publish, with the policy version shown', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? json(200, { state: 'CONFIGURED', version: 3, roles: ['owner'], estimatorsMayPublish: false })
        : json(200, { state: 'CONFIGURED', version: 2, roles: ['owner', 'estimator'], estimatorsMayPublish: true }),
    )
    const { t } = staffTranslator('en')
    render(<EstimatePublishingSetting t={t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const box = await screen.findByLabelText('Estimators may publish estimates')
    expect((box as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('The Owner can always publish.')).toBeTruthy()
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved. It applies from the next publish.')
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/staff/settings/estimate-publishing')
    expect(JSON.parse(String(init.body))).toEqual({ estimatorsMayPublish: false })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"2"')
  })

  it('shows nothing to a role the server refuses', async () => {
    const fetchImpl = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    const { t } = staffTranslator('en')
    const { container } = render(<EstimatePublishingSetting t={t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
})

describe('the customer responses (TSK-0056, HH-EST-09)', () => {
  it("[HH-EST-09][RULE-LANGUAGES] lists the customer's answers newest first, in their own words, in the staff locale", () => {
    const message = 'Synthetic: please quote the trim without paint.'
    const v = view({
      lifecycle: lifecycle({
        effectiveState: 'declined',
        customerResponses: [
          { kind: 'declined', version: 1, at: '2026-10-22T15:00:00.000Z', message: null },
          { kind: 'changes_requested', version: 1, at: '2026-10-21T16:00:00.000Z', message },
        ],
      }),
    })
    renderPanel(v, vi.fn())
    const list = screen.getByRole('list', { name: 'Customer responses' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toMatch(/^Declined, version 1, /)
    expect(items[0]?.textContent).toContain('No message or reason given.')
    expect(items[1]?.textContent).toMatch(/^Changes requested, version 1, /)
    expect(items[1]?.textContent).toContain(message)
    cleanup()
    // Spanish staff labels; the customer's words stay exactly as written.
    renderPanel(v, vi.fn(), 'es')
    const es = screen.getByRole('list', { name: 'Respuestas del cliente' })
    expect(within(es).getAllByRole('listitem')[1]?.textContent).toMatch(/^Cambios solicitados, versión 1, /)
    expect(es.textContent).toContain(message)
  })

  it('[HH-EST-09] says so when the customer has not answered', () => {
    renderPanel(view(), vi.fn())
    expect(screen.getByText('The customer has not responded to this estimate.')).toBeTruthy()
    // TSK-0057: no approval yet either.
    expect(screen.getByText('No version of this estimate is approved.')).toBeTruthy()
  })

  it('[HH-EST-06][HH-EST-08][RULE-LANGUAGES] shows the customer approval, the job and the scheduling task, in EN and ES', () => {
    const v = view({
      lifecycle: lifecycle({
        effectiveState: 'accepted',
        customerApproval: {
          version: 1,
          at: '2026-10-22T15:00:00.000Z',
          fullName: 'Synthetic Approval Customer',
          options: [3],
          totalCents: 133_497,
          depositCents: 26_699,
          termsVersion: 'estimate-terms-1',
          testMark: true,
          jobState: 'pending_preparation',
          schedulingTaskState: 'open',
        },
      }),
    })
    renderPanel(v, vi.fn())
    const group = screen.getByTestId('estimate-customer-approval')
    expect(within(group).getByText('TEST approval: not a real customer approval')).toBeTruthy()
    expect(within(group).getByText(/^Version 1 approved by Synthetic Approval Customer, /)).toBeTruthy()
    expect(within(group).getByText('$1,334.97')).toBeTruthy()
    expect(within(group).getByText('$266.99')).toBeTruthy()
    expect(within(group).getByText('Pending preparation')).toBeTruthy()
    expect(within(group).getByText('Open')).toBeTruthy()
    expect(screen.getByText(/It is not an appointment, and no deposit is marked paid\./)).toBeTruthy()
    cleanup()
    renderPanel(v, vi.fn(), 'es')
    const es = screen.getByTestId('estimate-customer-approval')
    expect(within(es).getByText(/^Versión 1 aprobada por Synthetic Approval Customer, /)).toBeTruthy()
    expect(within(es).getByText('Preparación pendiente')).toBeTruthy()
    expect(within(es).getByText('Abierta')).toBeTruthy()
  })

  it('[HH-EST-12][HH-COM-04][RULE-LANGUAGES] the approval receipt PDF and each receipt message as it truly stands, in EN and ES', () => {
    const v = view({
      lifecycle: lifecycle({
        effectiveState: 'accepted',
        customerApproval: {
          version: 1,
          at: '2026-10-22T15:00:00.000Z',
          fullName: 'Synthetic Approval Customer',
          options: [],
          totalCents: 90_000,
          depositCents: null,
          termsVersion: 'estimate-terms-1',
          testMark: true,
          jobState: 'pending_preparation',
          schedulingTaskState: 'open',
          receipt: { state: 'issued', issuedAt: '2026-10-22T15:01:00.000Z', byteSize: 4096 },
          receiptDeliveries: [
            { channel: 'email', state: 'failed', errorCode: 'template_not_configured' },
            { channel: 'sms', state: 'suppressed', errorCode: 'sms_opt_in_missing' },
          ],
        },
      }),
    })
    renderPanel(v, vi.fn())
    const group = screen.getByTestId('estimate-customer-approval')
    expect(within(group).getByTestId('approval-receipt-state').textContent).toMatch(/^Issued /)
    const messages = within(group).getByTestId('approval-receipt-deliveries')
    expect(
      within(messages).getByText('Email: Not sent (wording not configured: no owner-approved text yet)'),
    ).toBeTruthy()
    // A code without a label is shown as the code itself, never hidden.
    expect(within(messages).getByText('Text: Suppressed (sms_opt_in_missing)')).toBeTruthy()
    expect(within(group).queryByText(/^Sent$|: Sent/)).toBeNull()
    cleanup()
    renderPanel(v, vi.fn(), 'es')
    const es = screen.getByTestId('estimate-customer-approval')
    expect(within(es).getByTestId('approval-receipt-state').textContent).toMatch(/^Emitido /)
    expect(
      within(es).getByText(
        'Correo electrónico: No enviado (texto no configurado: aún no hay un texto aprobado por el propietario)',
      ),
    ).toBeTruthy()
    cleanup()
    renderPanel(
      view({
        lifecycle: lifecycle({
          effectiveState: 'accepted',
          customerApproval: {
            ...(v.lifecycle.customerApproval as object),
            receipt: { state: 'preparing', issuedAt: null, byteSize: null },
            receiptDeliveries: [],
          } as never,
        }),
      }),
      vi.fn(),
    )
    expect(screen.getByTestId('approval-receipt-state').textContent).toBe('Being prepared')
    expect(screen.getByTestId('approval-receipt-deliveries').textContent).toBe('Not recorded yet')
  })
})
