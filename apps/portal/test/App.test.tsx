// HandyHub customer portal (TSK-0001 skeleton, TSK-0038 workspace frame; HH-PORT-02, HH-PORT-03, HH-PORT-06, HH-ARC-10,
// RULE-LANGUAGES). The API is a synthetic stand-in; every reference and text is invented for the test
// (RULE-SYNTHETIC-DATA).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { customerTranslator } from '@handyhub/i18n'
import { App, pageTitle, routeOf } from '../src/App'
import { parseOverview, type Fetch, type ProjectOverview } from '../src/api'

afterEach(cleanup)

const REF = 'HH-7K2M9Q4D'
const NOW = '2026-10-21T15:00:00.000Z'
const SENT = '2026-10-20T14:00:00.000Z'
/** The refresh time as the page writes it, in whatever zone the test machine runs. */
const AT = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(new Date(NOW))

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function overview(over: Partial<ProjectOverview> = {}, status: Partial<ProjectOverview['status']> = {}) {
  return {
    reference: REF,
    services: ['Patching & Repair'],
    notSure: false,
    submittedAt: SENT,
    status: {
      situation: 'received',
      step: 'review_details',
      waitingOn: 'handyhub',
      nextAction: 'none',
      since: SENT,
      text: null,
      ...status,
    },
    timeline: [{ kind: 'received', at: SENT, text: null }],
    appointment: null,
    payment: { state: 'none' },
    invoiceBalanceCents: 0,
    refreshedAt: NOW,
    refreshSeconds: 0,
    ...over,
  } as ProjectOverview
}

/** A fetch that answers each call with the next response (the last one repeats); records the URLs. */
function scripted(...answers: (() => Response | Promise<Response>)[]) {
  const urls: string[] = []
  const fetchImpl: Fetch = async (input) => {
    urls.push(input)
    const next = answers[Math.min(urls.length - 1, answers.length - 1)] as () => Response
    return next()
  }
  return { fetchImpl, urls }
}
const project = (fetchImpl: Fetch) => render(<App path={`/portal/p/${REF}`} fetchImpl={fetchImpl} />)

