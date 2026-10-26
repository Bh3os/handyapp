// The permanent customer dashboard (TSK-0124; HH-ID-14, HH-ID-03, OWN-DEC-160, RULE-LANGUAGES): Active, Project
// History and Cancelled and archived, the documents of each project, a new request, and Add a project for an account.
// The API is a synthetic stand-in; every reference and address is invented for the test (RULE-SYNTHETIC-DATA).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App'
import type { Fetch } from '../src/api'

afterEach(cleanup)

const NOW = '2026-10-21T15:00:00.000Z'
const ACTIVE = 'HH-7K2M9Q4D'
const DONE = 'HH-3N8P5R2T'
const CLOSED = 'HH-9W4X6Y1Z'
const ADDED = 'HH-AB12CD34'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const summary = (reference: string, section: string, documents: number, situation = 'received') => ({
  reference,
  services: ['Patching & Repair'],
  notSure: false,
  submittedAt: NOW,
  status: { situation, step: 'review_details', waitingOn: 'handyhub', nextAction: 'none', since: NOW },
  section,
  documents,
})
const list = (projects: unknown[], access = 'account') => ({ projects, access, refreshedAt: NOW, refreshSeconds: 0 })

type Call = { url: string; body: unknown }
/** A fetch answering by URL; records every call with its JSON body. */
function routed(answer: (url: string, body: unknown, n: number) => Response) {
  const calls: Call[] = []
  const fetchImpl: Fetch = async (url, init) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined
    calls.push({ url, body })
    return answer(url, body, calls.filter((c) => c.url === url).length)
  }
  return { fetchImpl, calls }
}

describe('the dashboard sections (TSK-0124, HH-ID-14, OWN-DEC-160)', () => {
  it('[HH-ID-14] Active, Project History and Cancelled and archived, each project with its documents; a new request', async () => {
    const { fetchImpl } = routed(() =>
      json(
        200,
        list([
          summary(ACTIVE, 'active', 0),
          summary(DONE, 'completed', 3, 'work_complete'),
          summary(CLOSED, 'archived', 1, 'not_a_fit'),
        ]),
      ),
    )
    render(<App path="/portal/" fetchImpl={fetchImpl} />)
    const active = await screen.findByRole('region', { name: 'Active' })
    const history = screen.getByRole('region', { name: 'Project History' })
    const archived = screen.getByRole('region', { name: 'Cancelled and archived' })
    expect(within(active).getByRole('listitem', { name: `Project ${ACTIVE}` })).toBeTruthy()
    expect(within(active).getByText('No documents yet')).toBeTruthy()
    const done = within(history).getByRole('listitem', { name: `Project ${DONE}` })
    expect(within(done).getByText('3 documents')).toBeTruthy()
    expect(
      within(done)
        .getByRole('link', { name: `Documents for ${DONE}` })
        .getAttribute('href'),
    ).toBe(`/portal/p/${DONE}/documents`)
    expect(within(archived).getByRole('listitem', { name: `Project ${CLOSED}` })).toBeTruthy()
    expect(within(archived).getByText('1 document')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Request an Estimate' }).getAttribute('href')).toBe('/request')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Active',
      'Project History',
      'Cancelled and archived',
      'Add a project to your account',
    ])
  })

  it('[HH-ID-14] an empty section says so', async () => {
    const { fetchImpl } = routed(() => json(200, list([summary(ACTIVE, 'active', 0)])))
    render(<App path="/portal/" fetchImpl={fetchImpl} />)
    expect(
      within(await screen.findByRole('region', { name: 'Project History' })).getByText(
        'Completed projects appear here.',
      ),
    ).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Cancelled and archived' })).getByText(
        'Cancelled projects, and projects closed before any work was completed, appear here.',
      ),
    ).toBeTruthy()
  })
})

