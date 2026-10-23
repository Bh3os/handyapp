// The workspace tabs (TSK-0039; HH-PORT-09, HH-PORT-08, HH-PORT-06, HH-ARC-10, T04, T66, T69, RULE-LANGUAGES). The API
// is a synthetic stand-in; every reference and text is invented for the test (RULE-SYNTHETIC-DATA).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOGS } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App, routeOf } from '../src/App'
import { parseTab, type Fetch, type WorkspaceTab } from '../src/api'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const REF = 'HH-7K2M9Q4D'
const NOW = '2026-10-21T15:00:00.000Z'
const SENT = '2026-10-20T14:00:00.000Z'
const TAB_NAMES = ['Overview', 'Messages', 'Documents', 'Photos', 'Appointments', 'Payments']

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const overview = (refreshSeconds = 0) => ({
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
  },
  timeline: [{ kind: 'received', at: SENT, text: null }],
  appointment: null,
  payment: { state: 'none' },
  refreshedAt: NOW,
  refreshSeconds,
})
const head = (refreshSeconds = 0) => ({ reference: REF, refreshedAt: NOW, refreshSeconds })
const TAB_BODY: Record<WorkspaceTab, (s?: number) => unknown> = {
  messages: (s) => ({ ...head(s), messages: [] }),
  documents: (s) => ({ ...head(s), state: 'none' }),
  photos: (s) => ({
    ...head(s),
    photos: { received: 0, processing: 0, failed: 0 },
    yours: [],
    shared: [],
    linkSeconds: 300,
  }),
  appointments: (s) => ({ ...head(s), state: 'none' }),
  payments: (s) => ({ ...head(s), state: 'none' }),
}

/** A fetch answering each customer view by its path; `over` replaces an answer. Records the URLs. */
function api(over: Partial<Record<'overview' | WorkspaceTab, () => Response>> = {}, refreshSeconds = 0) {
  const urls: string[] = []
  const fetchImpl: Fetch = async (input) => {
    urls.push(input)
    const tab = input.split('/').pop() as 'overview' | WorkspaceTab
    const own = over[tab]
    if (own) return own()
    if (tab === 'overview') return json(200, overview(refreshSeconds))
    return json(200, TAB_BODY[tab](refreshSeconds))
  }
  return { fetchImpl, urls, count: (tab: string) => urls.filter((u) => u.endsWith(`/${tab}`)).length }
}
const open = (fetchImpl: Fetch, tab = '') =>
  render(<App path={`/portal/p/${REF}${tab ? `/${tab}` : ''}`} fetchImpl={fetchImpl} />)
const selected = () => screen.getByRole('tab', { selected: true })
const panel = () => screen.getByRole('tabpanel')

describe('workspace routes (TSK-0039, HH-PORT-09)', () => {
  it('[HH-PORT-09] each tab has its own page below the project; an unknown tab is no project page', () => {
    expect(routeOf(`/portal/p/${REF}`)).toEqual({ page: 'project', reference: REF })
    for (const tab of ['messages', 'documents', 'photos', 'appointments', 'payments'] as const) {
      expect(routeOf(`/portal/p/${REF}/${tab}`)).toEqual({ page: 'project', reference: REF, tab })
      expect(routeOf(`/portal/p/${REF.toLowerCase()}/${tab}/`)).toEqual({ page: 'project', reference: REF, tab })
    }
    expect(routeOf(`/portal/p/${REF}/overview`)).toEqual({ page: 'projects' })
    expect(routeOf(`/portal/p/${REF}/internal`)).toEqual({ page: 'projects' })
    expect(routeOf('/portal/p/not-a-reference/photos')).toEqual({ page: 'projects' })
  })
})

