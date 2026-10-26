// Saved properties, preferences and Request This Service Again in the portal (TSK-0113; HH-ID-12, HH-ID-03, HH-COM-05,
// OWN-DEC-113, RULE-LANGUAGES). The API is a synthetic stand-in; every reference, address and name is invented for the
// test (RULE-SYNTHETIC-DATA).
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App, routeOf } from '../src/App'
import type { Fetch } from '../src/api'

afterEach(cleanup)

const NOW = '2026-10-26T15:00:00.000Z'
const HOME = 'HH-7K2M9Q4D'
const RENTAL = 'HH-3N8P5R2T'
const SAVED_ID = '0b6f8a52-1c1e-4c55-9a43-6f0f1c2d3e4f'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const summary = (reference: string, section: string) => ({
  reference,
  services: ['Patching & Repair'],
  notSure: false,
  submittedAt: NOW,
  status: { situation: 'work_complete', step: 'closed', waitingOn: 'nobody', nextAction: 'none', since: NOW },
  section,
  documents: 0,
})
const list = (projects: unknown[], access: string) => ({ projects, access, refreshedAt: NOW, refreshSeconds: 0 })
const address = (street: string) => ({
  street,
  unit: null,
  city: 'Testville',
  state: 'KY',
  zip: '40000',
  propertyType: 'house',
})

type Call = { url: string; body: unknown }
function routed(answer: (url: string, body: unknown) => Response) {
  const calls: Call[] = []
  const fetchImpl: Fetch = async (url, init) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined
    calls.push({ url, body })
    return answer(url, body)
  }
  return { fetchImpl, calls }
}

describe('the account dashboard (TSK-0113, HH-ID-12)', () => {
  it('[HH-ID-12][OWN-DEC-113] an account offers Request This Service Again on each project and links to its properties and preferences', async () => {
    const { fetchImpl } = routed(() => json(200, list([summary(HOME, 'completed')], 'account')))
    render(<App path="/portal/" fetchImpl={fetchImpl} />)
    const item = await screen.findByRole('listitem', { name: `Project ${HOME}` })
    const again = within(item).getByRole('link', { name: `Request This Service Again: project ${HOME}` })
    expect(again.textContent).toBe('Request This Service Again')
    expect(again.getAttribute('href')).toBe(`/request?again=${HOME}`)
    const nav = screen.getByRole('navigation', { name: 'Your account' })
    expect(within(nav).getByRole('link', { name: 'Saved properties' }).getAttribute('href')).toBe('/portal/properties')
    expect(within(nav).getByRole('link', { name: 'Preferences' }).getAttribute('href')).toBe('/portal/preferences')
  })

  it('[HH-ID-03] a guest link’s project offers neither', async () => {
    const { fetchImpl } = routed(() => json(200, list([summary(HOME, 'completed')], 'project_link')))
    render(<App path="/portal/" fetchImpl={fetchImpl} />)
    const item = await screen.findByRole('listitem', { name: `Project ${HOME}` })
    expect(within(item).queryByRole('link', { name: /Request This Service Again/ })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Your account' })).toBeNull()
  })

  it('routes the two account pages', () => {
    expect(routeOf('/portal/properties')).toEqual({ page: 'properties' })
    expect(routeOf('/portal/preferences/')).toEqual({ page: 'preferences' })
  })
})

describe('saved properties (TSK-0113, HH-ID-12)', () => {
  const saved = { reference: HOME, address: address('113 Synthetic Lane'), saved: { id: SAVED_ID, label: 'Home' } }
  const unsaved = { reference: RENTAL, address: address('200 Second Synthetic Street'), saved: null }

  it('[HH-ID-12] names an address of the account’s projects, renames and removes a name, and starts a request at one', async () => {
    let state: unknown[] = [unsaved]
    const { fetchImpl, calls } = routed((url, body) => {
      if (url === '/api/v1/customer/account/properties' && body !== undefined) {
        state = [{ ...unsaved, saved: { id: SAVED_ID, label: (body as { label: string }).label } }]
        return json(200, { properties: state })
      }
      if (url.endsWith('/remove')) {
        state = [unsaved]
        return json(200, { properties: state })
      }
      if (url.endsWith(SAVED_ID)) {
        state = [{ ...unsaved, saved: { id: SAVED_ID, label: (body as { label: string }).label } }]
        return json(200, { properties: state })
      }
      return json(200, { properties: state })
    })
    render(<App path="/portal/properties" fetchImpl={fetchImpl} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Saved properties' })).toBeTruthy()
    const other = screen.getByRole('region', { name: 'Addresses from your projects' })
    const item = within(other).getByRole('listitem', { name: '200 Second Synthetic Street, Testville, KY 40000' })
    expect(within(item).getByText(`Latest project: ${RENTAL}`)).toBeTruthy()
    // An empty name is refused without asking the server.
    fireEvent.click(within(item).getByRole('button', { name: 'Save property' }))
    expect(await within(item).findByText('Enter a name of up to 60 characters.')).toBeTruthy()
    fireEvent.change(within(item).getByLabelText('Name for this property'), { target: { value: 'Rental' } })
    fireEvent.click(within(item).getByRole('button', { name: 'Save property' }))
    expect(await screen.findByText('Saved as Rental.')).toBeTruthy()

    const mine = screen.getByRole('region', { name: 'Your saved properties' })
    const rental = within(mine).getByRole('listitem', { name: 'Rental' })
    expect(within(rental).getByRole('link', { name: 'Request a service at Rental' }).getAttribute('href')).toBe(
      `/request?property=${SAVED_ID}`,
    )
    fireEvent.click(within(rental).getByRole('button', { name: 'Rename Rental' }))
    fireEvent.change(within(rental).getByLabelText('Name for this property'), { target: { value: 'Duplex' } })
    fireEvent.click(within(rental).getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('Renamed to Duplex.')).toBeTruthy()
    const duplex = within(screen.getByRole('region', { name: 'Your saved properties' })).getByRole('listitem', {
      name: 'Duplex',
    })
    fireEvent.click(within(duplex).getByRole('button', { name: 'Remove Duplex' }))
    expect(
      await screen.findByText('Duplex was removed from your saved properties. Your projects are unchanged.'),
    ).toBeTruthy()
    expect(screen.getByText("You haven't saved a property yet.")).toBeTruthy()
    expect(calls.filter((c) => c.body !== undefined)).toEqual([
      { url: '/api/v1/customer/account/properties', body: { reference: RENTAL, label: 'Rental' } },
      { url: `/api/v1/customer/account/properties/${SAVED_ID}`, body: { label: 'Duplex' } },
      { url: `/api/v1/customer/account/properties/${SAVED_ID}/remove`, body: {} },
    ])
  })

  it('[HH-ID-12] a name the account already uses is said beside the field; nothing changes', async () => {
    const { fetchImpl } = routed((url, body) =>
      body !== undefined
        ? json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'body.label', code: 'label_in_use' }] } })
        : json(200, { properties: [saved, unsaved] }),
    )
    render(<App path="/portal/properties" fetchImpl={fetchImpl} />)
    const other = await screen.findByRole('region', { name: 'Addresses from your projects' })
    fireEvent.change(within(other).getByLabelText('Name for this property'), { target: { value: 'home' } })
    fireEvent.click(within(other).getByRole('button', { name: 'Save property' }))
    expect(await within(other).findByText('You already use that name. Choose another.')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Your saved properties' })).getAllByRole('listitem')).toHaveLength(
      1,
    )
  })

  it('[HH-ID-03] a session that is not an account’s sees that the page is not available', async () => {
    const { fetchImpl } = routed(() => json(404, { error: { code: 'NOT_FOUND' } }))
    render(<App path="/portal/properties" fetchImpl={fetchImpl} />)
    expect(await screen.findByText("This project isn't available")).toBeTruthy()
  })
})