describe('Add a project (TSK-0124, HH-ID-14, HH-ID-03)', () => {
  it('[HH-ID-14][HH-ID-03] the reference and the contact, the code sent to the contact on that request, then the project joins the list', async () => {
    const { fetchImpl, calls } = routed((url, _body, n) => {
      if (url.endsWith('/claims/codes')) return json(202, { accepted: true, codeMinutes: 10 })
      if (url.endsWith('/claims')) return json(200, { project: { reference: ADDED } })
      return json(
        200,
        list(n === 1 ? [summary(ACTIVE, 'active', 0)] : [summary(ACTIVE, 'active', 0), summary(ADDED, 'active', 0)]),
      )
    })
    render(<App path="/portal/" fetchImpl={fetchImpl} />)
    const add = await screen.findByRole('region', { name: 'Add a project to your account' })
    fireEvent.change(within(add).getByLabelText('Request reference'), { target: { value: ` ${ADDED.toLowerCase()} ` } })
    fireEvent.change(within(add).getByLabelText('Email or mobile phone'), {
      target: { value: 'claim-portal@example.test' },
    })
    fireEvent.click(within(add).getByRole('button', { name: 'Send me a code' }))
    expect(
      await within(add).findByText(
        'If these details match a HandyHub request, we sent a code to the contact on that request. It expires in 10 minutes.',
      ),
    ).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(within(add).getByLabelText('Code')))
    fireEvent.change(within(add).getByLabelText('Code'), { target: { value: '123456' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Add this project' }))
    expect(await within(add).findByText(`Project ${ADDED} is now in your account.`)).toBeTruthy()
    expect(await screen.findByRole('listitem', { name: `Project ${ADDED}` })).toBeTruthy()
    expect(calls.filter((c) => c.url.includes('/claims'))).toEqual([
      {
        url: '/api/v1/customer/account/claims/codes',
        body: { reference: ADDED, contact: 'claim-portal@example.test' },
      },
      {
        url: '/api/v1/customer/account/claims',
        body: { reference: ADDED, contact: 'claim-portal@example.test', code: '123456' },
      },
    ])
  })

  it('[HH-ID-03] a wrong code, a malformed reference and a project already listed are told without asking the server', async () => {
    const { fetchImpl, calls } = routed((url) => {
      if (url.endsWith('/claims/codes')) return json(202, { accepted: true, codeMinutes: 10 })
      if (url.endsWith('/claims'))
        return json(400, {
          error: {
            code: 'VALIDATION_FAILED',
            fieldErrors: [{ field: 'body.code', code: 'invalid_code', message: '' }],
          },
        })
      return json(200, list([summary(ACTIVE, 'active', 0)]))
    })
    render(<App path="/portal/" fetchImpl={fetchImpl} />)
    const add = await screen.findByRole('region', { name: 'Add a project to your account' })
    const reference = within(add).getByLabelText('Request reference')
    fireEvent.change(reference, { target: { value: 'not a reference' } })
    fireEvent.change(within(add).getByLabelText('Email or mobile phone'), { target: { value: 'x@example.test' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Send me a code' }))
    expect(
      await within(add).findByText(
        'Enter the request reference as it appears on your receipt, for example HH-AB12CD34.',
      ),
    ).toBeTruthy()
    fireEvent.change(reference, { target: { value: ACTIVE } })
    fireEvent.click(within(add).getByRole('button', { name: 'Send me a code' }))
    expect(await within(add).findByText('That project is already in your account.')).toBeTruthy()
    expect(calls.filter((c) => c.url.includes('/claims'))).toEqual([])

    fireEvent.change(reference, { target: { value: ADDED } })
    fireEvent.click(within(add).getByRole('button', { name: 'Send me a code' }))
    fireEvent.change(await within(add).findByLabelText('Code'), { target: { value: '000000' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Add this project' }))
    expect(
      await within(add).findByText("That code didn't work. Check it and try again, or ask for a new code."),
    ).toBeTruthy()
    expect(screen.queryByRole('listitem', { name: `Project ${ADDED}` })).toBeNull()
  })
})