describe('the six tabs (TSK-0039, HH-PORT-09, T69)', () => {
  it('[HH-PORT-09][T69] the ARIA tabs pattern: six named tabs, Overview first and selected, one tab stop', async () => {
    const { fetchImpl, urls } = api()
    open(fetchImpl)
    const list = await screen.findByRole('tablist', { name: 'Project sections' })
    const tabs = within(list).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(TAB_NAMES)
    expect(selected().textContent).toBe('Overview')
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1'])
    // The panel shown is the selected tab's, labelled by it; the others are hidden.
    expect(panel().getAttribute('aria-labelledby')).toBe(selected().id)
    expect(selected().getAttribute('aria-controls')).toBe(panel().id)
    expect(within(panel()).getByRole('region', { name: 'Status' })).toBeTruthy()
    // Only the Overview (with its released case updates, TSK-0093) is read until another tab is opened. The case
    // updates are read once the Overview has loaded, so wait for that second request rather than racing it.
    await waitFor(() =>
      expect(urls).toEqual([`/api/v1/customer/projects/${REF}/overview`, `/api/v1/customer/projects/${REF}/cases`]),
    )
  })

  it('[T69][HH-PORT-09] keyboard: arrows, Home and End move and select; each tab opens its own page and read', async () => {
    const { fetchImpl, count } = api()
    open(fetchImpl)
    await screen.findByRole('tablist')
    const at = (name: string) => screen.getByRole('tab', { name })
    at('Overview').focus()
    fireEvent.keyDown(at('Overview'), { key: 'ArrowRight' })
    expect(selected().textContent).toBe('Messages')
    expect(document.activeElement).toBe(at('Messages'))
    expect(window.location.pathname).toBe(`/portal/p/${REF}/messages`)
    expect(await within(panel()).findByText('No messages yet')).toBeTruthy()
    fireEvent.keyDown(at('Messages'), { key: 'End' })
    expect(selected().textContent).toBe('Payments')
    expect(window.location.pathname).toBe(`/portal/p/${REF}/payments`)
    fireEvent.keyDown(at('Payments'), { key: 'ArrowRight' })
    expect(selected().textContent).toBe('Overview')
    expect(window.location.pathname).toBe(`/portal/p/${REF}`)
    fireEvent.keyDown(at('Overview'), { key: 'ArrowLeft' })
    expect(selected().textContent).toBe('Payments')
    fireEvent.keyDown(at('Payments'), { key: 'Home' })
    expect(selected().textContent).toBe('Overview')
    expect(document.activeElement).toBe(at('Overview'))
    await waitFor(() => expect(count('payments')).toBe(1))
    expect(count('messages')).toBe(1)
  })

  it('[HH-PORT-09][HH-PORT-06] every tab says truthfully what it holds; nothing claims a message, document or payment', async () => {
    const { fetchImpl } = api()
    open(fetchImpl)
    await screen.findByRole('tablist')
    const show = async (name: string) => {
      fireEvent.click(screen.getByRole('tab', { name }))
      await within(panel()).findByText(/^Updated /)
      return panel()
    }
    // TSK-0050: an empty conversation says what will appear; it never invents a message.
    let p = await show('Messages')
    expect(within(p).getByText('No messages yet')).toBeTruthy()
    expect(within(p).getByText('Messages between you and HandyHub about this project appear here.')).toBeTruthy()
    expect(within(p).queryByRole('listitem')).toBeNull()
    p = await show('Documents')
    expect(within(p).getByText('No documents yet')).toBeTruthy()
    p = await show('Photos')
    expect(within(p).getByText('No photos yet')).toBeTruthy()
    p = await show('Appointments')
    expect(within(p).getByText('No appointment yet')).toBeTruthy()
    p = await show('Payments')
    expect(within(p).getByText('Nothing to pay yet')).toBeTruthy()
    expect(within(p).getByText('A payment you make shows here once HandyHub records it.')).toBeTruthy()
    expect(within(p).queryByRole('button', { name: /pay/i })).toBeNull()
    // Each panel has its heading under the page heading.
    expect(within(p).getByRole('heading', { level: 2, name: 'Payments' })).toBeTruthy()
  })

  it('[TSK-0050][HH-COM-08][HH-PORT-08][C06] Messages: the conversation oldest first, who wrote it, how and when; customer text as written', async () => {
    // Customer free text in the customer's own language is kept exactly as written (HH-PORT-08).
    const own = 'Hola: ¿pueden venir el martes? Synthetic customer text.'
    const reply = 'Synthetic reply: Tuesday at 9 works.\nSee you then.'
    const { fetchImpl } = api({
      messages: () =>
        json(200, {
          ...head(),
          messages: [
            { from: 'you', channel: 'sms', at: SENT, text: own, textState: 'shown', attachments: 0 },
            { from: 'handyhub', channel: 'email', at: NOW, text: reply, textState: 'shown', attachments: 0 },
            { from: 'you', channel: 'email', at: NOW, text: null, textState: 'not_available', attachments: 2 },
          ],
        }),
    })
    open(fetchImpl, 'messages')
    const p = await screen.findByRole('tabpanel')
    const list = await within(p).findByRole('list', { name: 'Project conversation' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual([
      'You, Text message',
      'HandyHub, Email',
      'You, Email',
    ])
    expect(within(items[0] as HTMLElement).getByText(own)).toBeTruthy()
    expect((items[1] as HTMLElement).querySelector('.portal-conversation__text')?.textContent).toBe(reply)
    expect(within(items[2] as HTMLElement).getByText("The text of this message isn't available here.")).toBeTruthy()
    expect(within(items[2] as HTMLElement).getByText("2 attachments aren't shown here.")).toBeTruthy()
    expect(
      within(items[0] as HTMLElement)
        .getByRole('time')
        .getAttribute('datetime'),
    ).toBe(SENT)
    // No staff name, address or delivery state reaches the page; nothing claims the customer read anything.
    expect(p.textContent).not.toMatch(/delivered|read|sent by|@/i)
  })

  it('[HH-PORT-09][HH-PORT-11][HH-QA-05] Photos: the customer’s own uploads and the before and after photos HandyHub shared, paired by service', async () => {
    const url = (id: string) => `https://fake-r2.invalid/x/${id}?sig=1`
    const { fetchImpl } = api({
      photos: () =>
        json(200, {
          ...head(),
          photos: { received: 1, processing: 1, failed: 0 },
          yours: [
            { id: 'u1', state: 'ready', uploadedAt: SENT, url: url('u1') },
            { id: 'u2', state: 'quarantined', uploadedAt: SENT, url: null },
          ],
          shared: [
            {
              service: 'Patching & Repair',
              before: { id: 'b1', sharedAt: SENT, url: url('b1') },
              after: { id: 'a1', sharedAt: SENT, url: url('a1') },
            },
            { service: 'Interior Painting', before: null, after: { id: 'a2', sharedAt: SENT, url: url('a2') } },
          ],
          linkSeconds: 300,
        }),
    })
    open(fetchImpl, 'photos')
    const p = await screen.findByRole('tabpanel')
    expect(await within(p).findByText('Before and after photos from HandyHub')).toBeTruthy()
    const shared = within(p).getByTestId('portal-shared-photos')
    expect(within(shared).getByRole('img', { name: 'Patching & Repair: before' }).getAttribute('src')).toBe(url('b1'))
    expect(within(shared).getByRole('img', { name: 'Patching & Repair: after' }).getAttribute('src')).toBe(url('a1'))
    expect(within(shared).getByRole('img', { name: 'Interior Painting: after' })).toBeTruthy()
    expect(within(shared).queryByRole('img', { name: 'Interior Painting: before' })).toBeNull()
    expect(within(p).getByText('Received: 1')).toBeTruthy()
    expect(within(p).getByRole('img', { name: 'Your photo 1' })).toBeTruthy()
    expect(within(p).getByText('Your photo 2 is being checked.')).toBeTruthy()
    expect(within(p).getByText('Photo links work for a few minutes and renew when this page refreshes.')).toBeTruthy()
    expect(selected().textContent).toBe('Photos')
  })

  it('[HH-PORT-11] Photos: nothing yet says what will appear, including photos HandyHub asks for', async () => {
    const { fetchImpl } = api()
    open(fetchImpl, 'photos')
    const p = await screen.findByRole('tabpanel')
    expect(await within(p).findByText('No photos yet')).toBeTruthy()
    expect(
      within(p).getByText('When HandyHub asks you for photos, you can add them to your reply to the question.'),
    ).toBeTruthy()
    expect(within(p).queryByRole('img')).toBeNull()
  })

  it('[T66][HH-PORT-09][HH-ARC-10] an opened tab stays as it was while another is shown, does not poll while hidden, and refreshes when shown again', async () => {
    const { fetchImpl, count } = api({}, 1)
    open(fetchImpl, 'documents')
    const docs = await screen.findByText('No documents yet')
    const docPanel = panel()
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(docPanel.hidden).toBe(true)
    // Kept mounted, so anything in it (a draft, later a reply) survives the switch.
    expect(docPanel.contains(docs)).toBe(true)
    const before = count('documents')
    await new Promise((r) => setTimeout(r, 1300))
    expect(count('documents')).toBe(before)
    expect(count('overview')).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }))
    expect(panel()).toBe(docPanel)
    expect(docPanel.contains(docs)).toBe(true)
    await waitFor(() => expect(count('documents')).toBe(before + 1))
  })

  it('[HH-PORT-06][T19] another project: one neutral state and no tab at all; a failed tab read fails only that tab', async () => {
    const other = api({ overview: () => json(404, { error: { code: 'NOT_FOUND' } }) })
    open(other.fetchImpl, 'payments')
    expect(await screen.findByText("This project isn't available")).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(other.count('payments')).toBe(0)
    cleanup()

    let fail = true
    const flaky = api({
      messages: () => (fail ? json(503, { error: { code: 'UNAVAILABLE' } }) : json(200, TAB_BODY.messages())),
    })
    open(flaky.fetchImpl, 'messages')
    const p = await screen.findByRole('tabpanel')
    expect(await within(p).findByText("This section couldn't be loaded")).toBeTruthy()
    expect(screen.getByRole('tablist')).toBeTruthy()
    fail = false
    fireEvent.click(within(p).getByRole('button', { name: 'Try again' }))
    expect(await within(p).findByText('No messages yet')).toBeTruthy()
  })

  it('[HH-PORT-06] a tab answer that is not its declared view is a failure, never shown as data', () => {
    expect(parseTab('messages', TAB_BODY.messages())).not.toBeNull()
    expect(parseTab('messages', { ...head(), state: 'read' })).toBeNull()
    expect(parseTab('messages', { ...head(), state: 'not_shown' })).toBeNull()
    // TSK-0050: a message that is not the declared view (a staff name, a "read" state, text with the wrong state).
    const m = { from: 'handyhub', channel: 'email', at: SENT, text: 'Synthetic.', textState: 'shown', attachments: 0 }
    expect(parseTab('messages', { ...head(), messages: [m] })).not.toBeNull()
    expect(parseTab('messages', { ...head(), messages: [{ ...m, from: 'staff' }] })).toBeNull()
    expect(parseTab('messages', { ...head(), messages: [{ ...m, textState: 'not_available' }] })).toBeNull()
    expect(parseTab('messages', { ...head(), messages: [{ ...m, channel: 'internal' }] })).toBeNull()
    expect(parseTab('payments', { ...head(), state: 'paid' })).toBeNull()
    expect(parseTab('documents', TAB_BODY.messages())).toBeNull()
    expect(parseTab('photos', { ...head(), photos: { received: -1, processing: 0, failed: 0 } })).toBeNull()
    expect(parseTab('photos', { ...head(), photos: [] })).toBeNull()
    // TSK-0076: the lists are part of the view; a link that is not https or a pair with neither photo is refused.
    const counts = { received: 0, processing: 0, failed: 0 }
    expect(parseTab('photos', { ...head(), photos: counts })).toBeNull()
    expect(
      parseTab('photos', {
        ...head(),
        photos: counts,
        yours: [{ id: 'u', state: 'ready', uploadedAt: SENT, url: 'javascript:alert(1)' }],
        shared: [],
        linkSeconds: 300,
      }),
    ).toBeNull()
    expect(
      parseTab('photos', {
        ...head(),
        photos: counts,
        yours: [],
        shared: [{ service: 'X', before: null, after: null }],
        linkSeconds: 300,
      }),
    ).toBeNull()
    expect(parseTab('appointments', null)).toBeNull()
  })
})

