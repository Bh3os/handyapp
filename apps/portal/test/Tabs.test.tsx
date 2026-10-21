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
  messages: (s) => ({ ...head(s), state: 'not_shown' }),
  documents: (s) => ({ ...head(s), state: 'none' }),
  photos: (s) => ({ ...head(s), photos: { received: 0, processing: 0, failed: 0 } }),
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
    // Only the Overview is read until another tab is opened.
    expect(urls).toEqual([`/api/v1/customer/projects/${REF}/overview`])
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
    expect(await within(panel()).findByText("Messages aren't shown here yet")).toBeTruthy()
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
    let p = await show('Messages')
    expect(within(p).getByText("Messages aren't shown here yet")).toBeTruthy()
    expect(within(p).getByText('Your project conversation with HandyHub will appear here.')).toBeTruthy()
    expect(within(p).queryByText(/no messages/i)).toBeNull()
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

  it('[HH-PORT-09][HH-PORT-11] Photos: the counts by state as the server sent them, and that viewing is not available here yet', async () => {
    const { fetchImpl } = api({
      photos: () => json(200, { ...head(), photos: { received: 2, processing: 1, failed: 1 } }),
    })
    open(fetchImpl, 'photos')
    const p = await screen.findByRole('tabpanel')
    expect(await within(p).findByText('Received: 2')).toBeTruthy()
    expect(within(p).getByText('Processing: 1')).toBeTruthy()
    expect(within(p).getByText('Failed: 1')).toBeTruthy()
    expect(within(p).getByText("Viewing photos here isn't available yet.")).toBeTruthy()
    expect(within(p).queryByRole('img')).toBeNull()
    expect(selected().textContent).toBe('Photos')
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
    expect(await within(p).findByText("Messages aren't shown here yet")).toBeTruthy()
  })

  it('[HH-PORT-06] a tab answer that is not its declared view is a failure, never shown as data', () => {
    expect(parseTab('messages', TAB_BODY.messages())).not.toBeNull()
    expect(parseTab('messages', { ...head(), state: 'read' })).toBeNull()
    expect(parseTab('payments', { ...head(), state: 'paid' })).toBeNull()
    expect(parseTab('documents', TAB_BODY.messages())).toBeNull()
    expect(parseTab('photos', { ...head(), photos: { received: -1, processing: 0, failed: 0 } })).toBeNull()
    expect(parseTab('photos', { ...head(), photos: [] })).toBeNull()
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
      photos: () => json(200, { ...head(), photos: { received: 1, processing: 1, failed: 1 } }),
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
