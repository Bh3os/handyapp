// The unpaid-balance reminders panel of the staff app (TSK-0091; HH-FIN-19, OWN-DEC-210, OWN-DEC-112). The API is a
// synthetic stand-in; every value is synthetic (RULE-SYNTHETIC-DATA). Fixed instants far from the test run, so nothing
// depends on the clock.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  InvoiceReminders,
  InvoiceRemindersPage,
  type InvoiceReminder,
  type InvoiceRemindersData,
} from '../src/InvoiceReminders'

afterEach(cleanup)

const INVOICE = '91919191-9191-4191-8191-919191919191'
const FUTURE = '2999-01-04T13:00:00.000Z'
const PAST = '2001-01-04T13:00:00.000Z'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const reminder = (over: Partial<InvoiceReminder> = {}): InvoiceReminder => ({
  id: 'r1',
  stage: 1,
  release: 'automatic',
  state: 'queued',
  reason: null,
  scheduledAt: FUTURE,
  sentAt: null,
  cancelledAt: null,
  ...over,
})
const data = (over: Partial<InvoiceRemindersData> = {}): InvoiceRemindersData => ({
  invoiceId: INVOICE,
  jobId: 'job-91',
  projectReference: 'HH-SYNTH091',
  invoiceNumber: 'HH-SYNTH091-I1',
  invoiceState: 'issued',
  cadence: { state: 'CONFIGURED', proposed: false, firstDaysAfterDue: 3, secondDaysAfterDue: 7 },
  dueOn: '2999-01-01',
  dueRevised: false,
  stageDueAt: [
    { stage: 1, dueAt: FUTURE },
    { stage: 2, dueAt: FUTURE },
  ],
  stoppedBy: null,
  reminders: [reminder(), reminder({ id: 'r2', stage: 2 })],
  steps: [],
  review: false,
  overdue: false,
  actions: {
    recordStep: true,
    releaseFollowUp: false,
    followUpBlockedBy: 'automatic_reminders_pending',
    decideOverdue: false,
  },
  ...over,
})

function renderPanel(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(<InvoiceReminders t={t} fetchImpl={fetchImpl as unknown as typeof fetch} invoiceId={INVOICE} />)
}

