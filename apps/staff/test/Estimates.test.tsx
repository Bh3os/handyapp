// The estimate builder and the request record's estimates panel (TSK-0053; HH-EST-01, HH-EST-05, T31, T58,
// RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EstimateBuilder, ProjectEstimates, type BuilderView } from '../src/Estimates'

afterEach(cleanup)

const VERSION_ID = '11111111-1111-4111-8111-111111111111'
const PACKAGE_ID = '22222222-2222-4222-8222-222222222222'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function builderView(over: Partial<BuilderView> = {}): BuilderView {
  return {
    id: VERSION_ID,
    estimateId: '33333333-3333-4333-8333-333333333333',
    estimateNumber: 'HH-7K2M9Q4D-E1',
    version: 1,
    state: 'draft',
    rowVersion: 1,
    project: { id: '44444444-4444-4444-8444-444444444444', reference: 'HH-7K2M9Q4D', state: 'open' },
    customer: { name: 'Synthetic Customer' },
    property: { street: '100 Synthetic Way', unit: null, city: 'Testville', state: 'KY', zip: '40000' },
    request: { id: '55555555-5555-4555-8555-555555555555', reference: 'HH-7K2M9Q4D' },
    preparedBy: { id: 'staff-1', name: 'Synthetic Estimator' },
    lines: [],
    texts: { assumptions: [], exclusions: [], customerResponsibilities: [], dependencies: [], scheduleAssumptions: [] },
    discountCategory: null,
    totals: null,
    paymentTerm: 'due_on_receipt',
    document: {
      issuerName: 'Handyhub LLC',
      mailingAddress: null,
      validityDays: 14,
      termsDocumentId: null,
      discountCategories: ['military', 'senior', 'returning_customer'],
    },
    workPackages: [{ id: PACKAGE_ID, serviceCode: 'DW-01', position: 1 }],
    readiness: {
      ready: false,
      problems: [
        { code: 'NOT_CONFIGURED', key: 'legal.estimate_terms', sourceIds: ['HH-EST-13', 'OQ-ATTORNEY-TERMS'] },
        { code: 'NO_LINES' },
      ],
    },
    internal: { lines: [], baseMargin: null, markupAssumptions: null, estimatorNotes: null },
    canEdit: true,
    ...over,
  }
}

type Handler = (url: string, init?: RequestInit) => Response
function api(view: BuilderView, write?: Handler) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return write?.(url, init) ?? json(500, {})
    return json(200, view)
  })
}
function renderBuilder(fetchImpl: ReturnType<typeof api>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  return render(
    <EstimateBuilder
      t={t}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      id={VERSION_ID}
      go={vi.fn()}
      href={(to) => `/staff${to}`}
    />,
  )
}

