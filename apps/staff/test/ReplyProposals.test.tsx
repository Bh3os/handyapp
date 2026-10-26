// Worker notes and proposed replies, and their Owner/Office review (TSK-0155; HH-COM-16, OWN-DEC-211, RULE-LANGUAGES,
// RULE-AI-WAVE2). The API is a synthetic stand-in; every value is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  JobNotesPage,
  MyReplyProposals,
  ReplyProposalPage,
  type JobNotes,
  type OwnProposal,
  type ProposalReview,
} from '../src/ReplyProposals'

afterEach(cleanup)

const JOB = '15515515-5155-4155-8155-155155155155'
const PROPOSAL = '25525525-5255-4255-8255-255255255255'
const PROJECT = '35535535-5355-4355-8355-355355355355'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const href = (to: string) => to

const own = (over: Partial<OwnProposal> = {}): OwnProposal => ({
  id: PROPOSAL,
  version: 2,
  jobId: JOB,
  reference: 'HH-SYNTH155',
  status: 'awaiting_review',
  text: 'Sintético: dígale que volvemos el martes.',
  clarification: null,
  rejectReason: null,
  createdAt: '2001-01-04T13:00:00.000Z',
  submittedAt: '2001-01-04T13:00:00.000Z',
  decidedAt: null,
  events: [],
  actions: { edit: false, submit: false, answer: false },
  ...over,
})
const review = (over: Partial<ProposalReview> = {}): ProposalReview => ({
  id: PROPOSAL,
  version: 2,
  status: 'awaiting_review',
  clarificationOpen: false,
  project: { id: PROJECT, reference: 'HH-SYNTH155', state: 'scheduled' },
  customer: { id: 'customer-155', displayName: 'Synthetic Customer' },
  jobId: JOB,
  author: { id: 'worker-155', name: 'Synthetic Ben' },
  originalText: 'Sintético: dígale que volvemos el martes.',
  createdAt: '2001-01-04T13:00:00.000Z',
  submittedAt: '2001-01-04T13:00:00.000Z',
  rejectReason: null,
  decided: null,
  sentMessage: null,
  events: [],
  actions: { clarify: true, reject: true, send: true },
  maxLength: 2000,
  ...over,
})
const OPTIONS = {
  contact: { id: 'contact-155', name: 'Synthetic Customer' },
  preferred: 'email',
  options: [
    { channel: 'email', destination: 'synthetic@example.test', preferred: true, available: true, reason: 'available' },
    { channel: 'sms', destination: '+15025550155', preferred: false, available: false, reason: 'no_opt_in' },
  ],
  defaultChannel: 'email',
  deliveryHours: {
    email: { sendAt: '2001-01-04T13:00:00.000Z' },
    text: {
      state: 'open',
      open: '08:00',
      close: '22:00',
      zone: 'America/Kentucky/Louisville',
      basis: 'recipient_zone',
      sendAt: '2001-01-04T13:00:00.000Z',
    },
  },
  templates: { email: 'configured', sms: 'configured' },
  maxLength: 2000,
}

describe('[HH-COM-16][OWN-DEC-211] the worker writes notes and proposed replies; nothing is sent as written', () => {
  it('shows the job page in Spanish and posts a note and a proposal for review', async () => {
    const view: JobNotes = { jobId: JOB, reference: 'HH-SYNTH155', notes: [], proposals: [], maxLength: 2000 }
    const posts: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return json(201, url.endsWith('/notes') ? { id: 'n1', body: 'x', at: '2001-01-04T13:00:00.000Z' } : own())
      }
      return json(200, view)
    })
    const { t } = staffTranslator('es')
    render(<JobNotesPage t={t} locale="es" fetchImpl={fetchImpl as unknown as typeof fetch} jobId={JOB} href={href} />)
    const page = await screen.findByTestId('job-notes')
    expect(within(page).getByText(/Nada de lo que escriba aquí llega al cliente/)).toBeTruthy()
    fireEvent.change(within(page).getByLabelText('Nota'), { target: { value: 'Sintético: nota.' } })
    fireEvent.click(within(page).getByRole('button', { name: 'Guardar la nota' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({ url: `/api/v1/staff/jobs/${JOB}/notes`, body: { body: 'Sintético: nota.' } })
    fireEvent.change(within(page).getByLabelText(/Respuesta propuesta/), {
      target: { value: 'Sintético: propuesta.' },
    })
    fireEvent.click(within(page).getByRole('button', { name: 'Enviar para revisión' }))
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1]).toEqual({
      url: `/api/v1/staff/jobs/${JOB}/reply-proposals`,
      body: { text: 'Sintético: propuesta.', submit: true },
    })
  })

  it('lists the status of each own proposal on My Day and answers an open question', async () => {
    const items = [
      own({
        clarification: { question: 'Which part? (synthetic)', askedAt: '2001-01-04T14:00:00.000Z' },
        actions: { edit: false, submit: false, answer: true },
      }),
      own({ id: 'p2', status: 'rejected', rejectReason: 'Synthetic: answered by phone.' }),
      own({ id: 'p3', status: 'sent' }),
      own({ id: 'p4', status: 'draft', actions: { edit: true, submit: true, answer: false } }),
    ]
    const posts: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return json(200, own())
      }
      return json(200, { items, limit: 100, maxLength: 2000 })
    })
    const { t } = staffTranslator('en')
    render(<MyReplyProposals t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('my-reply-proposals')
    expect(
      within(section)
        .getAllByTestId('proposal-status')
        .map((s) => s.textContent),
    ).toEqual(['Awaiting Review', 'Rejected', 'Sent', 'Draft'])
    expect(within(section).getByText('Rejected: Synthetic: answered by phone.')).toBeTruthy()
    expect(within(section).getByTestId('proposal-question').textContent).toContain('Which part? (synthetic)')
    fireEvent.change(within(section).getByLabelText('Your answer'), { target: { value: 'Sintético: la bisagra.' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Send the answer' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      url: `/api/v1/staff/reply-proposals/${PROPOSAL}/clarification-answer`,
      body: { text: 'Sintético: la bisagra.' },
    })
  })
})

