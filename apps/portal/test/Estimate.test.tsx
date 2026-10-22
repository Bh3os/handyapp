// The customer estimate view and estimate terms v1.0 in the portal (TSK-0056; HH-EST-06, HH-EST-09, HH-EST-13,
// HH-PORT-10, HH-ID-07, OWN-DEC-127, RULE-NO-INVENTED-FACTS, RULE-LANGUAGES). The API is a synthetic stand-in; every
// reference, amount and text is invented for the test (RULE-SYNTHETIC-DATA).
import { ESTIMATE_TERMS, legalKeys } from '@handyhub/domain/legal'
import { CATALOGS } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App, routeOf } from '../src/App'
import { parseEstimate, parseTab, type Fetch } from '../src/api'
import { termsValues } from '../src/Terms'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const REF = 'HH-7K2M9Q4D'
const NUMBER = `${REF}-E1`
const NOW = '2026-10-21T15:00:00.000Z'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const overview = {
  reference: REF,
  services: ['Patching & Repair'],
  notSure: false,
  submittedAt: '2026-10-20T14:00:00.000Z',
  status: {
    situation: 'estimate_ready',
    step: 'review_estimate',
    waitingOn: 'customer',
    nextAction: 'review_estimate',
    since: NOW,
    text: null,
  },
  timeline: [{ kind: 'received', at: '2026-10-20T14:00:00.000Z', text: null }],
  appointment: null,
  payment: { state: 'none' },
  refreshedAt: NOW,
  refreshSeconds: 0,
}

const DIGEST = 'c'.repeat(64)
const BASE_SELECTION = {
  options: [],
  subtotalCents: 127_500,
  reductionCents: 0,
  totalCents: 127_500,
  deposit: { state: 'required', amountCents: 25_500 },
}
const estimate = (over: Record<string, unknown> = {}) => ({
  reference: REF,
  number: NUMBER,
  version: 1,
  status: 'current',
  issuerName: 'Handyhub LLC',
  publishedAt: '2026-10-21T14:00:00.000Z',
  validUntil: '2026-11-05T04:59:59.999Z',
  validUntilZone: { zone: 'America/Chicago', business: false },
  lines: [
    {
      position: 1,
      kind: 'base',
      serviceCode: 'DW-01',
      description: 'Synthetic: patch the hole',
      quantity: '2',
      unit: 'patch',
      unitPriceCents: 1250,
      amountCents: 2500,
    },
    {
      position: 2,
      kind: 'add_on',
      serviceCode: 'PT-01',
      description: 'Synthetic optional trim',
      quantity: '3',
      unit: 'door',
      unitPriceCents: 1999,
      amountCents: 5997,
    },
  ],
  assumptions: [],
  exclusions: ['Synthetic: moving furniture'],
  customerResponsibilities: [],
  dependencies: [],
  scheduleAssumptions: [],
  subtotalCents: 127_500,
  reduction: null,
  totalCents: 127_500,
  deposit: { state: 'required', amountCents: 25_500 },
  paymentTerm: 'due_on_receipt',
  document: null,
  terms: { documentId: 'estimate-terms-1', state: 'not_in_effect' },
  approval: {
    available: false,
    reasons: ['terms_not_in_effect'],
    current: null,
    contentDigest: DIGEST,
    selection: BASE_SELECTION,
    approved: null,
    nextStep: null,
    receipt: null,
  },
  actions: { requestChanges: true, decline: true, requestUpdate: false },
  freshVerification: true,
  responses: [],
  testMark: true,
  refreshedAt: NOW,
  refreshSeconds: 0,
  ...over,
})