describe('the estimate builder (TSK-0053, HH-EST-01, HH-EST-05)', () => {
  it('[T58][HH-EST-05] shows the configured issuer and validity, omits the missing address and names what is NOT CONFIGURED', async () => {
    renderBuilder(api(builderView()))
    await screen.findByRole('heading', { level: 1, name: 'Estimate HH-7K2M9Q4D-E1' })
    const doc = screen.getByTestId('estimate-document')
    expect(within(doc).getByText('Handyhub LLC')).toBeTruthy()
    expect(within(doc).getByText('Not provided: the address line is left out.')).toBeTruthy()
    expect(within(doc).getByText('14 days from publishing')).toBeTruthy()
    expect(within(doc).getByText('Payment due on receipt')).toBeTruthy()
    // The terms are missing: shown as such, never filled in.
    expect(within(doc).getByText('NOT CONFIGURED')).toBeTruthy()
    expect(screen.getByText('Estimate terms version is NOT CONFIGURED (HH-EST-13, OQ-ATTORNEY-TERMS)')).toBeTruthy()
    expect(screen.getByText('Add at least one base-scope line.')).toBeTruthy()
    expect(screen.queryByText(/tax/i)).toBeNull()
    expect(screen.queryByText(/minimum/i)).toBeNull()
  })

  it('[T31][RULE-MONEY-CENTS] sends a typed price as integer cents with the version shown, then shows the server totals', async () => {
    const saved = builderView({
      rowVersion: 2,
      lines: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          position: 1,
          kind: 'base',
          workPackageId: PACKAGE_ID,
          serviceCode: 'DW-01',
          description: 'Synthetic patch',
          quantity: '2.5',
          unit: 'sq ft',
          quantitySource: 'measured_on_site',
          unitPriceCents: 3333,
          amountCents: 8333,
        },
      ],
      totals: {
        subtotalCents: 8333,
        discount: { category: 'military', percentBps: 1000, amountCents: 833 },
        totalCents: 7500,
        depositState: 'not_required',
        depositCents: null,
      },
      discountCategory: 'military',
      readiness: {
        ready: false,
        problems: [{ code: 'NOT_CONFIGURED', key: 'legal.estimate_terms', sourceIds: ['HH-EST-13'] }],
      },
    })
    const write = vi.fn<Handler>(() => json(200, saved))
    renderBuilder(api(builderView(), write))
    fireEvent.click(await screen.findByRole('button', { name: 'Add a line to Patching & Repair' }))
    const line = screen.getByRole('group', { name: 'Line 1' })
    fireEvent.change(within(line).getByLabelText('Description'), { target: { value: 'Synthetic patch' } })
    fireEvent.change(within(line).getByLabelText('Quantity'), { target: { value: '2.5' } })
    fireEvent.change(within(line).getByLabelText('Unit'), { target: { value: 'sq ft' } })
    fireEvent.change(within(line).getByLabelText('Quantity source'), { target: { value: 'measured_on_site' } })
    fireEvent.change(within(line).getByLabelText('Unit price (USD)'), { target: { value: '33.33' } })
    fireEvent.change(screen.getByLabelText('Discount category'), { target: { value: 'military' } })
    fireEvent.change(screen.getByLabelText('Exclusions'), { target: { value: 'Synthetic exclusion\n\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText('Draft saved. Amounts and totals were computed on the server.')
    const [url, init] = write.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/estimate-versions/${VERSION_ID}/draft`)
    expect(init.method).toBe('PUT')
    const headers = init.headers as Record<string, string>
    expect(headers['if-match']).toBe('"1"')
    expect(headers['idempotency-key']).toMatch(/^staff-/)
    const body = JSON.parse(String(init.body)) as {
      lines: Record<string, unknown>[]
      discountCategory: string
      texts: Record<string, string[]>
    }
    expect(body.lines).toEqual([
      {
        kind: 'base',
        workPackageId: PACKAGE_ID,
        description: 'Synthetic patch',
        quantity: '2.5',
        unit: 'sq ft',
        quantitySource: 'measured_on_site',
        unitPriceCents: 3333,
        internalCost: { materialCostCents: null, laborCostCents: null, note: null },
      },
    ])
    expect(body.discountCategory).toBe('military')
    expect(body.texts['exclusions']).toEqual(['Synthetic exclusion'])
    // No amount or total is ever sent.
    expect(JSON.stringify(body)).not.toMatch(/amountCents|totalCents|subtotal/)
    const totals = screen.getByTestId('estimate-totals')
    expect(within(totals).getByText('$83.33')).toBeTruthy()
    expect(within(totals).getByText('Discount (Military) -10%')).toBeTruthy()
    expect(within(totals).getByText('-$8.33')).toBeTruthy()
    expect(within(totals).getByText('$75.00')).toBeTruthy()
    expect(within(totals).getByText('Not required under the deposit rule')).toBeTruthy()
    expect(screen.getByText('Line amount: $83.33')).toBeTruthy()
  })

  it('[RULE-MONEY-CENTS] refuses a price that is not exact cents before anything is sent', async () => {
    const write = vi.fn<Handler>(() => json(500, {}))
    renderBuilder(api(builderView(), write))
    fireEvent.click(await screen.findByRole('button', { name: 'Add a line to Patching & Repair' }))
    fireEvent.change(screen.getByLabelText('Unit price (USD)'), { target: { value: '12.345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect((await screen.findAllByText('Enter dollars and cents, for example 125.50.')).length).toBeGreaterThan(0)
    expect(write).not.toHaveBeenCalled()
  })

  it('[HH-API-04] a stale save shows the conflict banner and overwrites nothing', async () => {
    const write = vi.fn<Handler>(() =>
      json(409, { error: { code: 'STALE_VERSION', fieldErrors: [], current: { version: 3 } } }),
    )
    renderBuilder(api(builderView(), write))
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }))
    expect(await screen.findByTestId('conflict-banner')).toBeTruthy()
  })

  it('[HH-EST-03] without the internal-cost permission no internal field is shown or sent', async () => {
    const write = vi.fn<Handler>(() => json(200, builderView({ internal: null, rowVersion: 2 })))
    renderBuilder(api(builderView({ internal: null }), write))
    fireEvent.click(await screen.findByRole('button', { name: 'Add a line to Patching & Repair' }))
    expect(screen.queryByText('Internal (staff only)')).toBeNull()
    expect(screen.queryByLabelText('Material cost (USD, staff only)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const body = String((write.mock.calls[0] as [string, RequestInit])[1].body)
    expect(body).not.toMatch(/internal/)
  })

  it('[RULE-LANGUAGES] Spanish staff see the builder in Spanish', async () => {
    renderBuilder(api(builderView()), 'es')
    await screen.findByRole('heading', { level: 1, name: 'Presupuesto HH-7K2M9Q4D-E1' })
    expect(screen.getByText('Guardar borrador')).toBeTruthy()
    expect(screen.getByText('14 días desde la publicación')).toBeTruthy()
  })
})

describe("the request record's estimates panel (TSK-0053)", () => {
  it('Write an Estimate creates the draft and opens the builder', async () => {
    const go = vi.fn()
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(201, { estimateId: 'e', number: 'HH-7K2M9Q4D-E1', versionId: VERSION_ID, version: 1, rowVersion: 1 })
        : json(200, { projectId: 'p', canWrite: true, estimates: [] }),
    )
    const { t } = staffTranslator('en')
    render(
      <ProjectEstimates
        t={t}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        projectId="44444444-4444-4444-8444-444444444444"
        go={go}
        href={(to) => `/staff${to}`}
      />,
    )
    expect(await screen.findByText('No estimate has been written for this project yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Write an Estimate' }))
    await waitFor(() => expect(go).toHaveBeenCalledWith(`/estimates/${VERSION_ID}`))
  })

  it('is hidden for a role that may not write estimates', async () => {
    const fetchImpl = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    const { t } = staffTranslator('en')
    const { container } = render(
      <ProjectEstimates
        t={t}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        projectId="44444444-4444-4444-8444-444444444444"
        go={vi.fn()}
        href={(to) => `/staff${to}`}
      />,
    )
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
