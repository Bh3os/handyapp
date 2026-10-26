// A job's closeout and follow-ups in the staff app (TSK-0092; HH-QA-09, HH-QA-10, OWN-DEC-77, OWN-DEC-157,
// OWN-DEC-113). The API is a synthetic stand-in; every value is synthetic (RULE-SYNTHETIC-DATA). Fixed instants far
// from the test run, so nothing depends on the clock.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloseoutPage, type CloseoutData } from '../src/Closeout'

afterEach(cleanup)

const JOB = '92929292-9292-4292-8292-929292929292'
const AT = '2001-01-04T13:00:00.000Z'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const href = (to: string) => `/staff${to}`

const data = (over: Partial<CloseoutData> = {}, followUps: Partial<CloseoutData['followUps']> = {}): CloseoutData => ({
  jobId: JOB,
  projectId: 'project-92',
  projectReference: 'HH-SYNTH092',
  jobState: 'operationally_complete',
  version: 7,
  obligations: ['BALANCE_NOT_TRACKED', 'OPEN_CASES'],
  history: [],
  followUps: {
    cadence: { state: 'CONFIGURED', daysAfterCompletion: 2 },
    satisfactionDueAt: AT,
    items: [],
    satisfactionBlockedBy: null,
    reviewBlockedBy: null,
    reviewWording: 'NOT_CONFIGURED',
    responses: [],
    ...followUps,
  },
  actions: { close: true, reopen: false, releaseFollowUps: true, prepareReviewRequest: true, recordResponse: true },
  ...over,
})

function renderPage(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, locale = 'en') {
  const { t } = staffTranslator(locale as 'en' | 'es')
  render(<CloseoutPage t={t} fetchImpl={fetchImpl as unknown as typeof fetch} jobId={JOB} href={href} />)
}

