// Organization accounts in the portal (TSK-0118; HH-ID-13, HH-ID-03, RULE-LANGUAGES). The API is a synthetic stand-in;
// every reference, address, name and email is invented for the test (RULE-SYNTHETIC-DATA).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App, routeOf } from '../src/App'
import type { Fetch } from '../src/api'

afterEach(cleanup)

const NOW = '2026-10-26T15:00:00.000Z'
const HOME = 'HH-7K2M9Q4D'
const RENTAL = 'HH-3N8P5R2T'
const ORG = '7f0c7c1e-58a4-4c39-9e0b-0c6b9d1f2a31'
const MEMBER = 'c3a1d9e2-7b44-4f0e-8a51-2d9e6f1b0c77'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const summary = (reference: string, organization: unknown = null) => ({
  reference,
  services: ['Patching & Repair'],
  notSure: false,
  submittedAt: NOW,
  status: { situation: 'work_complete', step: 'closed', waitingOn: 'nobody', nextAction: 'none', since: NOW },
  section: 'completed',
  documents: 0,
  organization,
})
const empty = { linkedProjects: [HOME, RENTAL], administered: [], memberships: [], invitations: [] }

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

describe('organizations on the dashboard (TSK-0118, HH-ID-13)', () => {
  it('[HH-ID-13] a shared project names its organization and offers no Request This Service Again', async () => {
    const shared = summary(RENTAL, { name: 'Synthetic Rentals', approve: false, pay: false })
    const { fetchImpl } = routed(() =>
      json(200, { projects: [summary(HOME), shared], access: 'account', refreshedAt: NOW, refreshSeconds: 0 }),
    )
    render(<App path="/portal/" fetchImpl={fetchImpl} />)
    const item = await screen.findByRole('listitem', { name: `Project ${RENTAL}` })
    expect(within(item).getByText('Shared with you by Synthetic Rentals')).toBeTruthy()
    expect(within(item).queryByRole('link', { name: /Request This Service Again/ })).toBeNull()
    const own = screen.getByRole('listitem', { name: `Project ${HOME}` })
    expect(within(own).getByRole('link', { name: `Request This Service Again: project ${HOME}` })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Your account' })
    expect(within(nav).getByRole('link', { name: 'Organizations' }).getAttribute('href')).toBe('/portal/organizations')
    expect(routeOf('/portal/organizations/')).toEqual({ page: 'organizations' })
  })
})

describe('the organizations page (TSK-0118, HH-ID-13)', () => {
  it('[HH-ID-13] sets up an organization, shares a project and invites an exact email with a scope and privileges', async () => {
    let state: unknown = empty
    const org = (members: unknown[], projects: string[]) => ({
      ...empty,
      administered: [{ id: ORG, name: 'Synthetic Rentals', createdAt: NOW, projects, members, history: [] }],
    })
    const { fetchImpl, calls } = routed((url, body) => {
      if (url === '/api/v1/customer/account/organizations' && body !== undefined) state = org([], [])
      else if (url.endsWith(`${ORG}/projects`)) state = org([], [HOME])
      else if (url.endsWith(`${ORG}/members`))
        state = org(
          [
            {
              id: MEMBER,
              email: 'manager@example.test',
              state: 'invited',
              approve: true,
              pay: false,
              projects: [HOME],
              invitedAt: NOW,
              acceptedAt: null,
            },
          ],
          [HOME],
        )
      return json(200, state)
    })
    render(<App path="/portal/organizations" fetchImpl={fetchImpl} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Organizations' })).toBeTruthy()
    // An empty name is refused without asking the server.
    fireEvent.click(screen.getByRole('button', { name: 'Set up organization' }))
    expect(await screen.findByText('Enter a name of up to 80 characters.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Synthetic Rentals' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set up organization' }))
    expect(await screen.findByText('Synthetic Rentals is set up. Share a project, then invite someone.')).toBeTruthy()

    const managed = screen.getByRole('region', { name: 'Synthetic Rentals' })
    expect(within(managed).getByText('No project is shared yet.')).toBeTruthy()
    fireEvent.change(within(managed).getByLabelText('Project to share'), { target: { value: HOME } })
    fireEvent.click(within(managed).getByRole('button', { name: 'Share project' }))
    expect(await screen.findByText(`Project ${HOME} is shared.`)).toBeTruthy()

    const region = screen.getByRole('region', { name: 'Synthetic Rentals' })
    // No project chosen: refused on the page; then the exact email, one project and approve.
    fireEvent.change(within(region).getByLabelText('Email address'), { target: { value: 'manager@example.test' } })
    fireEvent.click(within(region).getByRole('button', { name: 'Invite' }))
    expect(await within(region).findByText('Choose at least one shared project.')).toBeTruthy()
    fireEvent.click(within(region).getByRole('checkbox', { name: `Project ${HOME}` }))
    fireEvent.click(
      within(region).getByRole('checkbox', {
        name: 'Allow approving, declining or asking for changes to estimates and change orders, and choosing or changing appointment times',
      }),
    )
    fireEvent.click(within(region).getByRole('button', { name: 'Invite' }))
    expect(await screen.findByText('manager@example.test is invited.')).toBeTruthy()
    expect(calls.find((c) => c.url.endsWith(`${ORG}/members`))?.body).toEqual({
      email: 'manager@example.test',
      approve: true,
      pay: false,
      projects: [HOME],
    })
    const person = within(screen.getByRole('region', { name: 'Synthetic Rentals' })).getByRole('listitem', {
      name: 'manager@example.test',
    })
    expect(within(person).getByText('Invited')).toBeTruthy()
    expect(
      within(person).getByText(
        'Can approve, decline or ask for changes to estimates and change orders, and choose or change appointment times',
      ),
    ).toBeTruthy()
    expect(within(person).queryByText('Can see balances and pay')).toBeNull()
    // TSK-0150 (OWN-DEC-199, portal.organizations.done.withdrawn): an invitee never had access, so withdrawing the
    // invitation says so instead of "no longer has access".
    fireEvent.click(within(person).getByRole('button', { name: 'Withdraw the invitation to manager@example.test' }))
    expect(await screen.findByText('The invitation to manager@example.test is withdrawn.')).toBeTruthy()
    expect(screen.queryByText('manager@example.test no longer has access.')).toBeNull()
  })

  it('[HH-ID-13][HH-ID-03] an invitation shows only the name, privileges and project count until it is accepted', async () => {
    let state: unknown = {
      ...empty,
      invitations: [
        { id: MEMBER, organization: 'Synthetic Rentals', approve: false, pay: true, projects: 2, invitedAt: NOW },
      ],
    }
    const { fetchImpl } = routed((url) => {
      if (url.endsWith('/accept'))
        state = {
          ...empty,
          memberships: [
            { id: ORG, name: 'Synthetic Rentals', approve: false, pay: true, projects: [RENTAL], acceptedAt: NOW },
          ],
        }
      return json(200, state)
    })
    render(<App path="/portal/organizations" fetchImpl={fetchImpl} />)
    const invitation = await screen.findByRole('listitem', { name: 'Synthetic Rentals' })
    expect(within(invitation).getByText('Synthetic Rentals invited you to see 2 projects.')).toBeTruthy()
    expect(within(invitation).getByText('Can see balances and pay')).toBeTruthy()
    expect(screen.queryByText(RENTAL)).toBeNull()
    fireEvent.click(within(invitation).getByRole('button', { name: 'Accept the invitation from Synthetic Rentals' }))
    expect(
      await screen.findByText(
        'You joined Synthetic Rentals. The projects it shares with you are on your projects page.',
      ),
    ).toBeTruthy()
    const membership = screen.getByRole('region', { name: 'Organizations you belong to' })
    expect(
      within(membership)
        .getByRole('link', { name: `Project ${RENTAL}` })
        .getAttribute('href'),
    ).toBe(`/portal/p/${RENTAL}`)
    expect(within(membership).getByRole('button', { name: 'Leave Synthetic Rentals' })).toBeTruthy()
  })
})