describe('customer content is English only (TSK-0039, HH-PORT-08, HH-LANG-01, T04, RULE-LANGUAGES)', () => {
  // Staff text that only the Spanish staff catalog holds: none of it may ever reach a customer page.
  const english = new Set([...Object.values(CATALOGS['customer.en']), ...Object.values(CATALOGS['staff.en'])])
  const spanishOnly = Object.values(CATALOGS['staff.es']).filter((v) => !english.has(v) && v.length >= 6)
  const SPANISH_MARKS = /[¿¡ñáéíóú]/i

  it('[T04][HH-PORT-08][RULE-LANGUAGES] every tab renders in English: lang="en", and no Spanish staff string or mark', async () => {
    expect(spanishOnly.length).toBeGreaterThan(100)
    const { fetchImpl } = api({
      photos: () =>
        json(200, {
          ...head(),
          photos: { received: 1, processing: 1, failed: 1 },
          yours: [],
          shared: [],
          linkSeconds: 300,
        }),
    })
    const { container } = open(fetchImpl)
    await screen.findByRole('tablist')
    expect(container.querySelector('main')?.getAttribute('lang')).toBe('en')
    expect(container.querySelector('.portal')?.getAttribute('lang')).toBe('en')
    for (const name of TAB_NAMES) {
      fireEvent.click(screen.getByRole('tab', { name }))
      await within(panel()).findByText(/^Updated /)
      const text = panel().textContent ?? ''
      expect(text, name).not.toMatch(SPANISH_MARKS)
      for (const es of spanishOnly) expect(text.includes(es), `${name}: ${es}`).toBe(false)
    }
    expect(container.textContent).not.toMatch(SPANISH_MARKS)
  })

  it('[HH-PORT-08][HH-LANG-01] the portal has only the English customer catalog: no staff translator, no locale choice', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
    for (const file of readdirSync(src).filter((f) => /\.tsx?$/.test(f))) {
      const code = readFileSync(join(src, file), 'utf8')
      expect(code, file).not.toMatch(/staffTranslator|staffLabel|staff\.(en|es)|STAFF_LOCALES|navigator\.language/)
    }
    const portal = Object.entries(CATALOGS['customer.en']).filter(([k]) => k.startsWith('portal.'))
    expect(portal.length).toBeGreaterThan(80)
    for (const [key, value] of portal) expect(value, key).not.toMatch(SPANISH_MARKS)
  })
})