describe('[HH-QA-09] closing a job', () => {
  it('names every obligation still open; the refusal names them too; the close sends the version', async () => {
    const posts: [string, unknown, string | null][] = []
    renderPage(async (input, init) => {
      const url = String(input)
      if (init?.method !== 'POST') return json(200, data())
      posts.push([url, JSON.parse(String(init.body)), new Headers(init.headers).get('if-match')])
      return json(409, {
        error: {
          code: 'CONFLICT',
          fieldErrors: [
            { field: 'job', code: 'BALANCE_NOT_TRACKED', message: '' },
            { field: 'job', code: 'OPEN_CASES', message: '' },
          ],
        },
      })
    })
    const page = await screen.findByTestId('closeout')
    expect(within(page).getByRole('heading', { name: 'Closeout of project HH-SYNTH092' })).toBeTruthy()
    const open = within(page).getByTestId('closeout-obligations')
    expect(
      within(open)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual([
      'The balance is neither paid nor tracked by a payment plan, a collection hold or the overdue decision.',
      'A case on the project is not closed.',
    ])
    expect(within(page).getByRole('link', { name: 'Quality review' }).getAttribute('href')).toBe(
      `/staff/quality-reviews/${JOB}`,
    )
    fireEvent.click(within(page).getByRole('button', { name: 'Close this job' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/A case on the project is not closed\./))
    expect(posts).toEqual([[`/api/v1/staff/jobs/${JOB}/closeout/actions/close`, { note: null }, '"7"']])
    // Only the Owner reopens: no reopen form here.
    expect(within(page).queryByRole('button', { name: 'Reopen this job' })).toBeNull()
  })

  it('[OWN-DEC-77] the Owner reopens a closed job with a reason, after the password prompt', async () => {
    const posts: [string, unknown][] = []
    let fresh = false
    const closed = data({
      jobState: 'closed',
      obligations: [],
      actions: {
        close: false,
        reopen: true,
        releaseFollowUps: true,
        prepareReviewRequest: false,
        recordResponse: true,
      },
      history: [
        {
          id: 'e1',
          event: 'closed',
          fromState: 'operationally_complete',
          financialBasis: 'paid',
          reason: null,
          recordedBy: { id: 'o', name: 'Synthetic Owner' },
          recordedAt: AT,
        },
      ],
    })
    renderPage(async (input, init) => {
      const url = String(input)
      if (init?.method !== 'POST') return json(200, closed)
      posts.push([url, JSON.parse(String(init.body))])
      if (url.endsWith('/staff/auth/reauth')) {
        fresh = true
        return json(200, { csrfToken: 'synthetic-csrf' })
      }
      if (!fresh) return json(403, { error: { code: 'FRESH_AUTH_REQUIRED', fieldErrors: [] } })
      return json(200, { ...closed, jobState: 'reopened', actions: { ...closed.actions, reopen: false, close: true } })
    })
    const page = await screen.findByTestId('closeout')
    expect(within(page).getByText('This job is closed.')).toBeTruthy()
    expect(within(page).getByTestId('closeout-history').textContent).toMatch(/Closed · final invoice paid/)
    fireEvent.click(within(page).getByRole('button', { name: 'Reopen this job' }))
    expect(screen.getByRole('alert').textContent).toBe('Write the reason first.')
    fireEvent.change(within(page).getByLabelText(/Reason/), { target: { value: 'Synthetic: closed by mistake' } })
    fireEvent.click(within(page).getByRole('button', { name: 'Reopen this job' }))
    const prompt = await screen.findByTestId('owner-reauth')
    fireEvent.change(within(prompt).getByLabelText(/Password/), { target: { value: 'synthetic passphrase' } })
    fireEvent.click(within(prompt).getByRole('button', { name: 'Confirm password' }))
    expect(await screen.findByText('The job is reopened.')).toBeTruthy()
    expect(posts).toEqual([
      [`/api/v1/staff/jobs/${JOB}/closeout/actions/reopen`, { reason: 'Synthetic: closed by mistake' }],
      ['/api/v1/staff/auth/reauth', { password: 'synthetic passphrase' }],
      [`/api/v1/staff/jobs/${JOB}/closeout/actions/reopen`, { reason: 'Synthetic: closed by mistake' }],
    ])
  })
})

describe('[HH-QA-10][OWN-DEC-113] follow-ups', () => {
  it('shows a held follow-up, releases a draft, and says the review wording is not configured', async () => {
    const posts: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') posts.push(String(input))
      return json(
        200,
        data(
          {},
          {
            items: [
              {
                id: 'd1',
                kind: 'satisfaction',
                state: 'draft',
                reason: 'held_case_active',
                scheduledAt: null,
                sentAt: null,
                cancelledAt: null,
                createdAt: AT,
              },
            ],
            satisfactionBlockedBy: 'case_active',
          },
        ),
      )
    })
    renderPage(fetchImpl)
    const box = await screen.findByTestId('follow-ups')
    expect(within(box).getByText(/prepared 2 days after the Owner's quality review passed/)).toBeTruthy()
    expect(within(box).getByTestId('satisfaction-blocked').textContent).toMatch(/a case is open on the project/)
    const item = within(box).getByTestId('follow-up')
    expect(within(item).getByText('Follow-up after completion')).toBeTruthy()
    expect(within(item).getByText(/Held while a case is open on the project/)).toBeTruthy()
    expect(
      within(box).getByText(/The review request wording and where reviews are left are not configured yet/),
    ).toBeTruthy()
    // Never gated on the customer's answer: the hint says so.
    expect(within(box).getByText(/same eligibility whatever the customer answered/)).toBeTruthy()
    fireEvent.click(within(item).getByRole('button', { name: 'Send: Follow-up after completion' }))
    await waitFor(() => expect(posts).toEqual([`/api/v1/staff/jobs/${JOB}/follow-ups/d1/release`]))
  })

  it('records the customer answer; Spanish', async () => {
    const posts: [string, unknown][] = []
    renderPage(async (input, init) => {
      if (init?.method === 'POST') {
        posts.push([String(input), JSON.parse(String(init.body))])
        return json(201, data({}, { responses: [] }))
      }
      return json(200, data())
    }, 'es')
    const box = await screen.findByTestId('follow-ups')
    expect(within(box).getByRole('heading', { name: 'Seguimientos' })).toBeTruthy()
    fireEvent.change(within(box).getByLabelText('Respuesta'), { target: { value: 'negative' } })
    fireEvent.click(within(box).getByRole('button', { name: 'Registrar la respuesta' }))
    await waitFor(() =>
      expect(posts).toEqual([[`/api/v1/staff/jobs/${JOB}/satisfaction-responses`, { answer: 'negative', note: null }]]),
    )
    expect(within(box).getByRole('button', { name: 'Preparar una solicitud de reseña' })).toBeTruthy()
  })
})
