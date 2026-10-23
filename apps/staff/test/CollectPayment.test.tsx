// On-site collection on the staff app (TSK-0088; HH-FIN-11, HH-FIN-12, T62, OWN-DEC-200). The API is a synthetic
// stand-in; every number and name is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fetch } from '../src/api'
import { CollectPayment, type CollectionData } from '../src/CollectPayment'

afterEach(cleanup)

const JOB = '44444444-4444-4444-8444-444444444488'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const view = (over: Partial<CollectionData> = {}): CollectionData => ({
  jobId: JOB,
  reference: 'HH-SYNTH088',
  deposit: { remainingCents: 22_500, pendingCents: 0 },
  invoice: null,
  methods: ['cash', 'check', 'square_tap_to_pay'],
  mine: [],
  ...over,
})

describe('CollectPayment (TSK-0088)', () => {
  it('[OWN-DEC-200] nothing shows when the server does not allow the caller to collect', async () => {
    let asked = 0
    const fetchImpl: Fetch = async () => {
      asked++
      return json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } })
    }
    const { container } = render(<CollectPayment t={staffTranslator('en').t} fetchImpl={fetchImpl} jobId={JOB} />)
    await waitFor(() => expect(asked).toBe(1))
    expect(container.textContent).toBe('')
  })

  it('[T62][HH-FIN-11] records the collector’s own cash once and shows it with its receipt', async () => {
    const posts: unknown[] = []
    const fetchImpl: Fetch = async (input, init) => {
      expect(String(input)).toBe(`/api/v1/staff/jobs/${JOB}/collection`)
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return json(
          201,
          view({
            deposit: null,
            mine: [
              {
                method: 'cash',
                amountCents: 22_500,
                receivedOn: '2026-10-23',
                state: 'recorded',
                receiptNumber: 'HH-SYNTH088-R1',
              },
            ],
          }),
        )
      }
      return json(200, view())
    }
    render(<CollectPayment t={staffTranslator('en').t} fetchImpl={fetchImpl} jobId={JOB} />)
    const panel = await screen.findByTestId('collect-payment')
    expect(within(panel).getByTestId('collect-deposit').textContent).toBe('Deposit still due: $225.00.')
    fireEvent.change(within(panel).getByLabelText(/Amount received/), { target: { value: '225.00' } })
    fireEvent.change(within(panel).getByLabelText(/Memo/), { target: { value: ' Synthetic: at the door ' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Record the payment' }))
    expect((await within(panel).findByTestId('collect-done')).textContent).toBe(
      "Recorded. The customer's receipt goes out now.",
    )
    expect(posts).toEqual([
      {
        target: 'deposit',
        method: 'cash',
        amountCents: 22_500,
        reference: null,
        payerName: null,
        memo: 'Synthetic: at the door',
      },
    ])
    expect(within(panel).getByTestId('collect-mine').textContent).toContain('Receipt HH-SYNTH088-R1')
    expect(within(panel).queryByRole('form')).toBeNull()
  })

  it('[HH-FIN-12] a check asks for its number and payer, and says it stays pending; Spanish', async () => {
    const posts: Record<string, unknown>[] = []
    const fetchImpl: Fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return json(201, view({ deposit: { remainingCents: 22_500, pendingCents: 10_000 } }))
      }
      return json(200, view({ invoice: { number: 'HH-SYNTH088-I1', remainingCents: 90_000, pendingCents: 0 } }))
    }
    render(<CollectPayment t={staffTranslator('es').t} fetchImpl={fetchImpl} jobId={JOB} />)
    const panel = await screen.findByTestId('collect-payment')
    fireEvent.change(within(panel).getByLabelText('Para'), { target: { value: 'invoice' } })
    fireEvent.change(within(panel).getByLabelText('Método'), { target: { value: 'check' } })
    fireEvent.change(within(panel).getByLabelText(/Número de cheque/), { target: { value: '1088' } })
    fireEvent.change(within(panel).getByLabelText(/Importe recibido/), { target: { value: '100' } })
    fireEvent.change(within(panel).getByLabelText(/Nombre del pagador/), {
      target: { value: 'Synthetic Payer' },
    })
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar el pago' }))
    expect((await within(panel).findByTestId('collect-done')).textContent).toBe(
      'Cheque registrado. Sigue pendiente hasta que el Propietario lo compense.',
    )
    expect(posts[0]).toMatchObject({ target: 'invoice', method: 'check', amountCents: 10_000, reference: '1088' })
  })
})