describe('preferences (TSK-0113, HH-ID-12, HH-COM-05)', () => {
  const prefs = (over: Record<string, unknown> = {}) => ({
    preferredChannel: null,
    email: { destination: 'p***@example.test', marketing: 'granted', followUps: 'none' },
    phone: { destination: '***0113', texts: 'withdrawn', marketing: 'none', followUps: 'none' },
    ...over,
  })

  it('[HH-COM-05] stops a permission, gives an email permission back with the privacy notice, and never offers texts', async () => {
    let current = prefs()
    const { fetchImpl, calls } = routed((url, body) => {
      if (url.endsWith('/permissions')) {
        const b = body as { permission: string; granted: boolean }
        current = prefs({
          email: { ...current.email, marketing: b.granted ? 'granted' : 'withdrawn' },
        })
        return json(200, current)
      }
      if (url.endsWith('/preferences') && body !== undefined) {
        current = { ...current, preferredChannel: (body as { preferredChannel: null }).preferredChannel }
        return json(200, current)
      }
      return json(200, current)
    })
    render(<App path="/portal/preferences" fetchImpl={fetchImpl} />)
    const email = await screen.findByRole('region', { name: 'Email p***@example.test' })
    const marketing = within(email).getByTestId('permission-email-marketing')
    expect(marketing.textContent).toContain('Marketing messages: On')
    // Follow-ups are on until stopped.
    expect(within(email).getByTestId('permission-email-follow_ups').textContent).toContain(': On')
    fireEvent.click(within(marketing).getByRole('button', { name: 'Stop marketing messages' }))
    expect(await screen.findByText('Your choice is saved.')).toBeTruthy()
    const off = within(screen.getByRole('region', { name: 'Email p***@example.test' })).getByTestId(
      'permission-email-marketing',
    )
    expect(off.textContent).toContain('Marketing messages: Off')
    expect(within(off).getByRole('link', { name: /Privacy Policy/ })).toBeTruthy()
    fireEvent.click(within(off).getByRole('button', { name: 'Allow marketing messages' }))
    expect(
      await within(screen.getByRole('region', { name: 'Email p***@example.test' })).findByRole('button', {
        name: 'Stop marketing messages',
      }),
    ).toBeTruthy()

    // Texts that were stopped are not turned back on here.
    const phone = screen.getByRole('region', { name: 'Phone ***0113' })
    const texts = within(phone).getByTestId('permission-sms-texts')
    expect(texts.textContent).toContain('Texts about your projects: Off')
    expect(within(texts).queryByRole('button')).toBeNull()
    expect(within(texts).getByText('To receive texts again, agree to texts on your next request.')).toBeTruthy()
    // Marketing by text was never given: nothing to stop, nothing to give here.
    expect(within(within(phone).getByTestId('permission-sms-marketing')).queryByRole('button')).toBeNull()

    // The contact method new requests start with.
    fireEvent.click(screen.getByLabelText('Phone call'))
    fireEvent.click(screen.getByRole('button', { name: 'Save contact preference' }))
    expect(await screen.findByText('Your contact preference is saved.')).toBeTruthy()
    expect(calls.filter((c) => c.body !== undefined)).toEqual([
      {
        url: '/api/v1/customer/account/permissions',
        body: { channel: 'email', permission: 'marketing', granted: false },
      },
      {
        url: '/api/v1/customer/account/permissions',
        body: {
          channel: 'email',
          permission: 'marketing',
          granted: true,
          privacyNoticeVersion: PRIVACY_NOTICE.documentId,
        },
      },
      { url: '/api/v1/customer/account/preferences', body: { preferredChannel: 'call' } },
    ])
  })
})