describe('[HH-FIN-19][OWN-DEC-210] the payment reminders panel', () => {
  it('shows the two automatic reminders after the due date; nobody sends them; no follow-up before the second', async () => {
    renderPanel(vi.fn(async () => json(200, data())))
    const panel = await screen.findByTestId('invoice-reminders')
    expect(within(panel).getByRole('heading', { name: 'Payment reminders' })).toBeTruthy()
    expect(within(panel).getByText(/Sent automatically 3 days and 7 days after the due date\./)).toBeTruthy()
    expect(within(panel).getByText(/Due date: 2999-01-01 \(the payment term\)/)).toBeTruthy()
    expect(within(panel).getByText(/never an amount, a fee or a threat/)).toBeTruthy()
    const items = within(panel).getAllByTestId('invoice-reminder')
    expect(items.map((i) => within(i).getByText(/^Reminder \d by email$/).textContent)).toEqual([
      'Reminder 1 by email',
      'Reminder 2 by email',
    ])
    expect(within(items[0] as HTMLElement).getByText('Scheduled')).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Send a follow-up reminder' })).toBeNull()
    expect(
      within(panel).getByText('No follow-up reminder now: The automatic reminders are still to come.'),
    ).toBeTruthy()
  })

  it('a payment suspends them: the stop reason, the review, and the follow-up the staff may release', async () => {
    const posts: { url: string; body: unknown; key: string | null }[] = []
    const suspended = data({
      stoppedBy: 'payment_recorded',
      review: true,
      reminders: [
        reminder({ state: 'cancelled', reason: 'payment_recorded', scheduledAt: null, cancelledAt: PAST }),
        reminder({
          id: 'r2',
          stage: 2,
          state: 'cancelled',
          reason: 'payment_recorded',
          scheduledAt: null,
          cancelledAt: PAST,
        }),
      ],
      actions: { recordStep: true, releaseFollowUp: true, followUpBlockedBy: null, decideOverdue: false },
    })
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({
          url,
          body: JSON.parse(String(init.body)),
          key: new Headers(init.headers).get('idempotency-key'),
        })
        return json(201, {
          ...suspended,
          review: false,
          reminders: [
            ...suspended.reminders,
            reminder({ id: 'f1', stage: null, release: 'staff_released', state: 'queued', scheduledAt: null }),
          ],
          steps: [
            {
              id: 's1',
              kind: 'follow_up_released',
              dueOn: null,
              endsStepId: null,
              ended: false,
              note: null,
              recordedBy: { id: 'o', name: 'Synthetic Office' },
              recordedAt: PAST,
            },
          ],
        })
      }
      return json(200, suspended)
    })
    renderPanel(fetchImpl)
    await screen.findByText(
      'No automatic reminder now: A payment was recorded: the reminders are suspended until staff confirm the next step.',
    )
    expect(screen.getByTestId('invoice-reminders-review').textContent).toMatch(/Confirm the next step/)
    expect(
      screen.getAllByText(
        'Reason: A payment was recorded: the reminders are suspended until staff confirm the next step',
      ),
    ).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Send a follow-up reminder' }))
    await screen.findByText('Follow-up reminder released.')
    expect(posts).toEqual([
      {
        url: `/api/v1/staff/invoices/${INVOICE}/reminders/follow-up`,
        body: { note: null },
        key: expect.stringMatching(/^staff-/),
      },
    ])
    expect(screen.getByText('Follow-up reminder by email')).toBeTruthy()
    expect(screen.getByText('Follow-up reminder released')).toBeTruthy()
    expect(screen.queryByTestId('invoice-reminders-review')).toBeNull()
  })

  it('records a revised due date with a note; a note is required; a refusal names its reason', async () => {
    const posts: unknown[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return json(422, {
          error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.dueOn', code: 'DUE_DATE_IN_PAST' }] },
        })
      }
      return json(200, data())
    })
    renderPanel(fetchImpl)
    const form = await screen.findByRole('form', { name: 'Record a collection step' })
    fireEvent.change(within(form).getByLabelText(/New due date/), { target: { value: '2001-01-01' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Record the step' }))
    await screen.findByText('Write a note first.')
    expect(posts).toEqual([])
    fireEvent.change(within(form).getByLabelText(/^Note/), { target: { value: 'Synthetic: agreed by phone.' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Record the step' }))
    await screen.findByText('The new due date cannot be in the past.')
    expect(posts).toEqual([{ kind: 'revised_due_date', note: 'Synthetic: agreed by phone.', dueOn: '2001-01-01' }])
  })

  it('Overdue—owner decision: the Owner records it; an active plan can be ended', async () => {
    const posts: { url: string; body: unknown }[] = []
    const overdue = data({
      overdue: true,
      stoppedBy: 'payment_plan',
      reminders: [
        reminder({ state: 'sent', scheduledAt: null, sentAt: PAST }),
        reminder({ id: 'r2', stage: 2, state: 'delivered', scheduledAt: null, sentAt: PAST }),
      ],
      steps: [
        {
          id: 'plan-1',
          kind: 'payment_plan',
          dueOn: null,
          endsStepId: null,
          ended: false,
          note: 'Synthetic: three payments.',
          recordedBy: { id: 'o', name: 'Synthetic Owner' },
          recordedAt: PAST,
        },
      ],
      actions: { recordStep: true, releaseFollowUp: false, followUpBlockedBy: 'payment_plan', decideOverdue: true },
    })
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return json(200, { ...overdue, overdue: false, actions: { ...overdue.actions, decideOverdue: false } })
      }
      return json(200, overdue)
    })
    renderPanel(fetchImpl)
    expect((await screen.findByTestId('invoice-reminders-overdue')).textContent).toContain('Overdue—owner decision')
    expect(screen.getByTestId('invoice-collection-step').textContent).toContain('Synthetic: three payments.')
    const decide = screen.getByRole('form', { name: 'Overdue—owner decision' })
    expect(within(decide).getByText(/Nothing is ever sent to collections and no fee is added\./)).toBeTruthy()
    fireEvent.change(within(decide).getByLabelText(/^Note/), { target: { value: 'Synthetic: keep following up.' } })
    fireEvent.click(within(decide).getByRole('button', { name: 'Record the decision: keep following up' }))
    await screen.findByText('Decision recorded.')
    expect(posts[0]).toEqual({
      url: `/api/v1/staff/invoices/${INVOICE}/overdue-decision`,
      body: { note: 'Synthetic: keep following up.' },
    })
    expect(screen.getByRole('button', { name: 'End the Payment plan' })).toBeTruthy()
  })

  it('NOT CONFIGURED says so; nothing for a caller who may not read it; Spanish staff labels', async () => {
    renderPanel(
      vi.fn(async () => json(200, data({ cadence: { state: 'NOT_CONFIGURED' }, stageDueAt: [], reminders: [] }))),
    )
    await screen.findByText('The reminder schedule is not configured, so no reminder is scheduled.')
    cleanup()
    const refused = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    renderPanel(refused)
    await waitFor(() => expect(refused).toHaveBeenCalled())
    expect(screen.queryByTestId('invoice-reminders')).toBeNull()
    cleanup()
    renderPanel(
      vi.fn(async () => json(200, data())),
      'es',
    )
    await screen.findByRole('heading', { name: 'Recordatorios de pago' })
    expect(screen.getByText('Recordatorio 1 por correo')).toBeTruthy()
  })

  it('the page from the queue links to the job’s payments', async () => {
    const { t } = staffTranslator('en')
    render(
      <InvoiceRemindersPage
        t={t}
        fetchImpl={vi.fn(async () => json(200, data())) as unknown as typeof fetch}
        href={(p) => `/staff${p}`}
        invoiceId={INVOICE}
      />,
    )
    await screen.findByRole('heading', { name: 'Payment reminders for invoice HH-SYNTH091-I1' })
    expect(screen.getByRole('link', { name: 'Open the payments of project HH-SYNTH091' }).getAttribute('href')).toBe(
      '/staff/payments/job-91',
    )
  })
})
