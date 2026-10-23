// One recorded payment's later steps (TSK-0088; HH-FIN-11, HH-FIN-12, T62): its memo and receipt number, a check
// marked deposited (still pending until the Owner clears it) and a payment reconciled against the bank or Square. The
// buttons show only where the server would allow them (the Owner or Office, never for their own collection).
import type { StaffKey } from '@handyhub/i18n'
import { Button } from '@handyhub/ui'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string

export type PaymentStepFields = {
  id: string
  memo?: string | null
  receiptNumber?: string | null
  depositedAt?: string | null
  reconciledAt?: string | null
  canMarkDeposited?: boolean
  canReconcile?: boolean
}

export function PaymentSteps({
  t,
  p,
  pending,
  run,
}: {
  t: T
  p: PaymentStepFields
  pending: string | null
  run: (action: string, path: string, done: StaffKey) => void
}) {
  const path = (step: string) => `/staff/payments/${encodeURIComponent(p.id)}/${step}`
  return (
    <>
      {p.memo ? (
        <>
          <br />
          {/* The collector's own words, as written. */}
          {t('payment.memoShown', { memo: p.memo })}
        </>
      ) : null}
      {p.receiptNumber ? (
        <>
          <br />
          <span data-testid="payment-receipt">{t('payment.receiptShown', { number: p.receiptNumber })}</span>
        </>
      ) : null}
      {p.depositedAt ? (
        <>
          <br />
          {t('payment.depositedShown', { time: new Date(p.depositedAt) })}
        </>
      ) : null}
      {p.reconciledAt ? (
        <>
          <br />
          {t('payment.reconciledShown', { time: new Date(p.reconciledAt) })}
        </>
      ) : null}
      {p.canMarkDeposited || p.canReconcile ? (
        <div className="hh-button-row">
          {p.canMarkDeposited ? (
            <Button
              variant="secondary"
              pending={pending === `deposited-${p.id}`}
              onClick={() => run(`deposited-${p.id}`, path('deposited'), 'payment.deposited')}
            >
              {t('payment.markDeposited')}
            </Button>
          ) : null}
          {p.canReconcile ? (
            <Button
              variant="secondary"
              pending={pending === `reconcile-${p.id}`}
              onClick={() => run(`reconcile-${p.id}`, path('reconcile'), 'payment.reconciled')}
            >
              {t('payment.reconcile')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