type Call = { url: string; init?: RequestInit | undefined }
/** The Documents tab's receipt state of the listed version (TSK-0058). */
let documentsReceipt: 'preparing' | 'issued' | null = null
/** A fetch answering the overview, the documents tab and the estimate view; POSTs answer with `post`. */
function api(opts: { detail?: () => unknown; post?: (c: Call) => Response } = {}) {
  const calls: Call[] = []
  let detail = opts.detail ?? (() => estimate())
  const fetchImpl: Fetch = async (url, init) => {
    calls.push({ url, init })
    if (init?.method === 'POST') return opts.post ? opts.post({ url, init }) : json(500, {})
    if (url.endsWith('/overview')) return json(200, overview)
    if (url.endsWith('/documents'))
      return json(200, {
        reference: REF,
        refreshedAt: NOW,
        refreshSeconds: 0,
        state: 'listed',
        estimates: [
          {
            number: NUMBER,
            version: 1,
            status: 'current',
            publishedAt: '2026-10-21T14:00:00.000Z',
            validUntil: '2026-11-05T04:59:59.999Z',
            totalCents: 127_500,
            receipt: documentsReceipt,
          },
        ],
      })
    if (url.includes('/versions/')) return json(200, detail())
    if (url.endsWith('/customer/session/verification'))
      return json(200, {
        fresh: false,
        freshUntil: NOW,
        channels: [{ channel: 'email', destination: 's***@example.test' }],
      })
    return json(404, { error: { code: 'NOT_FOUND' } })
  }
  return { fetchImpl, calls, setDetail: (d: () => unknown) => (detail = d) }
}
const open = (fetchImpl: Fetch, path = `/portal/p/${REF}/documents/${NUMBER}/1`) =>
  render(<App path={path} fetchImpl={fetchImpl} />)

/** The English text of every key of the terms, with the document's values, as the portal renders it. */
function termsText(): string {
  const values = termsValues(ESTIMATE_TERMS)
  return legalKeys(ESTIMATE_TERMS)
    .map((k) => {
      const raw = CATALOGS['customer.en'][k as keyof (typeof CATALOGS)['customer.en']] as string
      return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(values[name]))
    })
    .join('\n')
}

describe('estimate terms v1.0 (TSK-0056, HH-EST-13, OWN-DEC-127)', () => {
  it('[HH-EST-13] every section is written, in numbered order, stating the decided values from the policy data', () => {
    const text = termsText()
    for (const k of legalKeys(ESTIMATE_TERMS)) expect(CATALOGS['customer.en'], k).toHaveProperty(k)
    expect(ESTIMATE_TERMS.sections.map((s) => s.id)).toEqual([
      'validity',
      'price',
      'deposit',
      'payment',
      'scope',
      'appointments',
      'safety',
      'completion',
      'reopen',
      'messages',
      'photos',
      'privacy',
      'approval-record',
      'business',
    ])
    expect(text).toContain('valid for 14 days')
    expect(text).toContain('over $1,000.00, a deposit of 20% of that total')
    expect(text).toContain('credited to your final invoice')
    expect(text).toContain('Payment does not guarantee a particular date.')
    expect(text).toContain('payment is due when you receive it')
    expect(text).toContain('Square')
    expect(text).toContain('no separate tax line')
    expect(text).toContain('There is no minimum charge.')
    expect(text).toContain('nothing extra is added for paying by card')
    expect(text).toContain('in the 30 days after it closed')
    expect(text).toContain('Handyhub LLC')
    // No number is typed into the wording: every amount, day count and percent is a placeholder.
    for (const k of legalKeys(ESTIMATE_TERMS)) {
      const raw = CATALOGS['customer.en'][k as keyof (typeof CATALOGS)['customer.en']] as string
      expect(raw.replace(/\{\w+\}/g, ''), k).not.toMatch(/\$\s?\d|\b\d+\s?(%|days?|hours?)\b/)
    }
  })

  it('[OWN-DEC-127][RULE-HUMAN-REVIEW] negative list: no clause the owner did not decide is in the text', () => {
    const text = termsText()
    // Only the owner's own deposit sentence may say "guarantee", and only as "does not guarantee" (OWN-DEC-104).
    const rest = text.replace('Payment does not guarantee a particular date.', '')
    for (const banned of [
      /warrant/i,
      /guarant/i,
      /liabil/i,
      /indemn/i,
      /arbitrat/i,
      /\bvenue\b/i,
      /jurisdiction/i,
      /governing law/i,
      /late fee/i,
      /\binterest\b/i,
      /forfeit/i,
      /refund/i,
      /cancellation fee/i,
      /\bdamage/i,
      /insur/i,
      /\bbonded\b/i,
      /\b(we are|is|are) licensed\b/i,
      /\bcertified\b/i,
    ])
      expect(rest, String(banned)).not.toMatch(banned)
    // The next version (attorney-reviewed wording) adds the cancellation rules and the 90-day warranty: not v1.0.
    expect(text).not.toMatch(/90-day|\$50\.00|24 hours/)
  })

  it('[HH-EST-13][OWN-DEC-187] the page of its own: numbered sections, and no TEST banner after the owner sign-off', async () => {
    open(api().fetchImpl, '/portal/terms/estimate-terms-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Estimate Terms' })).toBeTruthy()
    // TSK-0144: the owner approved v1.0 (OWN-DEC-187): the "wording pending owner approval" banner is gone.
    expect(screen.queryByText('TEST — wording pending owner approval for real customer use')).toBeNull()
    expect(screen.queryByText(/are a draft and are not in effect yet/)).toBeNull()
    const sections = document.querySelectorAll('.portal-terms__sections > li')
    expect(sections).toHaveLength(14)
    expect(screen.getByText('Version 1.0, prepared October 21, 2026. Document ID: estimate-terms-1.')).toBeTruthy()
    // An ID this software holds no wording for: a truthful "not available", never other wording.
    cleanup()
    open(api().fetchImpl, '/portal/terms/test-estimate-terms-1')
    expect(await screen.findByText("These terms aren't available")).toBeTruthy()
    expect(document.querySelector('.portal-terms')).toBeNull()
  })
})