describe('[HH-COM-16][RULE-LANGUAGES] the Owner or Office writes and approves the English reply', () => {
  it('shows the original as internal and sends only the reviewer’s English text after explicit approval', async () => {
    const posts: { url: string; body: unknown; key: string | null }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({
          url,
          body: JSON.parse(String(init.body)),
          key: new Headers(init.headers).get('idempotency-key'),
        })
        return json(201, {
          id: 'm1',
          conversationId: 'c1',
          delivery: { id: 'd1', channel: 'email', state: 'queued', sendAt: '', heldForTextHours: false },
        })
      }
      if (url.includes('/reply-options')) return json(200, OPTIONS)
      return json(200, review())
    })
    const { t } = staffTranslator('en')
    render(
      <ReplyProposalPage
        t={t}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        proposalId={PROPOSAL}
        href={href}
      />,
    )
    const page = await screen.findByTestId('proposal-review')
    expect(within(page).getByTestId('proposal-original').textContent).toBe('Sintético: dígale que volvemos el martes.')
    expect(within(page).getByText(/It is never sent: write the customer's message in English below/)).toBeTruthy()
    // No translation or suggested draft: the reviewer's field starts empty.
    const reply = (await within(page).findByLabelText(/^Reply/)) as HTMLTextAreaElement
    expect(reply.value).toBe('')
    fireEvent.change(reply, { target: { value: 'Synthetic: we will be back on Tuesday.' } })
    const send = within(page).getByRole('button', { name: 'Send' })
    fireEvent.click(send)
    expect(posts).toHaveLength(0)
    fireEvent.click(within(page).getByLabelText(/I reviewed this message: it is in English/))
    fireEvent.click(within(page).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]?.url).toBe(`/api/v1/staff/reply-proposals/${PROPOSAL}/send`)
    expect(posts[0]?.body).toEqual({
      body: 'Synthetic: we will be back on Tuesday.',
      channel: 'email',
      approveEnglish: true,
    })
    expect(posts[0]?.key).toBeTruthy()
  })

  it('asks the worker for clarification or rejects with a reason', async () => {
    const posts: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return json(200, review({ clarificationOpen: true, actions: { clarify: false, reject: true, send: true } }))
      }
      if (url.includes('/reply-options')) return json(200, OPTIONS)
      return json(200, review())
    })
    const { t } = staffTranslator('es')
    render(
      <ReplyProposalPage
        t={t}
        locale="es"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        proposalId={PROPOSAL}
        href={href}
      />,
    )
    const page = await screen.findByTestId('proposal-review')
    fireEvent.change(within(page).getByLabelText(/^Pregunta/), { target: { value: '¿Qué pieza? (sintético)' } })
    fireEvent.click(within(page).getByRole('button', { name: 'Pedir una aclaración' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      url: `/api/v1/staff/reply-proposals/${PROPOSAL}/clarification`,
      body: { text: '¿Qué pieza? (sintético)' },
    })
    expect(await within(page).findByText('Se pidió una aclaración')).toBeTruthy()
    fireEvent.change(within(page).getByLabelText(/^Motivo/), { target: { value: 'Sintético: ya respondido.' } })
    fireEvent.click(within(page).getByRole('button', { name: 'Rechazar la propuesta' }))
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1]).toEqual({
      url: `/api/v1/staff/reply-proposals/${PROPOSAL}/reject`,
      body: { reason: 'Sintético: ya respondido.' },
    })
  })
})
