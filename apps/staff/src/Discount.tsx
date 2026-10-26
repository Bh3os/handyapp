// The discount a customer requested on the request form and its verification (TSK-0125; HH-EST-15, OWN-DEC-165,
// RULE-SERVER-AUTHZ). Shown on the request's record to the Owner, Office and Estimator; the queue items "Estimate to
// revise: discount not verified" and the Owner's "Discount owner review" open the same record.
// - The requested category with what it needs, and its state: pending verification until a result is recorded.
// - Staff record only what they found: Verified or Not verified after looking at the military, veteran or spouse
//   documentation, or a photo ID for a senior. Nothing about the document is entered: no image, ID number, Social
//   Security number or date of birth. A returning customer is found by the server from the matched job history
//   (Check job history), never by a person's judgement. Send to owner review when the standard process cannot verify
//   it; the Owner approves or declines it, or overrides a recorded result.
// - The record lists each result with who recorded it and when. Once an estimate of the project is approved its price
//   is fixed and nothing more is recorded; a failed verification on a published estimate asks for a revised estimate.
// The server decides every action again; a refusal names its reason.
import type { StaffKey } from '@handyhub/i18n'
import { Button, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type DiscountVerification = {
  position: number
  category: string
  result: string
  verifiedBy: { id: string; name: string | null }
  verifiedAt: string
}
export type DiscountData = {
  requestId: string
  projectId: string
  reference: string
  eligibility: { percentBps: number; seniorFromAge: number; returningWithinMonths: number } | null
  discount: {
    category: string
    requestedAt: string
    state: string
    verifications: DiscountVerification[]
    approved: boolean
    revisionNeeded: boolean
    actions: { verify: boolean; checkJobHistory: boolean; ownerReview: boolean; decide: boolean }
  } | null
}

export const DISCOUNT_STATE_TONE: Record<string, StatusTone> = {
  pending: 'warning',
  verified: 'success',
  not_verified: 'danger',
  owner_review: 'info',
  declined: 'danger',
}

/** What the requested category needs, from configuration (the eligibility the Owner decided). */
function eligibilityText(t: T, category: string, e: NonNullable<DiscountData['eligibility']>): string {
  if (category === 'military') return t('discount.eligibility.military')
  if (category === 'senior') return t('discount.eligibility.senior', { age: e.seniorFromAge })
  return t('discount.eligibility.returning_customer', { months: e.returningWithinMonths })
}

/** The label of a refusal. */
function refusal(t: T, err: ApiErrorBody): string {
  const code = err.fieldErrors[0]?.code
  if (code) {
    const label = codeLabel(t, 'discountRefusal', code)
    if (label !== code) return label
  }
  return t('discount.refused')
}

/** The request's discount panel; nothing while it cannot be read (no access). */
export function RequestDiscount({
  t,
  fetchImpl,
  requestId,
  when,
}: {
  t: T
  fetchImpl: Fetch
  requestId: string
  /** The record's date and time format. */
  when: (iso: string) => string
}) {
  const ids = useId()
  const online = useOnline()
  const [view, setView] = useState<DiscountData | null | undefined>(undefined)
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const keys = useRef(new Map<string, string>())
  const path = `/staff/requests/${encodeURIComponent(requestId)}/discount`

  const load = useCallback(async () => {
    const r = await call<DiscountData>(fetchImpl, path)
    setView(r.ok && typeof r.data?.requestId === 'string' ? r.data : null)
  }, [fetchImpl, path])
  useEffect(() => {
    void load()
  }, [load])

  /** One write with its idempotency key (kept for a retry after a server failure). */
  async function send(action: string, to: string, body: unknown) {
    setPending(action)
    setProblem(null)
    setDone(false)
    const idem = keys.current.get(action) ?? idempotencyKey()
    keys.current.set(action, idem)
    const r = await call<DiscountData>(fetchImpl, to, { method: 'POST', body, headers: { 'idempotency-key': idem } })
    setPending(null)
    if (r.ok || r.status < 500) keys.current.delete(action)
    if (!r.ok) return setProblem(refusal(t, r.error))
    setView(r.data)
    setDone(true)
  }

  if (!view) return null
  const d = view.discount
  const offline = !online ? { disabledReason: t('offline.needsConnection') } : {}
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-title`} data-testid="request-discount">
      <h2 id={`${ids}-title`} className="staff-queue__heading">
        {t('discount.title')}
      </h2>
      {!d ? (
        <p>{t('discount.none')}</p>
      ) : (
        <>
          <dl className="staff-record">
            <dt>{t('discount.category')}</dt>
            <dd>
              {codeLabel(t, 'discountCategory', d.category)}
              {view.eligibility ? (
                <span className="staff-request__hint"> ({eligibilityText(t, d.category, view.eligibility)})</span>
              ) : null}
            </dd>
            <dt>{t('discount.state')}</dt>
            <dd>
              <StatusBadge tone={DISCOUNT_STATE_TONE[d.state] ?? 'neutral'}>
                {codeLabel(t, 'discountState', d.state)}
              </StatusBadge>
            </dd>
          </dl>
          {d.state === 'pending' || d.state === 'owner_review' ? (
            <p className="staff-request__hint">{t('discount.pendingNote')}</p>
          ) : null}
          {d.revisionNeeded ? (
            <p role="status" data-testid="discount-revision-needed">
              <StatusBadge tone="warning">{codeLabel(t, 'queueItemType', 'discount_revision')}</StatusBadge>{' '}
              {t('discount.revisionNeeded')}
            </p>
          ) : null}
          {d.approved ? <p className="staff-request__hint">{t('discount.approvedLocked')}</p> : null}

          <h3 className="staff-queue__heading">{t('discount.history')}</h3>
          {d.verifications.length ? (
            <ol data-testid="discount-verifications">
              {d.verifications.map((v) => (
                <li key={v.position}>
                  <strong>{codeLabel(t, 'discountResult', v.result)}</strong>
                  {' · '}
                  {t('discount.recordedBy', {
                    name: v.verifiedBy.name ?? t('queue.unnamed'),
                    time: when(v.verifiedAt),
                  })}
                </li>
              ))}
            </ol>
          ) : (
            <p>{t('discount.historyEmpty')}</p>
          )}

          {d.actions.verify || d.actions.checkJobHistory || d.actions.ownerReview || d.actions.decide ? (
            <>
              {d.actions.verify ? <p className="staff-request__hint">{t('discount.guidance')}</p> : null}
              {d.actions.checkJobHistory ? <p className="staff-request__hint">{t('discount.jobHistoryHint')}</p> : null}
              <div className="hh-button-row">
                {d.actions.verify ? (
                  <>
                    <Button
                      pending={pending === 'verified'}
                      onClick={() => void send('verified', `${path}/verifications`, { result: 'verified' })}
                      {...offline}
                    >
                      {t('discount.verified')}
                    </Button>
                    <Button
                      variant="secondary"
                      pending={pending === 'not_verified'}
                      onClick={() => void send('not_verified', `${path}/verifications`, { result: 'not_verified' })}
                      {...offline}
                    >
                      {t('discount.notVerified')}
                    </Button>
                  </>
                ) : null}
                {d.actions.checkJobHistory ? (
                  <Button
                    pending={pending === 'job-history'}
                    onClick={() => void send('job-history', `${path}/job-history`, {})}
                    {...offline}
                  >
                    {t('discount.checkJobHistory')}
                  </Button>
                ) : null}
                {d.actions.ownerReview ? (
                  <Button
                    variant="secondary"
                    pending={pending === 'owner_review'}
                    onClick={() => void send('owner_review', `${path}/verifications`, { result: 'owner_review' })}
                    {...offline}
                  >
                    {t('discount.sendToOwner')}
                  </Button>
                ) : null}
              </div>
              {d.actions.decide ? (
                <div className="hh-button-row" role="group" aria-label={t('discount.ownerDecision')}>
                  {d.state !== 'verified' ? (
                    <Button
                      pending={pending === 'owner_approved'}
                      onClick={() =>
                        void send('owner_approved', `${path}/owner-decision`, { result: 'owner_approved' })
                      }
                      {...offline}
                    >
                      {t('discount.ownerApprove')}
                    </Button>
                  ) : null}
                  {d.state !== 'declined' ? (
                    <Button
                      variant="secondary"
                      pending={pending === 'owner_declined'}
                      onClick={() =>
                        void send('owner_declined', `${path}/owner-decision`, { result: 'owner_declined' })
                      }
                      {...offline}
                    >
                      {t('discount.ownerDecline')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          {done ? <StateView kind="success" title={t('discount.recorded')} /> : null}
          {problem ? <StateView kind="blocked" title={problem} /> : null}
        </>
      )}
    </section>
  )
}