describe('portal routes and parsers (TSK-0056)', () => {
  it('[HH-PORT-10] an estimate version has its own page below the Documents tab; the terms one of their own', () => {
    expect(routeOf(`/portal/p/${REF}/documents/${NUMBER}/2`)).toEqual({
      page: 'project',
      reference: REF,
      tab: 'documents',
      estimate: { number: NUMBER, version: 2 },
    })
    // Another project's estimate number, a malformed number or version: not an estimate page.
    expect(routeOf(`/portal/p/${REF}/documents/HH-0000TEST-E1/1`)).toEqual({ page: 'projects' })
    expect(routeOf(`/portal/p/${REF}/documents/${NUMBER}/0`)).toEqual({ page: 'projects' })
    expect(routeOf('/portal/terms/estimate-terms-1')).toEqual({ page: 'terms', documentId: 'estimate-terms-1' })
  })

  it('[HH-PORT-06] an answer that is not the declared view is a failure, never shown as data', () => {
    expect(parseEstimate(estimate())).not.toBeNull()
    // TSK-0057: approval offered with a reason against it, or without the content digest, is not the declared view.
    const approval = (estimate() as { approval: Record<string, unknown> }).approval
    expect(parseEstimate(estimate({ approval: { ...approval, available: true } }))).toBeNull()
    expect(
      parseEstimate(estimate({ approval: { ...approval, available: true, reasons: [], contentDigest: 'x' } })),
    ).toBeNull()
    expect(parseEstimate(estimate({ approval: { ...approval, available: true, reasons: [] } }))).not.toBeNull()
    expect(
      parseEstimate(estimate({ approval: { ...approval, selection: { ...BASE_SELECTION, totalCents: 1.5 } } })),
    ).toBeNull()
    expect(parseEstimate(estimate({ lines: [{ ...(estimate().lines[0] as object), position: 0 }] }))).toBeNull()
    expect(parseEstimate(estimate({ totalCents: 12.5 }))).toBeNull()
    expect(parseEstimate(estimate({ status: 'accepted' }))).toBeNull()
    expect(parseEstimate(estimate({ terms: { documentId: null, state: 'binding' } }))).toBeNull()
    const head = { reference: REF, refreshedAt: NOW, refreshSeconds: 0 }
    expect(parseTab('documents', { ...head, state: 'listed', estimates: [] })).toBeNull()
    expect(parseTab('documents', { ...head, state: 'none' })).toEqual({ ...head, tab: 'documents', state: 'none' })
  })
})

