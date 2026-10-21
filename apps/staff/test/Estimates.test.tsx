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

const L1 = '66666666-6666-4666-8666-666666666661'
const L2 = '66666666-6666-4666-8666-666666666662'
const L3 = '66666666-6666-4666-8666-666666666663'
/** A synthetic saved base line on the drywall package (amount as the server computed it, or quantity x price). */
function line(id: string, description: string, unitPriceCents: number, quantity = '1', amountCents = unitPriceCents) {
  return {
    id,
    position: 1,
    kind: 'base',
    workPackageId: PACKAGE_ID,
    serviceCode: 'DW-01',
    description,
    quantity,
    unit: 'job',
    quantitySource: 'measured_on_site',
    unitPriceCents,
    amountCents,
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

  it('[HH-OPS-03][HH-API-04][RULE-MONEY-CENTS] "Review and redo my change" rebuilds the form from the current version: the stale lines are never sent, the other line and price survive', async () => {
    // Version 3, as this Estimator opened it: L1 and L2.
    const v3 = builderView({
      rowVersion: 3,
      lines: [line(L1, 'Synthetic patch', 1000), line(L2, 'Synthetic paint', 2000)],
    })
    // Version 4, saved meanwhile by the Owner: L2 repriced, L3 added with an internal cost.
    const v4 = builderView({
      rowVersion: 4,
      lines: [line(L1, 'Synthetic patch', 1000), line(L2, 'Synthetic paint', 2500), line(L3, 'Owner line', 4000)],
      internal: {
        lines: [{ lineId: L3, materialCostCents: 1200, laborCostCents: null, note: null }],
        baseMargin: null,
        markupAssumptions: null,
        estimatorNotes: null,
      },
    })
    let current = v3
    const puts: RequestInit[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') return json(200, current)
      puts.push(init)
      const ifMatch = (init.headers as Record<string, string>)['if-match']
      if (ifMatch !== `"${current.rowVersion}"`)
        return json(409, {
          error: { code: 'STALE_VERSION', fieldErrors: [], current: { version: current.rowVersion } },
        })
      return json(200, { ...current, rowVersion: current.rowVersion + 1 })
    })
    renderBuilder(fetchImpl)
    const first = await screen.findByRole('group', { name: 'Line 1' })
    fireEvent.change(within(first).getByLabelText('Description'), { target: { value: 'My stale edit' } })
    current = v4
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    const banner = await screen.findByTestId('conflict-banner')
    // The current version number is shown next to the one this person edited.
    expect(within(banner).getByRole('row', { name: 'Version 4 3' })).toBeTruthy()
    fireEvent.click(within(banner).getByRole('button', { name: 'Review and redo my change' }))
    await waitFor(() => expect(screen.queryByTestId('conflict-banner')).toBeNull())

    // The form shows version 4: the Owner's line and price, and not the refused edit.
    expect(screen.getByRole('group', { name: 'Line 3' })).toBeTruthy()
    expect(
      (within(screen.getByRole('group', { name: 'Line 2' })).getByLabelText('Unit price (USD)') as HTMLInputElement)
        .value,
    ).toBe('25.00')
    expect(
      (within(screen.getByRole('group', { name: 'Line 1' })).getByLabelText('Description') as HTMLInputElement).value,
    ).toBe('Synthetic patch')
    // The refused change is listed beside it, to enter again; it is not in the form.
    const unsaved = screen.getByTestId('estimate-unsaved')
    expect(within(unsaved).getByText('Your change was not saved')).toBeTruthy()
    expect(within(unsaved).getByText('Line you changed (Synthetic patch):')).toBeTruthy()
    expect(unsaved.textContent).toContain('Description: My stale edit')

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText('Draft saved. Amounts and totals were computed on the server.')
    const last = puts.at(-1) as RequestInit
    expect((last.headers as Record<string, string>)['if-match']).toBe('"4"')
    const body = JSON.parse(String(last.body)) as {
      lines: { id?: string; description: string; unitPriceCents: number; internalCost?: unknown }[]
    }
    expect(body.lines.map((l) => [l.id, l.description, l.unitPriceCents])).toEqual([
      [L1, 'Synthetic patch', 1000],
      [L2, 'Synthetic paint', 2500],
      [L3, 'Owner line', 4000],
    ])
    // The Owner's internal cost on L3 is sent back as stored, not wiped.
    expect(body.lines[2]?.internalCost).toEqual({ materialCostCents: 1200, laborCostCents: null, note: null })
    expect(JSON.stringify(body)).not.toContain('My stale edit')
    // A successful save clears the listed change.
    expect(screen.queryByTestId('estimate-unsaved')).toBeNull()
  })

  it('[HH-OPS-03] "Use the current values" shows the current version and drops the refused change', async () => {
    let current = builderView({ rowVersion: 3, lines: [line(L1, 'Synthetic patch', 1000)] })
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      !init?.method || init.method === 'GET'
        ? json(200, current)
        : json(409, { error: { code: 'STALE_VERSION', fieldErrors: [], current: { version: 4 } } }),
    )
    renderBuilder(fetchImpl)
    fireEvent.change(within(await screen.findByRole('group', { name: 'Line 1' })).getByLabelText('Unit price (USD)'), {
      target: { value: '99.00' },
    })
    current = builderView({ rowVersion: 4, lines: [line(L1, 'Synthetic patch', 1100)] })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use the current values' }))
    await waitFor(() => expect(screen.queryByTestId('conflict-banner')).toBeNull())
    expect((screen.getByLabelText('Unit price (USD)') as HTMLInputElement).value).toBe('11.00')
    expect(screen.queryByTestId('estimate-unsaved')).toBeNull()
  })

  it('[RULE-MONEY-CENTS][HH-EST-01] after an edit the line amount and totals are marked out of date and the saved message clears', async () => {
    const saved = builderView({
      rowVersion: 2,
      lines: [line(L1, 'Synthetic patch', 3333, '2.5', 8333)],
      totals: {
        subtotalCents: 8333,
        discount: null,
        totalCents: 8333,
        depositState: 'not_required',
        depositCents: null,
      },
    })
    renderBuilder(api(saved, () => json(200, { ...saved, rowVersion: 3 })))
    const first = await screen.findByRole('group', { name: 'Line 1' })
    expect(within(first).getByText('Line amount: $83.33')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText('Draft saved. Amounts and totals were computed on the server.')
    expect(screen.getByTestId('estimate-totals').getAttribute('data-outdated')).toBeNull()

    // A description edit changes no amount, but the saved message no longer describes the form.
    fireEvent.change(within(first).getByLabelText('Description'), { target: { value: 'Synthetic patch, edited' } })
    expect(screen.queryByText('Draft saved. Amounts and totals were computed on the server.')).toBeNull()
    expect(within(first).getByText('Line amount: $83.33')).toBeTruthy()
    expect(screen.queryByText(/These totals, options and amounts are from the last save/)).toBeNull()

    // A quantity edit: the amount and the totals are the last save's, and say so.
    fireEvent.change(within(first).getByLabelText('Quantity'), { target: { value: '3' } })
    expect(within(first).queryByText('Line amount: $83.33')).toBeNull()
    expect(within(first).getByText('Line amount when last saved: $83.33. Save to update it.')).toBeTruthy()
    expect(
      screen.getByText(
        'These totals, options and amounts are from the last save and do not include your unsaved changes. Save the draft to update them.',
      ),
    ).toBeTruthy()
    expect(screen.getByTestId('estimate-totals').getAttribute('data-outdated')).toBe('true')
    // Back to the saved quantity: current again.
    fireEvent.change(within(first).getByLabelText('Quantity'), { target: { value: '2.5' } })
    expect(within(first).getByText('Line amount: $83.33')).toBeTruthy()
    // Adding or removing a line, or a price or line-type change, also outdates the totals.
    fireEvent.change(within(first).getByLabelText('Unit price (USD)'), { target: { value: '40.00' } })
    expect(screen.getByTestId('estimate-totals').getAttribute('data-outdated')).toBe('true')
  })

  it('[HH-EST-03][RULE-MONEY-CENTS] refuses a negative internal cost and a unit price of $0.00 or less before anything is sent', async () => {
    const write = vi.fn<Handler>(() => json(500, {}))
    renderBuilder(api(builderView({ lines: [line(L1, 'Synthetic patch', 1000)] }), write))
    const first = await screen.findByRole('group', { name: 'Line 1' })
    fireEvent.change(within(first).getByLabelText('Material cost (USD, staff only)'), { target: { value: '-5' } })
    fireEvent.change(within(first).getByLabelText('Labor cost (USD, staff only)'), { target: { value: '0' } })
    fireEvent.change(within(first).getByLabelText('Unit price (USD)'), { target: { value: '-1.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    const material = await within(first).findByLabelText('Material cost (USD, staff only)')
    expect(material.getAttribute('aria-invalid')).toBe('true')
    expect(within(first).getByText('Cannot be negative.')).toBeTruthy()
    // $0.00 is a valid internal cost; a unit price must be above $0.00.
    expect(within(first).getByLabelText('Labor cost (USD, staff only)').getAttribute('aria-invalid')).toBeNull()
    expect(within(first).getByText('Must be above zero.')).toBeTruthy()
    expect(write).not.toHaveBeenCalled()
    fireEvent.change(within(first).getByLabelText('Unit price (USD)'), { target: { value: '0' } })
    fireEvent.change(within(first).getByLabelText('Material cost (USD, staff only)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(within(first).getByText('Must be above zero.')).toBeTruthy())
    expect(within(first).queryByText('Cannot be negative.')).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  it('[HH-EST-03][HH-EST-01] server field errors are shown on the cost, cost-note, line and lines fields; any other one is listed', async () => {
    const lines = [line(L1, 'Synthetic patch', 1000), line(L2, 'Synthetic paint', 2000)]
    const fieldErrors = [
      { field: 'lines[0].internalCost.materialCostCents', code: 'NEGATIVE_AMOUNT', message: '' },
      { field: 'lines[0].internalCost.laborCostCents', code: 'NOT_INTEGER_CENTS', message: '' },
      { field: 'lines[0].internalCost.note', code: 'TOO_LONG', message: '' },
      { field: 'lines[1].id', code: 'LINE_NOT_FOUND', message: '' },
      { field: 'lines[1].unitPriceCents', code: 'AMOUNT_TOO_LARGE', message: '' },
      { field: 'lines', code: 'TOTAL_TOO_LARGE', message: '' },
      { field: 'texts.exclusions[0]', code: 'TOO_LONG', message: '' },
      { field: 'internal.estimatorNotes', code: 'TOO_LONG', message: '' },
      { field: 'projectId', code: 'PROJECT_NOT_OPEN', message: '' },
    ]
    renderBuilder(api(builderView({ lines }), () => json(400, { error: { code: 'VALIDATION_FAILED', fieldErrors } })))
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }))
    const first = await screen.findByRole('group', { name: 'Line 1' })
    await waitFor(() =>
      expect(within(first).getByLabelText('Material cost (USD, staff only)').getAttribute('aria-invalid')).toBe('true'),
    )
    expect(within(first).getByText('Cannot be negative.')).toBeTruthy()
    expect(within(first).getByLabelText('Labor cost (USD, staff only)').getAttribute('aria-invalid')).toBe('true')
    expect(within(first).getByText('Enter dollars and cents, for example 125.50.')).toBeTruthy()
    expect(within(first).getByLabelText('Cost note (staff only)').getAttribute('aria-invalid')).toBe('true')
    const second = screen.getByRole('group', { name: 'Line 2' })
    expect(within(second).getByText('This line is no longer part of the version. Reload.')).toBeTruthy()
    expect(within(second).getByText('The line amount is too large.')).toBeTruthy()
    expect(screen.getByText('The total is too large.')).toBeTruthy()
    expect(screen.getByLabelText('Exclusions').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Estimator notes').getAttribute('aria-invalid')).toBe('true')
    // No raw code is shown; the error no field shows is listed with the error.
    expect(screen.queryByText(/[A-Z]+_[A-Z_]+/)).toBeNull()
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('The project is not open.')).toBeTruthy()
    expect(within(alert).getByText('Check the highlighted fields.')).toBeTruthy()
  })

  it('[RULE-LANGUAGES] the too-large amount errors have Spanish labels', async () => {
    const fieldErrors = [
      { field: 'lines[0].unitPriceCents', code: 'AMOUNT_TOO_LARGE', message: '' },
      { field: 'lines', code: 'TOTAL_TOO_LARGE', message: '' },
    ]
    renderBuilder(
      api(builderView({ lines: [line(L1, 'Synthetic patch', 1000)] }), () =>
        json(400, { error: { code: 'VALIDATION_FAILED', fieldErrors } }),
      ),
      'es',
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('El importe de la línea es demasiado grande.')).toBeTruthy()
    expect(screen.getByText('El total es demasiado grande.')).toBeTruthy()
  })

  it('[HH-EST-05][FACT-PRICING-DISCOUNTS] a saved discount whose rule is NOT CONFIGURED is named and can be removed so the draft saves', async () => {
    const view = builderView({
      lines: [line(L1, 'Synthetic patch', 1000)],
      discountCategory: 'military',
      document: { ...builderView().document, discountCategories: null },
    })
    const refused = {
      error: {
        code: 'VALIDATION_FAILED',
        fieldErrors: [{ field: 'discountCategory', code: 'DISCOUNT_NOT_CONFIGURED', message: '' }],
      },
    }
    const write = vi.fn<Handler>((_url, init) =>
      JSON.parse(String(init?.body)).discountCategory === null
        ? json(200, { ...view, rowVersion: 3, discountCategory: null })
        : json(400, refused),
    )
    renderBuilder(api(view, write))
    const panel = await screen.findByTestId('estimate-discount-not-configured')
    expect(within(panel).getByText('NOT CONFIGURED')).toBeTruthy()
    expect(within(panel).getByText('Saved discount: Military')).toBeTruthy()
    // Saving it as it is: the server's reason is shown in the discount panel.
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await within(panel).findByText('The discount rule is NOT CONFIGURED.')).toBeTruthy()
    // Removing it is the person's choice, said in words; the next save sends no category.
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove the discount' }))
    expect(within(panel).getByText('The saved discount will be removed when you save the draft.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText('Draft saved. Amounts and totals were computed on the server.')
    const body = JSON.parse(String((write.mock.calls.at(-1) as [string, RequestInit])[1].body)) as {
      discountCategory: unknown
    }
    expect(body.discountCategory).toBeNull()
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
