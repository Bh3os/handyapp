// The Owner's default preparation instructions for offers (TSK-0146; OWN-DEC-194 B7, HH-CUS-02, RULE-SERVER-AUTHZ).
// The API is a synthetic stand-in (RULE-SYNTHETIC-DATA): service names and texts are test inputs, not business facts.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreparationDefaultsSetting, type ServiceDefault } from '../src/PreparationDefaults'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const PAGE = 'Synthetic page step one.\nSynthetic page step two.'
const service = (over: Partial<ServiceDefault> = {}): ServiceDefault => ({
  serviceId: 'SVC-DW-01',
  code: 'DW-01',
  category: 'drywall',
  name: 'Synthetic Patching',
  servicePage: { version: 3, text: PAGE, problems: [] },
  current: null,
  version: 0,
  history: [],
  ...over,
})

describe('[OWN-DEC-194][HH-CUS-02] B7: the Owner reviews and approves each service’s default', () => {
  it('[OWN-DEC-194][RULE-NO-INVENTED-FACTS] a service is NOT CONFIGURED until the Owner approves the reviewed steps', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    let approved = false
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) })
      if (init?.method === 'POST') {
        approved = true
        return json(200, { id: 'd1', serviceId: 'SVC-DW-01', version: 1, basis: 'service_page', serviceVersion: 3 })
      }
      const current = {
        id: 'd1',
        version: 1,
        text: PAGE,
        basis: 'service_page',
        serviceVersion: 3,
        reason: null,
        approvedBy: { id: 'o', name: 'Synthetic Owner' },
        approvedAt: '2026-10-26T15:00:00.000Z',
      }
      return json(200, {
        services: [approved ? service({ current, version: 1, history: [current] }) : service()],
      })
    })
    const { t } = staffTranslator('en')
    render(<PreparationDefaultsSetting t={t} locale="en" fetchImpl={fetchImpl as never} />)
    const section = await screen.findByTestId('preparation-defaults')
    expect(section.textContent).toContain('0 of 1 services have an approved default.')
    const entry = within(section).getByTestId('preparation-service')
    expect(entry.textContent).toContain('Not configured')
    expect(within(entry).getByTestId('preparation-page').textContent).toBe(PAGE)
    expect(within(entry).getByTestId('preparation-current-missing').textContent).toContain(
      'offers for this service start without instructions',
    )
    fireEvent.click(within(entry).getByRole('button', { name: 'Approve the reviewed steps as the default' }))
    await waitFor(() => expect(section.textContent).toContain('1 of 1 services have an approved default.'))
    const post = calls.find((c) => c.init?.method === 'POST')
    expect(post?.url).toBe('/api/v1/staff/services/SVC-DW-01/preparation-defaults')
    expect(JSON.parse(String(post?.init?.body))).toEqual({ source: 'service_page', currentVersion: 0 })
    expect(within(entry).getByTestId('preparation-current').textContent).toBe(PAGE)
    expect(within(entry).getByTestId('preparation-history').textContent).toContain(
      'Version 1: The reviewed service-page steps, by Synthetic Owner',
    )
  })

  it('[OWN-DEC-194][HH-CUS-02] an unsafe edit is flagged and the refusal named (Spanish)', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return json(400, {
          error: {
            code: 'VALIDATION_FAILED',
            message: '',
            requestId: 'r',
            retryable: false,
            fieldErrors: [{ field: 'body.text', code: 'UNSAFE_HEIGHTS_AND_CONFINED_SPACES', message: '' }],
          },
        })
      return json(200, { services: [service()] })
    })
    const { t } = staffTranslator('es')
    render(<PreparationDefaultsSetting t={t} locale="es" fetchImpl={fetchImpl as never} />)
    const entry = await screen.findByTestId('preparation-service')
    const field = within(entry).getByLabelText(/Instrucciones de preparación predeterminadas/) as HTMLTextAreaElement
    expect(field.value).toBe(PAGE)
    fireEvent.change(field, { target: { value: 'Synthetic: climb onto the roof first.' } })
    expect(entry.textContent).toContain('Alturas o espacios reducidos')
    fireEvent.click(within(entry).getByRole('button', { name: 'Aprobar este texto como predeterminado' }))
    await within(entry).findByText('El texto predeterminado no se cambió')
    expect(entry.textContent).toContain('Las instrucciones piden al cliente trabajar en altura')
  })

  it('[RULE-SERVER-AUTHZ] the section stays hidden when the server refuses (not the Owner)', async () => {
    const fetchImpl = vi.fn(async () =>
      json(403, { error: { code: 'FORBIDDEN', message: '', requestId: 'r', retryable: false, fieldErrors: [] } }),
    )
    const { t } = staffTranslator('en')
    const { container } = render(<PreparationDefaultsSetting t={t} locale="en" fetchImpl={fetchImpl as never} />)
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
