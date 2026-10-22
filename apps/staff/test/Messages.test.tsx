// The message delivery screen (TSK-0119; HH-COM-14, HH-COM-13, HH-COM-02, OWN-DEC-152). The API is a synthetic stand-in
// (RULE-SYNTHETIC-DATA): references, names and links are test inputs, not business facts. The server decides what is
// listed and whether a Retry is offered; these tests check the screen shows what it is given, in English and Spanish.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliveriesQuery, MessagesScreen, type Delivery, type TemplateEntry, type VariableEntry } from '../src/Messages'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const delivery = (over: Partial<Delivery> = {}): Delivery => ({
  id: '33333333-3333-4333-8333-333333333333',
  messageKey: 'question.notice',
  templateId: 'question_notice',
  templateVersion: 2,
  layoutVersion: 1,
  channel: 'email',
  audience: 'customer',
  release: 'automatic',
  lifecycle: 'PROVIDER_ACCEPTED',
  intercepted: true,
  destination: 's•••@example.test',
  project: { id: '44444444-4444-4444-8444-444444444444', reference: 'HH-0000TEST' },
  createdAt: '2026-10-02T15:00:00.000Z',
  queuedAt: '2026-10-02T15:00:00.000Z',
  scheduledAt: '2026-10-02T15:00:00.000Z',
  sentAt: '2026-10-02T15:00:01.000Z',
  statusAt: null,
  attempts: 1,
  errorCode: null,
  missingVariables: [],
  consentDecision: 'allowed',
  retryAvailable: false,
  history: [{ attempt: 1, state: 'queued', errorCode: null, at: '2026-10-02T15:00:01.000Z' }],
  ...over,
})
const failed = delivery({
  id: '55555555-5555-4555-8555-555555555555',
  messageKey: 'request.receipt',
  templateId: 'request_received',
  lifecycle: 'FAILED',
  intercepted: false,
  sentAt: null,
  errorCode: 'template_values_not_wired',
  missingVariables: ['customerName'],
  retryAvailable: true,
})
const templates: TemplateEntry[] = [
  {
    messageKey: 'request.receipt',
    templateId: 'request_received',
    audience: 'customer',
    channels: ['email'],
    category: 'transactional',
    release: 'automatic',
    variables: ['customerName', 'reference'],
    versions: [
      {
        channel: 'email',
        locale: 'en',
        version: 1,
        releasedAt: '2026-10-02T15:00:00.000Z',
        translationReview: 'source',
        readiness: 'not_wired',
        unwired: ['customerName'],
        sourceIds: ['OWN-DEC-151'],
      },
    ],
  },
  {
    messageKey: 'job.paused',
    templateId: 'work_paused',
    audience: 'customer',
    channels: ['email'],
    category: 'transactional',
    release: 'owner',
    variables: ['customerName', 'jobNumber'],
    versions: [
      {
        channel: 'email',
        locale: 'en',
        version: null,
        releasedAt: null,
        translationReview: null,
        readiness: 'not_configured',
        unwired: [],
        sourceIds: [],
      },
    ],
  },
]
const variables: VariableEntry[] = [
  {
    name: 'customerName',
    kind: 'name',
    meaning: 'The customer first name',
    source: 'synthetic',
    subject: false,
    required: false,
    fallback: 'Hi there,',
    sensitive: false,
    customerForbidden: false,
  },
]

function api() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/retry') && init?.method === 'POST') return json(200, { id: failed.id, state: 'queued' })
    if (url.startsWith('/api/v1/staff/message-deliveries'))
      return json(200, { items: [delivery(), failed], nextCursor: null })
    if (url.includes('/preview?'))
      return json(200, {
        messageKey: 'request.receipt',
        templateId: 'request_received',
        version: 1,
        channel: 'email',
        locale: 'en',
        subject: 'HandyHub | Synthetic subject',
        text: 'Hi Sample,\n\nSynthetic preview text',
        html: '<!doctype html><p>Synthetic</p>',
        sample: true,
      })
    if (url === '/api/v1/staff/message-templates') return json(200, { templates, variables })
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

describe('[HH-COM-14] the message delivery screen', () => {
  it('[HH-COM-14][HH-COM-02] shows each message state truthfully; an intercepted message is never delivered', async () => {
    const fetchImpl = api()
    render(<MessagesScreen t={staffTranslator('en').t} locale="en" fetchImpl={fetchImpl} />)
    const list = await screen.findByRole('list', { name: 'Messages' })
    const items = within(list)
      .getAllByRole('listitem')
      .filter((li) => li.dataset['messageKey'])
    expect(items).toHaveLength(2)
    expect(within(items[0] as HTMLElement).getByText('Accepted by the provider')).toBeTruthy()
    expect(within(items[0] as HTMLElement).getByText(/intercepted, never delivered/)).toBeTruthy()
    expect(within(items[0] as HTMLElement).getByText('Email to s•••@example.test')).toBeTruthy()
    expect(within(items[0] as HTMLElement).queryByText('Delivered')).toBeNull()
    const second = items[1] as HTMLElement
    expect(within(second).getByText('Failed')).toBeTruthy()
    expect(within(second).getByText(/does not supply its values yet/)).toBeTruthy()
    expect(within(second).getByText('Values: customerName')).toBeTruthy()
    fireEvent.click(within(second).getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(fetchImpl).toHaveBeenCalledWith(
        `/api/v1/staff/message-deliveries/${failed.id}/retry`,
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findByText('Queued again.')).toBeTruthy()
  })

  it('[HH-COM-14] sends the filters to the server', () => {
    expect(deliveriesQuery({ group: '', reference: '' })).toBe('/staff/message-deliveries')
    expect(deliveriesQuery({ group: 'failed', reference: ' hh-0000test ' }, 'c1')).toBe(
      '/staff/message-deliveries?group=failed&reference=HH-0000TEST&cursor=c1',
    )
  })

  it('[HH-COM-13][HH-LANG-02] lists templates with readiness, previews one with samples, in Spanish', async () => {
    const fetchImpl = api()
    render(<MessagesScreen t={staffTranslator('es').t} locale="es" fetchImpl={fetchImpl} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Plantillas' }))
    const list = await screen.findByRole('list', { name: 'Plantillas de mensajes' })
    expect(within(list).getByText('Redacción aprobada publicada; valores aún no conectados')).toBeTruthy()
    expect(within(list).getByText('Solo lo publica el Propietario')).toBeTruthy()
    expect(within(list).getByText('NO CONFIGURADO: no hay redacción aprobada')).toBeTruthy()
    expect(screen.getByText(/Opcional; cuando no está disponible: Hi there,/)).toBeTruthy()
    fireEvent.click(within(list).getByRole('button', { name: 'Vista previa' }))
    expect(await screen.findByText('Asunto: HandyHub | Synthetic subject')).toBeTruthy()
    const frame = screen.getByTitle('Correo tal como se envía') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('')
    expect(frame.getAttribute('src')).toBe(
      '/api/v1/staff/message-templates/request.receipt/preview.html?channel=email&locale=en',
    )
    expect(screen.getByText(/Synthetic preview text/)).toBeTruthy()
  })
})
