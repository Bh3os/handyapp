// A project's customer-agreed repeat-service schedule in the staff app (TSK-0114; HH-SCH-10, T67, OWN-DEC-113,
// OWN-DEC-148). The API is a synthetic stand-in; every value is synthetic (RULE-SYNTHETIC-DATA). Fixed dates far from
// the test run, so nothing depends on the clock.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RepeatServicePage, type RepeatSchedule, type RepeatServiceData } from '../src/RepeatService'

afterEach(cleanup)

const PROJECT = '14141414-1414-4141-8141-141414141414'
const SERIES = '41414141-4141-4141-8141-414141414141'
const DRAFT = '11411411-4114-4114-8114-114114114114'
const AT = '2001-01-04T13:00:00.000Z'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const href = (to: string) => `/staff${to}`

const schedule = (over: Partial<RepeatSchedule> = {}): RepeatSchedule => ({
  id: SERIES,
  state: 'active',
  version: 3,
  nextDate: '2001-02-01',
  interval: { unit: 'week', count: 2 },
  reminders: true,
  agreedVia: 'phone',
  recordedAt: AT,
  stoppedAt: null,
  stoppedBy: null,
  upcoming: [
    { date: '2001-01-25', state: 'kept', requestReference: null },
    { date: '2001-02-01', state: 'scheduled', requestReference: null },
    { date: '2001-02-15', state: 'requested', requestReference: 'HH-SYNTH141' },
  ],
  requested: [{ date: '2001-02-15', requestId: 'request-141', reference: 'HH-SYNTH141' }],
  reminderDrafts: [
    {
      id: DRAFT,
      date: '2001-01-25',
      state: 'draft',
      reason: 'held_case_active',
      scheduledAt: null,
      sentAt: null,
      cancelledAt: null,
      createdAt: AT,
    },
  ],
  history: [
    {
      version: 1,
      change: 'recorded',
      by: { kind: 'staff', id: 'staff-1', name: 'Synthetic Office' },
      nextDate: '2001-01-25',
      interval: { unit: 'week', count: 1 },
      reminders: true,
      occurrenceDate: null,
      keptDates: [],
      agreedVia: 'phone',
      note: null,
      at: AT,
    },
    {
      version: 2,
      change: 'changed',
      by: { kind: 'customer', id: null, name: null },
      nextDate: '2001-02-01',
      interval: { unit: 'week', count: 2 },
      reminders: true,
      occurrenceDate: null,
      keptDates: ['2001-01-25'],
      agreedVia: null,
      note: null,
      at: AT,
    },
  ],
  ...over,
})
const data = (over: Partial<RepeatServiceData> = {}): RepeatServiceData => ({
  projectId: PROJECT,
  projectReference: 'HH-SYNTH114',
  zone: 'America/Kentucky/Louisville',
  changeNoticeHours: 24,
  reminderTime: 'CONFIGURED',
  reminderWording: 'NOT_CONFIGURED',
  reminderBlocks: [],
  schedules: [schedule()],
  actions: { record: false, manage: true, releaseReminders: true },
  ...over,
})

function renderPage(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, locale = 'en') {
  const { t } = staffTranslator(locale as 'en' | 'es')
  render(<RepeatServicePage t={t} fetchImpl={fetchImpl as unknown as typeof fetch} projectId={PROJECT} href={href} />)
}

