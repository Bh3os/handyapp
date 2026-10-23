// A payment's later steps on the staff app (TSK-0088; HH-FIN-11, HH-FIN-12, T62). Every value is synthetic
// (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PaymentSteps } from '../src/PaymentSteps'

afterEach(cleanup)

describe('PaymentSteps (TSK-0088)', () => {
  it('[HH-FIN-11][HH-FIN-12] shows the memo, receipt and deposit; offers only the steps the server allows', () => {
    const runs: [string, string, string][] = []
    render(
      <PaymentSteps
        t={staffTranslator('en').t}
        pending={null}
        run={(a, p, d) => runs.push([a, p, d])}
        p={{
          id: 'p-88',
          memo: 'Synthetic: paid at the door',
          receiptNumber: 'HH-SYNTH088-R1',
          depositedAt: null,
          reconciledAt: null,
          canMarkDeposited: true,
          canReconcile: false,
        }}
      />,
    )
    expect(screen.getByText(/Memo: Synthetic: paid at the door/)).toBeTruthy()
    expect(screen.getByTestId('payment-receipt').textContent).toBe('Receipt HH-SYNTH088-R1')
    expect(screen.queryByRole('button', { name: 'Mark reconciled' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mark deposited' }))
    expect(runs).toEqual([['deposited-p-88', '/staff/payments/p-88/deposited', 'payment.deposited']])
  })

  it('[HH-FIN-12] a deposited check says it stays pending; Spanish', () => {
    render(
      <PaymentSteps
        t={staffTranslator('es').t}
        pending={null}
        run={() => undefined}
        p={{ id: 'p-89', depositedAt: '2026-10-23T15:00:00.000Z', canMarkDeposited: false, canReconcile: false }}
      />,
    )
    expect(screen.getByText(/sigue pendiente hasta que el Propietario lo compense/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