describe('the Payments tab (TSK-0087, HH-PORT-12)', () => {
  const listed = {
    ...head(),
    state: 'listed',
    approvedTotalCents: 112_500,
    deposit: {
      state: 'deposit_received',
      amountCents: 22_500,
      verifiedCents: null,
      pendingCents: null,
      payByCardUrl: null,
    },
    invoices: [
      {
        number: `${REF}-I1`,
        kind: 'final',
        state: 'partially_paid',
        totalCents: 112_500,
        creditsCents: 22_500,
        confirmedCents: 40_000,
        pendingCents: 20_000,
        balanceCents: 50_000,
        payByCardUrl: 'https://square.link/u/SYNTH087',
      },
    ],
    payments: [
      { receivedOn: '2026-10-20', method: 'cash', amountCents: 22_500, state: 'confirmed' },
      { receivedOn: '2026-10-21', method: 'square_payment_link', amountCents: 40_000, state: 'confirmed' },
      { receivedOn: '2026-10-21', method: 'check', amountCents: 20_000, state: 'pending' },
    ],
    confirmedCents: 62_500,
    pendingCents: 20_000,
    balanceCents: 50_000,
    instructions: {
      methods: ['square_payment_link', 'square_tap_to_pay', 'cash', 'check', 'zelle', 'cash_app', 'chime'],
      placeholder: true,
      zelle: '[Payment email or phone]',
      cashApp: '[$Cashtag]',
      chime: '[Payment handle or details]',
      checkPayee: '[Payee name]',
    },
  }

  it('[HH-PORT-12][HH-FIN-08][HH-FIN-10] the money, Pay by Card for the balance and the placeholders labelled', async () => {
    const { fetchImpl } = api({ payments: () => json(200, listed) })
    open(fetchImpl, 'payments')
    const tab = await screen.findByTestId('payments-tab')
    expect(within(tab).getByTestId('payments-balance').textContent).toBe('$500.00')
    expect(within(tab).getByTestId('payments-confirmed').textContent).toBe('$625.00')
    expect(within(tab).getByTestId('payments-pending').textContent).toBe('$200.00')
    expect(within(tab).getByTestId('payments-deposit').textContent).toBe('Deposit received: $225.00.')
    expect(within(tab).getByTestId('payments-invoice-money').textContent).toContain(
      'Total $1,125.00 · credits $225.00 · paid $400.00 · balance $500.00.',
    )
    const pay = within(tab).getByRole('link', { name: 'Pay by Card' })
    expect(pay.getAttribute('href')).toBe('https://square.link/u/SYNTH087')
    expect(pay.getAttribute('target')).toBe('_blank')
    expect(within(tab).getByTestId('payments-recorded').textContent).toContain('Pending until cleared')
    // The handles are placeholders: labelled, never a destination, no copy button; the card wording names Square.
    const how = within(tab).getByTestId('payments-instructions')
    expect(within(how).getAllByTestId('payments-placeholder')).toHaveLength(4)
    expect(within(how).getAllByText('Placeholder — not a payment destination')).toHaveLength(4)
    expect(within(how).queryByRole('button')).toBeNull()
    expect(how.textContent).toContain('Credit or debit card (Square)')
    expect(tab.textContent).not.toMatch(/surcharge|fee/i)
    expect(tab.textContent).toContain('Returning from the card payment page does not mark anything paid.')
  })

  it('[HH-FIN-08][T60] no balance or no link: no Pay by Card, never a button that does nothing', async () => {
    const paid = {
      ...listed,
      invoices: [{ ...listed.invoices[0], state: 'paid', balanceCents: 0, pendingCents: 0, payByCardUrl: null }],
      balanceCents: 0,
      pendingCents: 0,
    }
    const { fetchImpl } = api({ payments: () => json(200, paid) })
    open(fetchImpl, 'payments')
    const tab = await screen.findByTestId('payments-tab')
    expect(within(tab).queryByRole('link', { name: 'Pay by Card' })).toBeNull()
    expect(within(tab).getByTestId('payments-balance').textContent).toBe('$0.00')
  })

  it('[HH-FIN-08] a Pay by Card link that is not https is not what the view declares: never shown', () => {
    const bad = { ...listed, invoices: [{ ...listed.invoices[0], payByCardUrl: 'http://square.link/u/x' }] }
    expect(parseTab('payments', bad)).toBeNull()
    expect(parseTab('payments', listed)).toMatchObject({ tab: 'payments', state: 'listed', balanceCents: 50_000 })
  })
})