describe('[HH-SCH-10][OWN-DEC-113] recording a schedule only when the customer agreed', () => {
  it('suggests nothing and refuses to send without the agreement box', async () => {
    const posts: [string, unknown][] = []
    renderPage(async (input, init) => {
      if (init?.method !== 'POST')
        return json(200, data({ schedules: [], actions: { record: true, manage: true, releaseReminders: true } }))
      posts.push([String(input), JSON.parse(String(init.body))])
      return json(201, data())
    })
    const page = await screen.findByTestId('repeat-service')
    expect(within(page).getByText('No repeat-service schedule is recorded for this project.')).toBeTruthy()
    const form = within(page).getByRole('form', { name: 'Record the schedule the customer agreed to' })
    expect((within(form).getByLabelText('Next service date') as HTMLInputElement).value).toBe('')
    expect((within(form).getByLabelText('How often') as HTMLSelectElement).value).toBe('none')
    fireEvent.change(within(form).getByLabelText('Next service date'), { target: { value: '2001-02-01' } })
    fireEvent.change(within(form).getByLabelText('How often'), { target: { value: 'month' } })
    fireEvent.change(within(form).getByLabelText('How many (days, weeks or months)'), { target: { value: '3' } })
    fireEvent.change(within(form).getByLabelText('How the customer agreed'), { target: { value: 'in_person' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Record the schedule' }))
    expect(screen.getByRole('alert').textContent).toBe('Confirm that the customer agreed to this schedule.')
    expect(posts).toEqual([])
    fireEvent.click(within(form).getByLabelText('The customer agreed to this schedule.'))
    fireEvent.click(within(form).getByRole('button', { name: 'Record the schedule' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual([
      `/api/v1/staff/projects/${PROJECT}/repeat-service`,
      {
        nextDate: '2001-02-01',
        interval: { unit: 'month', count: 3 },
        reminders: true,
        agreedVia: 'in_person',
        note: null,
        customerAgreed: true,
      },
    ])
    expect(await screen.findByText('The schedule is recorded.')).toBeTruthy()
  })

  it('waits for the property’s zone', async () => {
    renderPage(async () =>
      json(200, data({ zone: null, schedules: [], actions: { record: false, manage: true, releaseReminders: true } })),
    )
    expect(await screen.findByText('Record the property’s time zone before recording a schedule.')).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Record the schedule the customer agreed to' })).toBeNull()
  })
})

describe('[HH-SCH-10][T67][OWN-DEC-148] the schedule, its reminders and its history', () => {
  it('shows the occurrences, the held draft, the wording NOT CONFIGURED and who changed what', async () => {
    const posts: [string, unknown, string | null][] = []
    renderPage(async (input, init) => {
      if (init?.method !== 'POST') return json(200, data())
      posts.push([String(input), JSON.parse(String(init.body)), new Headers(init.headers).get('if-match')])
      return json(409, {
        error: { code: 'CONFLICT', fieldErrors: [{ field: 'reminder', code: 'TEMPLATE_NOT_CONFIGURED', message: '' }] },
      })
    })
    const current = await screen.findByTestId('repeat-current')
    expect(current.textContent).toMatch(/Every 2 weeks/)
    const upcoming = within(current).getByTestId('repeat-upcoming')
    expect(upcoming.textContent).toMatch(/2001-01-25 Kept/)
    expect(upcoming.textContent).toMatch(/2001-02-15 Requested Request HH-SYNTH141/)
    const reminders = screen.getByTestId('repeat-reminders')
    expect(
      within(reminders).getByText(
        'The reminder wording is NOT CONFIGURED: no reminder can be released until the Owner approves it.',
      ),
    ).toBeTruthy()
    expect(within(reminders).getByText('Reason: Held while a case is open on the project')).toBeTruthy()
    fireEvent.click(within(reminders).getByRole('button', { name: 'Release the reminder' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The reminder wording is NOT CONFIGURED.'))
    expect(posts).toEqual([[`/api/v1/staff/repeat-service/${SERIES}/reminders/${DRAFT}/release`, {}, null]])
    const history = screen.getByTestId('repeat-history')
    const items = within(history)
      .getAllByRole('listitem')
      .map((l) => l.textContent ?? '')
    expect(items[0]).toMatch(/^Changed · Every 2 weeks · from 2001-02-01By the customer/)
    expect(items[0]).toMatch(/Kept inside the notice: 2001-01-25/)
    expect(items[1]).toMatch(/^Recorded · Every week · from 2001-01-25Synthetic Office, .* · On the phone$/)
  })

  it('links an occurrence’s request and records a stop with the schedule’s version', async () => {
    const posts: [string, unknown, string | null][] = []
    renderPage(async (input, init) => {
      if (init?.method !== 'POST') return json(200, data())
      posts.push([String(input), JSON.parse(String(init.body)), new Headers(init.headers).get('if-match')])
      return json(409, {
        error: {
          code: 'CONFLICT',
          fieldErrors: [{ field: 'body.requestReference', code: 'NOT_THE_SAME_CUSTOMER', message: '' }],
        },
      })
    })
    await screen.findByTestId('repeat-current')
    const link = screen.getByRole('form', { name: 'The occurrence of 2001-02-01' })
    fireEvent.change(within(link).getByLabelText('Request reference'), { target: { value: ' HH-SYNTH999 ' } })
    fireEvent.click(within(link).getByRole('button', { name: 'Link the request' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('That request is not from this customer.'))
    // A stop needs how the customer asked for it.
    fireEvent.click(screen.getByRole('button', { name: 'Stop the schedule' }))
    expect(screen.getByRole('alert').textContent).toBe('Choose how the customer agreed.')
    const change = screen.getByRole('form', { name: 'Record a change the customer agreed to' })
    fireEvent.change(within(change).getByLabelText('How the customer agreed'), { target: { value: 'email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Stop the schedule' }))
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts).toEqual([
      [
        `/api/v1/staff/repeat-service/${SERIES}/occurrences/2001-02-01/link`,
        { requestReference: 'HH-SYNTH999' },
        '"3"',
      ],
      [`/api/v1/staff/repeat-service/${SERIES}/actions/stop`, { agreedVia: 'email', note: null }, '"3"'],
    ])
  })

  it('reads in Spanish', async () => {
    renderPage(async () => json(200, data()), 'es')
    const current = await screen.findByTestId('repeat-current')
    expect(current.textContent).toMatch(/Cada 2 semanas/)
    expect(screen.getByRole('heading', { name: 'Servicio recurrente · Proyecto HH-SYNTH114' })).toBeTruthy()
  })
})
