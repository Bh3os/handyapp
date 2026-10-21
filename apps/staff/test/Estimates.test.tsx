// The estimate builder and the request record's estimates panel (TSK-0053; HH-EST-01, HH-EST-05, T31, T58,
// RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS) and Upload an Estimate (TSK-0054; HH-EST-11, T31). The API is a synthetic
// stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EstimateBuilder, ProjectEstimates, type BuilderView, type DocumentsView } from '../src/Estimates'

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
    authoringMethod: 'written',
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
    documents: null,
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

const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const doc = (over: Partial<NonNullable<DocumentsView['original']>> = {}): NonNullable<DocumentsView['original']> => ({
  id: '77777777-7777-4777-8777-777777777777',
  role: 'original',
  source: 'uploaded',
  contentType: PDF,
  byteSize: 20480,
  sha256: 'a'.repeat(64),
  state: 'ready',
  rejectionReason: null,
  uploadedAt: '2026-10-21T12:00:00.000Z',
  ...over,
})
const documents = (over: Partial<DocumentsView> = {}): DocumentsView => ({
  original: null,
  customerPdf: null,
  pdfRequired: false,
  agreement: null,
  maxFileBytes: 15 * 1024 * 1024,
  types: [PDF, DOCX],
  ...over,
})
const TOTALS = {
  subtotalCents: 132_500,
  discount: null,
  totalCents: 132_500,
  depositState: 'required' as const,
  depositCents: 26_500,
}

describe('Upload an Estimate in the builder (TSK-0054, HH-EST-11)', () => {
  it('uploads the chosen document as raw bytes with its type and the version shown, then shows its state', async () => {
    const uploaded = builderView({
      authoringMethod: 'uploaded',
      rowVersion: 2,
      documents: documents({ original: doc({ state: 'quarantined' }) }),
    })
    const write = vi.fn<Handler>(() => json(201, uploaded))
    renderBuilder(api(builderView({ authoringMethod: 'uploaded', documents: documents() }), write))
    expect(await screen.findByText('Uploaded document with structured amounts')).toBeTruthy()
    expect(screen.getByText('No document uploaded yet.')).toBeTruthy()
    expect(screen.getByText(/A PDF or Word \(\.docx\) file of up to 15 MB\./)).toBeTruthy()
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'estimate.docx', { type: '' })
    fireEvent.change(screen.getByLabelText('Estimate document (PDF or Word)'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload the document' }))
    expect(await screen.findByText('Checking')).toBeTruthy()
    const [url, init] = write.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/estimate-versions/${VERSION_ID}/documents/original`)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(file)
    // The browser gave no type: the extension decides what is declared; the server checks the real content.
    expect((init.headers as Record<string, string>)['content-type']).toBe(DOCX)
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
    expect(screen.getByText('a'.repeat(64))).toBeTruthy()
  })

  it('shows a refused document with its reason', async () => {
    const write = vi.fn<Handler>(() =>
      json(400, { error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body', code: 'active_content' }] } }),
    )
    renderBuilder(api(builderView({ authoringMethod: 'uploaded', documents: documents() }), write))
    const file = new File([new Uint8Array([1])], 'estimate.pdf', { type: PDF })
    fireEvent.change(await screen.findByLabelText('Estimate document (PDF or Word)'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload the document' }))
    expect(
      await screen.findByText(
        'The file contains scripts, macros, embedded files or external links that are not allowed.',
      ),
    ).toBeTruthy()
  })

  it('[OWN-DEC-102] a Word original asks for the PDF of the same document: "PDF required"', async () => {
    renderBuilder(
      api(
        builderView({
          authoringMethod: 'uploaded',
          documents: documents({ original: doc({ contentType: DOCX }), pdfRequired: true }),
          readiness: { ready: false, problems: [{ code: 'PDF_REQUIRED' }, { code: 'AGREEMENT_NOT_CONFIRMED' }] },
        }),
      ),
    )
    expect(await screen.findByText('PDF required')).toBeTruthy()
    expect(screen.getByLabelText('PDF of the same document')).toBeTruthy()
    expect(screen.getByText('PDF required: upload the PDF of the Word document.')).toBeTruthy()
    expect(screen.getByText('Confirm that the document and the structured amounts agree.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the uploaded document' }).getAttribute('href')).toBe(
      `/api/v1/staff/estimate-versions/${VERSION_ID}/documents/77777777-7777-4777-8777-777777777777`,
    )
    // Nothing to confirm yet: the PDF is missing.
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  })

  it('[T31] the agree-confirmation is sent with the version shown once the documents are ready and the totals exist', async () => {
    const ready = documents({
      original: doc(),
      customerPdf: doc({
        id: '88888888-8888-4888-8888-888888888888',
        role: 'customer_pdf',
        source: 'copy_of_original',
      }),
    })
    const confirmed = builderView({
      authoringMethod: 'uploaded',
      rowVersion: 4,
      totals: TOTALS,
      documents: {
        ...ready,
        agreement: {
          confirmedBy: { id: 'staff-1', name: 'Synthetic Estimator' },
          confirmedAt: '2026-10-21T12:00:00.000Z',
          documentId: '88888888-8888-4888-8888-888888888888',
          current: true,
        },
      },
    })
    const write = vi.fn<Handler>(() => json(200, confirmed))
    renderBuilder(
      api(builderView({ authoringMethod: 'uploaded', rowVersion: 3, totals: TOTALS, documents: ready }), write),
    )
    expect(
      await screen.findByText(
        'Structured amounts: total $1,325.00; deposit $265.00; valid for 14 days from publishing.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('A copy of the uploaded PDF, byte for byte; the original stays private.')).toBeTruthy()
    const box = screen.getByRole('checkbox', {
      name: 'I checked that the document and the structured amounts agree (total, options, deposit and validity).',
    }) as HTMLInputElement
    expect(box.disabled).toBe(false)
    fireEvent.click(box)
    expect(await screen.findByText(/^Confirmed by Synthetic Estimator, /)).toBeTruthy()
    const [url, init] = write.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/estimate-versions/${VERSION_ID}/agreement`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ confirmed: true })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"3"')
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  })

  it('every version links to its customer PDF preview; a written one has no document panel', async () => {
    renderBuilder(api(builderView()))
    const link = await screen.findByRole('link', { name: 'Preview the customer PDF' })
    expect(link.getAttribute('href')).toBe(`/api/v1/staff/estimate-versions/${VERSION_ID}/customer-pdf`)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByText('Written in the staff app')).toBeTruthy()
    expect(screen.queryByText('Estimate document')).toBeNull()
  })
})

describe("the request record's estimates panel: Upload an Estimate (TSK-0054)", () => {
  it('creates an uploaded draft and opens the builder', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: 'Upload an Estimate' }))
    await waitFor(() => expect(go).toHaveBeenCalledWith(`/estimates/${VERSION_ID}`))
    const post = fetchImpl.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
    expect(post?.[0]).toBe('/api/v1/staff/projects/44444444-4444-4444-8444-444444444444/uploaded-estimates')
  })
})