describe('HandyHub customer portal frame (TSK-0001, TSK-0038, RULE-LANGUAGES)', () => {
  it('[RULE-LANGUAGES] the portal renders in English with its name in the banner and one page heading', async () => {
    const { fetchImpl } = scripted(() =>
      json(200, { projects: [], access: 'project_link', refreshedAt: NOW, refreshSeconds: 0 }),
    )
    const { container } = render(<App path="/portal/" fetchImpl={fetchImpl} />)
    expect(container.querySelector('main')?.getAttribute('lang')).toBe('en')
    expect(within(screen.getByRole('banner')).getByText('HandyHub customer portal')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Your projects'])
    expect(await screen.findByText('No projects yet')).toBeTruthy()
  })

  it('[HH-PORT-09] routes: /portal/ lists projects; /portal/p/<reference> opens one; anything else lists', () => {
    expect(routeOf('/portal/')).toEqual({ page: 'projects' })
    expect(routeOf('/portal')).toEqual({ page: 'projects' })
    expect(routeOf(`/portal/p/${REF}`)).toEqual({ page: 'project', reference: REF })
    expect(routeOf(`/portal/p/${REF.toLowerCase()}/`)).toEqual({ page: 'project', reference: REF })
    expect(routeOf('/portal/p/not-a-reference')).toEqual({ page: 'projects' })
    expect(routeOf('/portal/p/11111111-1111-4111-8111-111111111111')).toEqual({ page: 'projects' })
  })
})

describe('the projects list (TSK-0038, HH-PORT-02, HH-PORT-06)', () => {
  it('[HH-PORT-02] each project shows its status and who is waiting, and links to its page', async () => {
    const { fetchImpl, urls } = scripted(() =>
      json(200, {
        projects: [
          {
            reference: REF,
            services: ['Patching & Repair'],
            notSure: true,
            submittedAt: SENT,
            status: {
              situation: 'more_information',
              step: 'answer_questions',
              waitingOn: 'customer',
              nextAction: 'reply',
              since: NOW,
            },
            section: 'active',
            documents: 0,
          },
        ],
        access: 'project_link',
        refreshedAt: NOW,
        refreshSeconds: 0,
      }),
    )
    render(<App path="/portal/" fetchImpl={fetchImpl} />)
    const item = await screen.findByRole('listitem', { name: `Project ${REF}` })
    expect(within(item).getByText('More information needed')).toBeTruthy()
    expect(within(item).getByText('Waiting on you')).toBeTruthy()
    expect(within(item).getByText('Patching & Repair, Not sure what service I need')).toBeTruthy()
    expect(
      within(item)
        .getByRole('link', { name: `Open project ${REF}` })
        .getAttribute('href'),
    ).toBe(`/portal/p/${REF}`)
    expect(urls).toEqual(['/api/v1/customer/projects'])
    // TSK-0124: a guest link's one project, in its section; no Add a project.
    expect(within(screen.getByRole('region', { name: 'Active' })).getByRole('listitem')).toBe(item)
    expect(screen.queryByRole('region', { name: 'Add a project to your account' })).toBeNull()
  })

  it('[HH-PORT-06] no session: the ended-session state with the way back through the secure link', async () => {
    const { fetchImpl } = scripted(() => json(401, { error: { code: 'UNAUTHENTICATED' } }))
    render(<App path="/portal/" fetchImpl={fetchImpl} />)
    expect(await screen.findByText('Your secure session has ended')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open your project' }).getAttribute('href')).toBe('/access')
  })
})

describe('the Overview (TSK-0038, HH-PORT-02, HH-PORT-03, T23)', () => {
  it('[HH-PORT-02][HH-PORT-03] a new request: the label, its next step, waiting on HandyHub, the timeline, empty appointment and payments', async () => {
    const { fetchImpl, urls } = scripted(() => json(200, overview()))
    project(fetchImpl)
    expect(await screen.findByText('Request received', { selector: '.portal-status__label' })).toBeTruthy()
    const next = screen.getByTestId('next-action')
    expect(within(next).getByText('Waiting on HandyHub')).toBeTruthy()
    expect(within(next).getByText('HandyHub will review the details.')).toBeTruthy()
    expect(within(next).queryByRole('button')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: `Project ${REF}` })).toBeTruthy()
    const timeline = screen.getByRole('region', { name: 'Timeline' })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(1)
    // TSK-0150 (OWN-DEC-199, portal.appointment.none.title): no live visit, so none is upcoming.
    expect(
      within(screen.getByRole('region', { name: 'Appointment' })).getByText('No upcoming appointment'),
    ).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Payments' })).getByText('Nothing to pay yet')).toBeTruthy()
    expect(screen.getByText(`Updated ${AT}`)).toBeTruthy()
    // TSK-0093: the Overview also reads the released case updates (none here, so nothing is shown). That read can
    // start after the overview has rendered, so the test waits for it.
    // TSK-0114: so does the repeat-service schedule (none here, so nothing is shown).
    await waitFor(() =>
      expect(urls).toEqual([
        `/api/v1/customer/projects/${REF}/overview`,
        `/api/v1/customer/projects/${REF}/cases`,
        `/api/v1/customer/projects/${REF}/repeat-service`,
      ]),
    )
    expect(screen.queryByTestId('portal-case-updates')).toBeNull()
  })

  it('[HH-PORT-02][OWN-DEC-98] waiting on the customer: "Waiting on you" with Reply, inactive with its reason until the reply screen exists', async () => {
    const { fetchImpl } = scripted(() =>
      json(
        200,
        overview(
          {
            timeline: [
              { kind: 'more_information', at: NOW, text: null },
              { kind: 'received', at: SENT, text: null },
            ],
          },
          { situation: 'more_information', step: 'answer_questions', waitingOn: 'customer', nextAction: 'reply' },
        ),
      ),
    )
    project(fetchImpl)
    const next = await screen.findByTestId('next-action')
    expect(within(next).getByText('Waiting on you')).toBeTruthy()
    expect(within(next).getByText('Answer the listed questions.')).toBeTruthy()
    const reply = within(next).getByRole('button', { name: 'Reply' }) as HTMLButtonElement
    expect(reply.disabled).toBe(true)
    expect(within(next).getByText("This isn't available here yet.")).toBeTruthy()
    // Exactly one action.
    expect(within(next).getAllByRole('button')).toHaveLength(1)
    const latest = screen.getByRole('region', { name: 'Latest update' })
    expect(within(latest).getByText('More information needed')).toBeTruthy()
  })

  it('[HH-PORT-03][HH-LEAD-08] Not a Fit: the decision and reason as staff published them; nobody waits', async () => {
    const message =
      "Thank you for considering HandyHub. We're unable to take on this project because of a synthetic reason."
    const { fetchImpl } = scripted(() =>
      json(
        200,
        overview(
          {
            timeline: [
              { kind: 'not_a_fit', at: NOW, text: message },
              { kind: 'received', at: SENT, text: null },
            ],
          },
          { situation: 'not_a_fit', step: 'decision', waitingOn: 'nobody', nextAction: 'none', text: message },
        ),
      ),
    )
    project(fetchImpl)
    const next = await screen.findByTestId('next-action')
    expect(within(next).getByText(message)).toBeTruthy()
    expect(within(next).getByText('Nothing is needed from you')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Timeline' })).getByText(message)).toBeTruthy()
  })

  it('[T48][HH-PORT-03] a safety hold shows only "Work is paused for safety review."', async () => {
    const { fetchImpl } = scripted(() =>
      json(200, overview({}, { situation: 'safety_hold', step: 'safety_review', waitingOn: 'handyhub' })),
    )
    project(fetchImpl)
    expect(await screen.findByText('Work is paused for safety review.')).toBeTruthy()
    const next = screen.getByTestId('next-action')
    // Nothing beyond who is waiting: no step, no action, no hazard detail.
    expect(next.textContent).toBe('Waiting on HandyHub')
  })
})

describe('the deposit in the payment summary (TSK-0059, HH-FIN-02, OWN-DEC-104, OWN-DEC-105, INT-Square)', () => {
  const approved = {
    situation: 'approved',
    step: 'deposit_due',
    waitingOn: 'customer',
    nextAction: 'pay_deposit',
  } as const
  const SQUARE = ['https://square.link/u', 'synthetic0059'].join('/')

  it('[HH-FIN-02] a deposit due: the owner wording with the amount, any pending check, and Pay by Card opening Square', async () => {
    const { fetchImpl } = scripted(() =>
      json(
        200,
        overview(
          {
            payment: {
              state: 'deposit_due',
              amountCents: 25_500,
              verifiedCents: 0,
              pendingCents: 10_000,
              payByCardUrl: SQUARE,
            },
          },
          approved,
        ),
      ),
    )
    project(fetchImpl)
    const next = await screen.findByTestId('next-action')
    expect(within(next).getByText('Estimate approved—pay your deposit to proceed with scheduling.')).toBeTruthy()
    expect(within(next).getByRole('link', { name: 'Pay your deposit' }).getAttribute('href')).toBe('#portal-payment')
    const payments = screen.getByRole('region', { name: 'Payments' })
    expect(
      within(payments).getByText(
        'Deposit due: $255.00. Please pay your deposit so we can confirm your work appointment. Payment does not guarantee a particular date.',
      ),
    ).toBeTruthy()
    expect(within(payments).getByText('Pending: $100.00. A check counts once it has cleared.')).toBeTruthy()
    const pay = within(payments).getByRole('link', { name: 'Pay by Card' })
    expect(pay.getAttribute('href')).toBe(SQUARE)
    expect(pay.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('without a link there is no Pay by Card; a deposit received shows its amount; anything else is refused', async () => {
    const { fetchImpl } = scripted(() =>
      json(
        200,
        overview(
          {
            payment: {
              state: 'deposit_due',
              amountCents: 20_000,
              verifiedCents: 5_000,
              pendingCents: 0,
              payByCardUrl: null,
            },
          },
          approved,
        ),
      ),
    )
    project(fetchImpl)
    const payments = await screen.findByRole('region', { name: 'Payments' })
    expect(within(payments).getByText('Received so far: $50.00.')).toBeTruthy()
    expect(within(payments).queryByRole('link')).toBeNull()
    cleanup()
    const received = scripted(() =>
      json(
        200,
        overview(
          { payment: { state: 'deposit_received', amountCents: 20_000 } },
          { situation: 'approved', step: 'choose_work_appointment', waitingOn: 'handyhub', nextAction: 'none' },
        ),
      ),
    )
    project(received.fetchImpl)
    expect(await screen.findByText('Deposit received: $200.00.')).toBeTruthy()
    const due = { state: 'deposit_due', amountCents: 1, verifiedCents: 0, pendingCents: 0 }
    expect(parseOverview({ ...overview(), payment: { ...due, payByCardUrl: 'http://square.link/u/x' } })).toBeNull()
    expect(parseOverview({ ...overview(), payment: { ...due, payByCardUrl: 'javascript:alert(1)' } })).toBeNull()
    expect(parseOverview({ ...overview(), payment: { ...due, amountCents: 1.5, payByCardUrl: null } })).toBeNull()
  })
})

describe('wording checked against behaviour (TSK-0150, OWN-DEC-199, HH-PORT-02)', () => {
  it('[HH-PORT-02][T23] an invoice with a balance: Pay your invoice opens Payments, and the balance is named, never "Nothing to pay yet"', async () => {
    const { fetchImpl } = scripted(() =>
      json(
        200,
        overview(
          { invoiceBalanceCents: 60_000 },
          {
            situation: 'work_complete',
            step: 'review_care_notes_and_invoice',
            waitingOn: 'customer',
            nextAction: 'pay_invoice',
          },
        ),
      ),
    )
    project(fetchImpl)
    const next = await screen.findByTestId('next-action')
    expect(within(next).getByText('Waiting on you')).toBeTruthy()
    expect(within(next).getByRole('link', { name: 'Pay your invoice' }).getAttribute('href')).toBe(
      `/portal/p/${REF}/payments`,
    )
    const payments = screen.getByRole('region', { name: 'Payments' })
    expect(within(payments).getByText('Invoice balance due: $600.00.')).toBeTruthy()
    expect(within(payments).queryByText('Nothing to pay yet')).toBeNull()
    // Nothing owed and no deposit: the empty state names only what can appear there.
    cleanup()
    project(scripted(() => json(200, overview())).fetchImpl)
    const empty = await screen.findByRole('region', { name: 'Payments' })
    expect(
      within(empty).getByText('Your deposit and invoice amounts appear here once HandyHub shares them.'),
    ).toBeTruthy()
  })

  it('[HH-PORT-02] a change order waiting for a decision: Review the change opens the Documents tab, where it is decided', async () => {
    const { fetchImpl } = scripted(() =>
      json(
        200,
        overview(
          {},
          { situation: 'scheduled', step: 'view_appointment', waitingOn: 'customer', nextAction: 'review_change' },
        ),
      ),
    )
    project(fetchImpl)
    const next = await screen.findByTestId('next-action')
    expect(within(next).getByRole('link', { name: 'Review the change' }).getAttribute('href')).toBe(
      `/portal/p/${REF}/documents`,
    )
  })

  it('[HH-PORT-07] after a recorded "Arrived" the step says so, never that the visit is on the way', async () => {
    const { fetchImpl } = scripted(() =>
      json(200, overview({}, { situation: 'on_the_way', step: 'arrival_recorded', waitingOn: 'handyhub' })),
    )
    project(fetchImpl)
    const next = await screen.findByTestId('next-action')
    expect(within(next).getByText('HandyHub recorded that your visit has arrived.')).toBeTruthy()
    expect(within(next).queryByText('HandyHub recorded that your visit is on the way.')).toBeNull()
  })

  it('an overview without the invoice balance is refused, never read as nothing owed', () => {
    const { invoiceBalanceCents: _b, ...rest } = overview()
    void _b
    expect(parseOverview(rest)).toBeNull()
    expect(parseOverview({ ...overview(), invoiceBalanceCents: -1 })).toBeNull()
  })
})

describe('refresh, polling and truthful failure states (TSK-0038, HH-ARC-10, HH-PORT-06, T71)', () => {
  it('[HH-ARC-10][T23] polling picks up a changed record: the next action changes in place', async () => {
    const { fetchImpl, urls } = scripted(
      () => json(200, overview({ refreshSeconds: 1 })),
      () =>
        json(
          200,
          overview(
            { refreshSeconds: 1 },
            { situation: 'more_information', step: 'answer_questions', waitingOn: 'customer', nextAction: 'reply' },
          ),
        ),
    )
    project(fetchImpl)
    expect(await screen.findByText('Waiting on HandyHub')).toBeTruthy()
    expect(await screen.findByText('Waiting on you', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy()
    expect(urls.length).toBeGreaterThanOrEqual(2)
  })

  it('[HH-ARC-10] polling pauses while the tab is hidden and refreshes once it is visible again', async () => {
    const { fetchImpl, urls } = scripted(() => json(200, overview({ refreshSeconds: 1 })))
    const visibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
    let state: DocumentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    try {
      project(fetchImpl)
      await screen.findByText('Waiting on HandyHub')
      state = 'hidden'
      // A tick that fired while the tab was still visible may have a read in flight: let it land before counting.
      await new Promise((r) => setTimeout(r, 50))
      const before = urls.length
      await new Promise((r) => setTimeout(r, 1300))
      expect(urls.length).toBe(before)
      state = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      await waitFor(() => expect(urls.length).toBe(before + 1))
    } finally {
      if (visibility) Object.defineProperty(document, 'visibilityState', visibility)
      else delete (document as { visibilityState?: unknown }).visibilityState
    }
  })

  it('[HH-PORT-06][HH-ARC-10] a failed refresh keeps the last record marked stale, never as current, until a refresh succeeds', async () => {
    let fail = false
    const { fetchImpl } = scripted(() => {
      if (fail) throw new TypeError('synthetic network failure')
      return json(200, overview())
    })
    project(fetchImpl)
    await screen.findByText(`Updated ${AT}`)
    fail = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText("This page couldn't be updated")).toBeTruthy()
    expect(screen.getByText(`What you see is from ${AT} and may be out of date.`, { exact: false })).toBeTruthy()
    expect(screen.queryByText(`Updated ${AT}`)).toBeNull()
    for (const name of ['Status', 'Appointment', 'Payments', 'Timeline'])
      expect(screen.getByRole('region', { name }).getAttribute('data-stale'), name).toBe('true')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(`Updated ${AT}`)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Status' }).getAttribute('data-stale')).toBeNull()
  })

  it('[HH-PORT-06][T71] a failed first read shows the failure state with Try again, and no project data', async () => {
    let fail = true
    const { fetchImpl } = scripted(() => (fail ? json(503, { error: { code: 'UNAVAILABLE' } }) : json(200, overview())))
    project(fetchImpl)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText("Your project couldn't be loaded")).toBeTruthy()
    expect(screen.queryByText('Request received')).toBeNull()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Request received', { selector: '.portal-status__label' })).toBeTruthy()
  })

  it('[HH-PORT-06] the session ends while open: the record is replaced by the ended-session state', async () => {
    let ended = false
    const { fetchImpl } = scripted(() =>
      ended ? json(401, { error: { code: 'UNAUTHENTICATED' } }) : json(200, overview()),
    )
    project(fetchImpl)
    await screen.findByText(`Updated ${AT}`)
    ended = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Your secure session has ended')).toBeTruthy()
    expect(screen.queryByText('Request received')).toBeNull()
  })

  it('[HH-PORT-06][T19] a project this session cannot open: one neutral state, no project information', async () => {
    const { fetchImpl } = scripted(() => json(404, { error: { code: 'NOT_FOUND' } }))
    project(fetchImpl)
    expect(await screen.findByText("This project isn't available")).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Timeline' })).toBeNull()
  })

  it('[HH-PORT-06] an answer that is not the declared customer view is a failure, never shown as data', () => {
    expect(parseOverview(overview())).not.toBeNull()
    expect(parseOverview({ ...overview(), status: { ...overview().status, situation: 'internal_review' } })).toBeNull()
    expect(parseOverview({ ...overview(), payment: { state: 'paid' } })).toBeNull()
    expect(parseOverview({ ...overview(), timeline: [{ kind: 'note', at: NOW, text: 'x' }] })).toBeNull()
    expect(parseOverview(null)).toBeNull()
  })
})

describe('page titles (TSK-0104, HH-A11Y-01)', () => {
  it('[HH-A11Y-01] names the page, then the portal', () => {
    const { t } = customerTranslator()
    expect(pageTitle(t, routeOf(`/portal/p/${REF}/messages`))).toBe(`Project ${REF} – HandyHub customer portal`)
    expect(pageTitle(t, routeOf(`/portal/p/${REF}/privacy`))).toBe(
      'Your data and privacy requests – HandyHub customer portal',
    )
    expect(pageTitle(t, routeOf('/portal/terms/estimate-terms-1'))).toBe('HandyHub customer portal')
  })
})