describe('the customer estimate view (TSK-0056, HH-EST-06, HH-EST-09)', () => {
  it('[HH-PORT-10] the Documents tab lists the version with its status; Review this estimate opens the tab', async () => {
    const { fetchImpl } = api()
    open(fetchImpl, `/portal/p/${REF}`)
    const review = await screen.findByRole('link', { name: 'Review this estimate' })
    expect(review.getAttribute('href')).toBe(`/portal/p/${REF}/documents`)
    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }))
    const link = await screen.findByRole('link', { name: `Estimate ${NUMBER}, version 1` })
    expect(link.getAttribute('href')).toBe(`/portal/p/${REF}/documents/${NUMBER}/1`)
    const item = link.closest('li') as HTMLElement
    expect(within(item).getByText('Current')).toBeTruthy()
    expect(within(item).getByText(/Total: \$1,275\.00/)).toBeTruthy()
    fireEvent.click(link)
    expect(await screen.findByRole('heading', { name: `Estimate ${NUMBER}` })).toBeTruthy()
    expect(window.location.pathname).toBe(`/portal/p/${REF}/documents/${NUMBER}/1`)
  })

  it('[HH-EST-06][HH-EST-13] shows the exact version, the TEST mark, the terms in full and why it cannot be approved', async () => {
    open(api().fetchImpl)
    // The first render of the file also loads the app's modules: under a loaded parallel run that alone can pass the
    // default 1 s wait, so this first read waits longer (the assertions are unchanged).
    expect(await screen.findByText('Version 1: Current', undefined, { timeout: 5_000 })).toBeTruthy()
    expect(screen.getByText('TEST — not a real invoice or estimate')).toBeTruthy()
    expect(screen.getByText('Handyhub LLC')).toBeTruthy()
    expect(screen.getByText('Synthetic: patch the hole')).toBeTruthy()
    expect(screen.getByText('Optional add-on: Synthetic optional trim')).toBeTruthy()
    const totals = screen.getByTestId('estimate-totals')
    expect(within(totals).getAllByText('$1,275.00')).toHaveLength(2)
    expect(within(totals).getByText('$255.00')).toBeTruthy()
    expect(within(totals).getByText('Payment due on receipt')).toBeTruthy()
    expect(screen.getByText('Synthetic: moving furniture')).toBeTruthy()
    // The terms: the banner, the full text in an expandable section and a link to their own page.
    const terms = screen.getByTestId('estimate-terms')
    expect(within(terms).getByText('TEST — wording pending owner approval for real customer use')).toBeTruthy()
    expect(within(terms).getByText('Read the estimate terms in full')).toBeTruthy()
    expect(terms.querySelectorAll('.portal-terms__sections > li')).toHaveLength(14)
    expect(
      within(terms).getByRole('link', { name: 'Open the estimate terms on their own page' }).getAttribute('href'),
    ).toBe('/portal/terms/estimate-terms-1')
    // Terms not in effect: no approval control at all; every reason is written out, and silence never approves.
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    expect(screen.getByText("This estimate can't be approved here yet.")).toBeTruthy()
    expect(screen.getByText("The wording of the estimate terms is waiting for the owner's approval.")).toBeTruthy()
    expect(screen.getByText('Not answering never approves an estimate.')).toBeTruthy()
  })

  it('[HH-SCH-02][OWN-DEC-159] the end of validity is shown with its time in the property zone, or as business time', async () => {
    // 2026-11-05T04:59:59.999Z is the end of November 4 in business time (EST); in a Central property it reads 10:59 PM CST.
    open(api().fetchImpl)
    const valid = await screen.findByTestId('estimate-valid-until', undefined, { timeout: 5_000 })
    expect(valid.textContent).toMatch(/^November 4, 2026.*10:59\sPM CST$/)
    cleanup()
    open(
      api({ detail: () => estimate({ validUntilZone: { zone: 'America/Kentucky/Louisville', business: true } }) })
        .fetchImpl,
    )
    const business = await screen.findByTestId('estimate-valid-until')
    expect(business.textContent).toMatch(/^November 4, 2026.*11:59\sPM EST, HandyHub business time$/)
  })

  it('[RULE-NO-INVENTED-FACTS] terms NOT CONFIGURED: no wording at all, only the missing state', async () => {
    open(
      api({
        detail: () =>
          estimate({
            terms: { documentId: 'test-estimate-terms-1', state: 'not_configured' },
            approval: {
              ...(estimate() as { approval: object }).approval,
              reasons: ['terms_not_configured'],
            },
          }),
      }).fetchImpl,
    )
    const terms = await screen.findByTestId('estimate-terms')
    expect(within(terms).getByText('Estimate terms: NOT CONFIGURED')).toBeTruthy()
    expect(terms.querySelector('.portal-terms')).toBeNull()
    expect(screen.getByText('The estimate terms are NOT CONFIGURED.')).toBeTruthy()
  })

  it('[HH-EST-09] Request Changes sends the message once with one key, then shows it in the history', async () => {
    const message = 'Synthetic: please quote without paint.'
    const posts: Call[] = []
    const a = api({
      post: (c) => {
        posts.push(c)
        return json(201, {
          reference: REF,
          number: NUMBER,
          version: 1,
          kind: 'changes_requested',
          status: 'current',
          at: NOW,
        })
      },
    })
    open(a.fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Request Changes' }))
    // An empty message is not sent.
    fireEvent.click(screen.getByRole('button', { name: 'Send my request' }))
    expect(await screen.findByText('Please write your message first.')).toBeTruthy()
    expect(posts).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('What would you like changed?'), { target: { value: message } })
    a.setDetail(() => estimate({ responses: [{ kind: 'changes_requested', version: 1, at: NOW, message }] }))
    fireEvent.click(screen.getByRole('button', { name: 'Send my request' }))
    expect(await screen.findByText('Your request for changes was sent to HandyHub.')).toBeTruthy()
    expect(posts).toHaveLength(1)
    expect(posts[0]?.url).toBe(`/api/v1/customer/projects/${REF}/estimates/${NUMBER}/versions/1/request-changes`)
    expect(JSON.parse(String(posts[0]?.init?.body))).toEqual({ message })
    expect((posts[0]?.init?.headers as Record<string, string>)['idempotency-key']).toMatch(/^portal-[0-9a-f]{32}$/)
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy())
    expect(screen.getByText(/^Changes requested, version 1,/)).toBeTruthy()
  })

  it('[HH-ID-07] a stale verification: the answer is refused with how to verify again, and what was typed is kept', async () => {
    const posts: Call[] = []
    const a = api({
      post: (c) => {
        posts.push(c)
        return json(403, {
          error: {
            code: 'FORBIDDEN',
            message: '',
            fieldErrors: [{ field: 'verification', code: 'FRESH_VERIFICATION_REQUIRED', message: '' }],
            requestId: 'r',
            retryable: false,
          },
        })
      },
    })
    open(a.fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Synthetic reason' } })
    fireEvent.click(screen.getByRole('button', { name: 'Decline this estimate' }))
    expect(await screen.findByText(/confirm it's you again with a new code, then try again/)).toBeTruthy()
    expect((screen.getByLabelText('Reason (optional)') as HTMLTextAreaElement).value).toBe('Synthetic reason')
    expect(screen.queryByText(/You declined this estimate/)).toBeNull()
    expect(JSON.parse(String(posts[0]?.init?.body))).toEqual({ reason: 'Synthetic reason' })
  })

  it('[HH-EST-09] an expired version offers Request an Updated Estimate and nothing else', async () => {
    open(
      api({
        detail: () =>
          estimate({
            status: 'expired',
            actions: { requestChanges: false, decline: false, requestUpdate: true },
            approval: {
              ...(estimate() as { approval: object }).approval,
              reasons: ['terms_not_in_effect', 'expired'],
              selection: null,
            },
          }),
      }).fetchImpl,
    )
    expect(await screen.findByText('Version 1: Expired')).toBeTruthy()
    expect(screen.getByText('This estimate has expired.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Request an Updated Estimate' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Request Changes' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull()
  })
})

describe('Approve Estimate (TSK-0057, HH-EST-06, HH-EST-07, HH-ID-07, OWN-DEC-103)', () => {
  const available = (over: Record<string, unknown> = {}) =>
    estimate({
      terms: { documentId: 'estimate-terms-1', state: 'in_effect' },
      approval: {
        available: true,
        reasons: [],
        current: null,
        contentDigest: DIGEST,
        selection: BASE_SELECTION,
        approved: null,
        nextStep: null,
        receipt: null,
      },
      ...over,
    })
  const WITH_ADD_ON = {
    options: [2],
    subtotalCents: 133_497,
    reductionCents: 0,
    totalCents: 133_497,
    deposit: { state: 'required', amountCents: 26_699 },
  }

  it('[T33][HH-EST-06] options update the server total; the box starts unchecked; the name and the box are required; one key per attempt', async () => {
    const posts: Call[] = []
    let fail = true
    const a = api({
      detail: () => available(),
      post: (c) => {
        posts.push(c)
        if (c.url.endsWith('/selection'))
          return json(200, { reference: REF, number: NUMBER, version: 1, selection: WITH_ADD_ON })
        // The first approval attempt is lost on the network; the retry carries the same key.
        if (fail) {
          fail = false
          throw new TypeError('network down')
        }
        a.setDetail(() =>
          available({
            status: 'approved',
            approval: {
              available: false,
              reasons: [],
              current: null,
              contentDigest: DIGEST,
              selection: null,
              approved: { ...WITH_ADD_ON, at: NOW },
              nextStep: 'deposit_due',
              receipt: { state: 'preparing', issuedAt: null, byteSize: null, url: null },
            },
            actions: { requestChanges: false, decline: false, requestUpdate: false },
          }),
        )
        return json(201, {
          reference: REF,
          number: NUMBER,
          version: 1,
          status: 'approved',
          approved: { ...WITH_ADD_ON, at: NOW },
          nextStep: 'deposit_due',
        })
      },
    })
    open(a.fetchImpl)
    const section = await screen.findByTestId('estimate-approval')
    const box = within(section).getByRole('checkbox', { name: 'I have read and accept the estimate terms' })
    expect((box as HTMLInputElement).checked).toBe(false)
    expect(within(section).getByText('Approving does not book an appointment or pay a deposit.')).toBeTruthy()
    const approve = within(section).getByRole('button', { name: 'Approve Estimate' })
    // Nothing is sent before the box is ticked and the name typed.
    fireEvent.click(approve)
    expect(posts).toHaveLength(0)

    // Selecting the add-on: the total and deposit come from the server.
    fireEvent.click(within(section).getByRole('checkbox', { name: 'Synthetic optional trim ($59.97)' }))
    const totals = await within(section).findByTestId('approval-totals')
    await waitFor(() => expect(within(totals).getAllByText('$1,334.97').length).toBeGreaterThan(0))
    expect(within(totals).getByText('$266.99')).toBeTruthy()
    expect(posts[0]?.url).toBe(`/api/v1/customer/projects/${REF}/estimates/${NUMBER}/versions/1/selection`)
    expect(JSON.parse(String(posts[0]?.init?.body))).toEqual({ options: [2] })

    fireEvent.click(box)
    fireEvent.change(within(section).getByLabelText('Your full name'), { target: { value: ' Synthetic Customer ' } })
    const button = () => within(section).getByRole('button', { name: 'Approve Estimate' })
    fireEvent.click(button())
    expect(await within(section).findByText("Your approval couldn't be sent. Please try again.")).toBeTruthy()
    fireEvent.click(button())
    // TSK-0058 (OWN-DEC-105): the next step in the owner's words, and the receipt being prepared.
    expect(await screen.findByText('Estimate approved—pay your deposit to proceed with scheduling.')).toBeTruthy()
    expect(within(screen.getByTestId('approval-receipt')).getByRole('status').textContent).toBe(
      'Your approval receipt is being prepared. It appears here shortly.',
    )
    const approvals = posts.filter((p) => p.url.endsWith('/approve'))
    expect(approvals).toHaveLength(2)
    const keys = approvals.map((p) => (p.init?.headers as Record<string, string>)['idempotency-key'])
    expect(keys[0]).toMatch(/^portal-[0-9a-f]{32}$/)
    expect(keys[1]).toBe(keys[0])
    expect(JSON.parse(String(approvals[1]?.init?.body))).toEqual({
      contentDigest: DIGEST,
      options: [2],
      totalCents: 133_497,
      depositCents: 26_699,
      termsDocumentId: ESTIMATE_TERMS.documentId,
      termsSha256: ESTIMATE_TERMS.contentSha256,
      acceptTerms: true,
      fullName: 'Synthetic Customer',
    })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve Estimate' })).toBeNull())
  })

  it('[HH-ID-07][HH-ID-06] a stale verification: a new code right here, and the options and name stay as they were', async () => {
    const posts: Call[] = []
    const a = api({
      detail: () =>
        available({ freshVerification: false, approval: { ...available().approval, selection: WITH_ADD_ON } }),
      post: (c) => {
        posts.push(c)
        if (c.url.endsWith('/verification/codes'))
          return json(202, { sent: { channel: 'email', destination: 's***@example.test', expiresAt: NOW } })
        if (c.url.endsWith('/customer/session/verification')) {
          const code = (JSON.parse(String(c.init?.body)) as { code: string }).code
          if (code !== '123456')
            return json(400, {
              error: {
                code: 'VALIDATION_FAILED',
                message: '',
                fieldErrors: [{ field: 'body.code', code: 'invalid_code', message: '' }],
                requestId: 'r',
                retryable: false,
              },
            })
          a.setDetail(() => available({ approval: { ...available().approval, selection: WITH_ADD_ON } }))
          return json(200, {
            fresh: true,
            freshUntil: NOW,
            channels: [{ channel: 'email', destination: 's***@example.test' }],
          })
        }
        return json(403, {
          error: {
            code: 'FORBIDDEN',
            message: '',
            fieldErrors: [{ field: 'verification', code: 'FRESH_VERIFICATION_REQUIRED', message: '' }],
            requestId: 'r',
            retryable: false,
          },
        })
      },
    })
    open(a.fetchImpl)
    const verify = await screen.findByTestId('estimate-reverify')
    // The options kept on the server are already selected.
    const section = screen.getByTestId('estimate-approval')
    const option = within(section).getByRole('checkbox', {
      name: 'Synthetic optional trim ($59.97)',
    }) as HTMLInputElement
    expect(option.checked).toBe(true)
    fireEvent.click(within(section).getByRole('checkbox', { name: 'I have read and accept the estimate terms' }))
    fireEvent.change(within(section).getByLabelText('Your full name'), { target: { value: 'Synthetic Customer' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Approve Estimate' }))
    expect(await within(section).findByText(/confirm it's you again with a new code, then try again/)).toBeTruthy()

    fireEvent.click(await within(verify).findByRole('button', { name: 'Email a code to s***@example.test' }))
    expect(await within(verify).findByText('We sent a code to s***@example.test.')).toBeTruthy()
    fireEvent.change(within(verify).getByLabelText('Code'), { target: { value: '000000' } })
    fireEvent.click(within(verify).getByRole('button', { name: 'Confirm' }))
    expect(await within(verify).findByText("That code didn't work. Check it, or ask for a new one.")).toBeTruthy()
    fireEvent.change(within(verify).getByLabelText('Code'), { target: { value: '123456' } })
    fireEvent.click(within(verify).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.queryByTestId('estimate-reverify')).toBeNull())
    // What the customer chose and typed is still there.
    expect(
      (within(section).getByRole('checkbox', { name: 'Synthetic optional trim ($59.97)' }) as HTMLInputElement).checked,
    ).toBe(true)
    expect((within(section).getByLabelText('Your full name') as HTMLInputElement).value).toBe('Synthetic Customer')
    expect(
      (within(section).getByRole('checkbox', { name: 'I have read and accept the estimate terms' }) as HTMLInputElement)
        .checked,
    ).toBe(true)
    expect(posts.filter((p) => p.url.endsWith('/approve'))).toHaveLength(1)
  })

  it('[RULE-NO-INVENTED-FACTS] the server refusing NOT CONFIGURED is shown as such, never as approved', async () => {
    const a = api({
      detail: () => available(),
      post: () =>
        json(503, {
          error: {
            code: 'NOT_CONFIGURED',
            message: '',
            fieldErrors: [{ field: 'terms', code: 'TERMS_NOT_IN_EFFECT', message: '' }],
            requestId: 'r',
            retryable: false,
          },
        }),
    })
    open(a.fetchImpl)
    const section = await screen.findByTestId('estimate-approval')
    fireEvent.click(within(section).getByRole('checkbox', { name: 'I have read and accept the estimate terms' }))
    fireEvent.change(within(section).getByLabelText('Your full name'), { target: { value: 'Synthetic Customer' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Approve Estimate' }))
    expect(
      await within(section).findByText("This estimate can't be approved yet: the estimate terms are not in effect."),
    ).toBeTruthy()
    expect(screen.queryByText(/^Estimate approved/)).toBeNull()
    expect(screen.queryByTestId('approval-receipt')).toBeNull()
  })
})

describe('the approval receipt (TSK-0058, HH-EST-12, HH-PORT-10, OWN-DEC-105)', () => {
  const approved = (approval: Record<string, unknown>) =>
    estimate({
      status: 'approved',
      terms: { documentId: 'estimate-terms-1', state: 'in_effect' },
      approval: {
        available: false,
        reasons: [],
        current: null,
        contentDigest: DIGEST,
        selection: null,
        approved: { ...BASE_SELECTION, at: NOW },
        ...approval,
      },
      actions: { requestChanges: false, decline: false, requestUpdate: false },
    })
  const ISSUED = {
    state: 'issued',
    issuedAt: NOW,
    byteSize: 4096,
    url: 'https://storage.example.test/estimates/receipts/synthetic?sig=x',
  }

  it("[HH-EST-12][OWN-DEC-105] the next step in the owner's words and a download of the issued receipt PDF", async () => {
    open(api({ detail: () => approved({ nextStep: 'choose_work_appointment', receipt: ISSUED }) }).fetchImpl)
    expect(await screen.findByText('Estimate approved—choose your work appointment.')).toBeTruthy()
    const receipt = screen.getByTestId('approval-receipt')
    const link = within(receipt).getByRole('link', { name: 'Download your approval receipt (PDF)' })
    expect(link.getAttribute('href')).toBe(ISSUED.url)
    expect(
      within(receipt).getByText(
        'Your approval receipt is a PDF of what you approved, with the estimate terms you accepted.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve Estimate' })).toBeNull()
  })

  it('[HH-PORT-06] an issued receipt without a link says so truthfully; a project past approval names no step', async () => {
    open(api({ detail: () => approved({ nextStep: null, receipt: { ...ISSUED, url: null } }) }).fetchImpl)
    expect(await screen.findByText('Estimate approved.')).toBeTruthy()
    expect(
      screen.getByText("Your approval receipt is saved, but it can't be downloaded right now. Please try again later."),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Download your approval receipt (PDF)' })).toBeNull()
  })

  it('[HH-PORT-06] a receipt or next step that is not the declared view is a failure, never shown as data', () => {
    const bad = (approval: Record<string, unknown>) => parseEstimate(approved(approval))
    expect(bad({ nextStep: 'deposit_due', receipt: ISSUED })).not.toBeNull()
    expect(bad({ nextStep: 'scheduling_next', receipt: null })).toBeNull()
    expect(bad({ nextStep: null, receipt: { ...ISSUED, state: 'sent' } })).toBeNull()
    expect(
      bad({ nextStep: null, receipt: { state: 'preparing', issuedAt: null, byteSize: null, url: ISSUED.url } }),
    ).toBeNull()
    expect(bad({ nextStep: null, receipt: { ...ISSUED, byteSize: null } })).toBeNull()
  })

  it("[HH-PORT-10] the Documents tab marks the approved version's receipt", async () => {
    documentsReceipt = 'issued'
    try {
      open(api().fetchImpl, `/portal/p/${REF}/documents`)
      expect((await screen.findByTestId('documents-receipt')).textContent).toBe(
        'Approval receipt (PDF): open the estimate to download it.',
      )
    } finally {
      documentsReceipt = null
    }
  })
})
