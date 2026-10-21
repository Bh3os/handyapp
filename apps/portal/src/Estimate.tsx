// The customer's estimate view in the Documents tab (TSK-0056; HH-EST-06, HH-EST-09, HH-EST-13, HH-PORT-10, HH-ID-07,
// OWN-DEC-103, OWN-DEC-127, RULE-LANGUAGES).
// - The exact published version: the business name, the lines and options, the texts, the subtotal, any discount row,
//   the total and any deposit, exactly as the server stored them (integer cents, formatted here), the payment term and
//   the valid-until date, with the version's status (current, approved, declined, expired, superseded, withdrawn).
//   Outside production the estimate carries "TEST — not a real invoice or estimate".
// - The terms the version pinned, in full, in an expandable section and on a page of their own. Terms that are not
//   approved for real customers carry the TEST banner and say they are not in effect; terms the server reports as NOT
//   CONFIGURED show no wording at all.
// - Approval is not offered here (TSK-0057): the section names every reason, and links the version to review instead.
//   Not answering never approves anything, and the page says so.
// - Request Changes (a message) and Decline (an optional reason, after a confirmation) on the current version; Request
//   an Updated Estimate on an expired one with no current version. Each needs a recent verification (the server
//   decides; the page says how to get one). A failed or refused answer is never shown as sent, and what was typed is
//   kept. The customer's earlier answers are listed with their words.
// English only, from the customer catalog; wording no decision gives is PROPOSED (OQ-PORTAL-WORDING).
import { estimateTermsDocument } from '@handyhub/domain/legal'
import type { CustomerKey } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useId, useRef, useState } from 'react'
import {
  idempotencyKey,
  portalApi,
  type ApprovalReason,
  type EstimateDetail,
  type EstimateLine,
  type Fetch,
  type ResponseKind,
  type VersionStatus,
  type WriteFailure,
} from './api'
import { t, when } from './labels'
import { useLive } from './live'
import { NotShown, RefreshLine } from './States'
import { NotInEffect, TermsText } from './Terms'

export const STATUS_LABEL: Record<VersionStatus, CustomerKey> = {
  current: 'portal.estimate.status.current',
  approved: 'portal.estimate.status.approved',
  declined: 'portal.estimate.status.declined',
  expired: 'portal.estimate.status.expired',
  superseded: 'portal.estimate.status.superseded',
  withdrawn: 'portal.estimate.status.withdrawn',
}
export const STATUS_TONE: Record<VersionStatus, StatusTone> = {
  current: 'info',
  approved: 'success',
  declined: 'neutral',
  expired: 'warning',
  superseded: 'neutral',
  withdrawn: 'neutral',
}
const KIND_LABEL: Record<ResponseKind, CustomerKey> = {
  changes_requested: 'portal.estimate.history.kind.changes_requested',
  declined: 'portal.estimate.history.kind.declined',
  update_requested: 'portal.estimate.history.kind.update_requested',
}
const FAILURE: Record<WriteFailure, CustomerKey> = {
  fresh_verification: 'portal.estimate.failure.fresh_verification',
  not_applicable: 'portal.estimate.failure.not_applicable',
  invalid: 'portal.estimate.failure.invalid',
  rate_limited: 'portal.estimate.failure.rate_limited',
  failed: 'portal.estimate.failure.failed',
  expired: 'portal.estimate.failure.expired',
  unavailable: 'portal.estimate.failure.unavailable',
}
const SENT: Record<ResponseKind, CustomerKey> = {
  changes_requested: 'portal.estimate.changes.sent',
  declined: 'portal.estimate.decline.sent',
  update_requested: 'portal.estimate.update.sent',
}
const APPROVAL_REASON: Record<ApprovalReason, CustomerKey> = {
  terms_not_configured: 'portal.estimate.approval.reason.terms_not_configured',
  terms_not_in_effect: 'portal.estimate.approval.reason.terms_not_in_effect',
  superseded: 'portal.estimate.approval.reason.superseded',
  expired: 'portal.estimate.approval.reason.expired',
  not_published: 'portal.estimate.approval.reason.not_published',
  approval_not_available: 'portal.estimate.approval.reason.approval_not_available',
}
const PAYMENT_TERM: Record<string, CustomerKey> = { due_on_receipt: 'estimatePdf.paymentTerm.due_on_receipt' }
const usd = (c: number) => formatUsd(cents(c))

/** A day in English: "October 21, 2026". */
export function day(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(d)
}

export const estimatePath = (reference: string, number: string, version: number) =>
  `/portal/p/${encodeURIComponent(reference)}/documents/${encodeURIComponent(number)}/${version}`

function Lines({ lines, caption }: { lines: EstimateLine[]; caption: string }) {
  const kind = (l: EstimateLine) =>
    l.kind === 'alternate' ? t('estimatePdf.kind.alternate') : l.kind === 'add_on' ? t('estimatePdf.kind.add_on') : null
  const missing = t('estimatePdf.notProvided')
  return (
    <div className="portal-estimate__table">
      <table>
        <caption className="hh-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t('estimatePdf.column.description')}</th>
            <th scope="col">{t('estimatePdf.column.quantity')}</th>
            <th scope="col">{t('estimatePdf.column.unitPrice')}</th>
            <th scope="col">{t('estimatePdf.column.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <th scope="row">
                {kind(l) ? `${kind(l)}: ` : ''}
                {l.description ?? missing}
              </th>
              <td>{l.quantity === null ? missing : [l.quantity, l.unit].filter(Boolean).join(' ')}</td>
              <td>{l.unitPriceCents === null ? missing : usd(l.unitPriceCents)}</td>
              <td>{l.amountCents === null ? missing : usd(l.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const TEXT_LISTS = [
  ['assumptions', 'estimatePdf.assumptions'],
  ['exclusions', 'estimatePdf.exclusions'],
  ['customerResponsibilities', 'estimatePdf.customerResponsibilities'],
  ['dependencies', 'estimatePdf.dependencies'],
  ['scheduleAssumptions', 'estimatePdf.scheduleAssumptions'],
] as const satisfies readonly (readonly [keyof EstimateDetail, CustomerKey])[]

function Content({ e }: { e: EstimateDetail }) {
  const base = e.lines.filter((l) => l.kind === 'base')
  const options = e.lines.filter((l) => l.kind !== 'base')
  return (
    <section className="portal-section" aria-labelledby="portal-estimate-details">
      <h3 id="portal-estimate-details" className="hh-visually-hidden">
        {t('portal.estimate.details')}
      </h3>
      <dl className="portal-estimate__facts">
        <dt>{t('estimatePdf.issuer')}</dt>
        <dd>{e.issuerName ?? t('estimatePdf.notProvided')}</dd>
        <dt>{t('estimatePdf.published')}</dt>
        <dd>{day(e.publishedAt)}</dd>
        <dt>{t('estimatePdf.validUntil')}</dt>
        <dd>{e.validUntil ? day(e.validUntil) : t('estimatePdf.notProvided')}</dd>
      </dl>
      {e.document ? (
        <p>
          <a href={e.document.url} rel="noopener">
            {t('portal.estimate.document')}
          </a>
        </p>
      ) : null}
      <h4 className="hh-h3">{t('estimatePdf.scope')}</h4>
      <Lines lines={base} caption={t('estimatePdf.scope')} />
      {options.length ? (
        <>
          <h4 className="hh-h3">{t('estimatePdf.options')}</h4>
          <Lines lines={options} caption={t('estimatePdf.options')} />
        </>
      ) : null}
      <h4 className="hh-h3">{t('estimatePdf.totals')}</h4>
      <dl className="portal-estimate__totals" data-testid="estimate-totals">
        <dt>{t('estimatePdf.subtotal')}</dt>
        <dd>{usd(e.subtotalCents)}</dd>
        {e.reduction ? (
          <>
            <dt>{e.reduction.label}</dt>
            <dd>-{usd(e.reduction.amountCents)}</dd>
          </>
        ) : null}
        <dt>
          <strong>{t('estimatePdf.total')}</strong>
        </dt>
        <dd>
          <strong>{usd(e.totalCents)}</strong>
        </dd>
        {e.deposit.state === 'required' && e.deposit.amountCents !== null ? (
          <>
            <dt>{t('estimatePdf.deposit')}</dt>
            <dd>{usd(e.deposit.amountCents)}</dd>
          </>
        ) : null}
        <dt>{t('estimatePdf.paymentTerm')}</dt>
        <dd>
          {PAYMENT_TERM[e.paymentTerm] ? t(PAYMENT_TERM[e.paymentTerm] as CustomerKey) : t('estimatePdf.notProvided')}
        </dd>
      </dl>
      {TEXT_LISTS.map(([key, label]) =>
        e[key].length ? (
          <div key={key}>
            <h4 className="hh-h3">{t(label)}</h4>
            <ul>
              {e[key].map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  )
}

function Terms({ e }: { e: EstimateDetail }) {
  const doc = e.terms.state === 'not_configured' ? null : estimateTermsDocument(e.terms.documentId)
  return (
    <section className="portal-section" aria-labelledby="portal-estimate-terms" data-testid="estimate-terms">
      <h3 id="portal-estimate-terms" className="hh-h3">
        {t('portal.estimate.terms.title')}
      </h3>
      {!doc ? (
        <StateView kind="blocked" title={t('portal.estimate.terms.notConfigured.title')}>
          <p>{t('portal.estimate.terms.notConfigured.text')}</p>
        </StateView>
      ) : (
        <>
          {e.terms.state === 'not_in_effect' ? <NotInEffect /> : null}
          <details className="portal-terms__details">
            <summary>{t('portal.estimate.terms.show')}</summary>
            <TermsText doc={doc} level={4} />
          </details>
          <p>
            <a href={doc.path}>{t('portal.estimate.terms.fullPage')}</a>
          </p>
        </>
      )}
    </section>
  )
}

function Approval({ e, onOpen }: { e: EstimateDetail; onOpen: (path: string) => void }) {
  return (
    <section className="portal-section" aria-labelledby="portal-estimate-approval">
      <h3 id="portal-estimate-approval" className="hh-h3">
        {t('portal.estimate.approval.title')}
      </h3>
      <StateView
        kind="blocked"
        title={t('portal.estimate.approval.unavailable')}
        reasons={e.approval.reasons.map((r) => t(APPROVAL_REASON[r]))}
      >
        <p>{t('portal.estimate.approval.silence')}</p>
      </StateView>
      {e.approval.current ? (
        <p>
          <a
            href={estimatePath(e.reference, e.approval.current.number, e.approval.current.version)}
            onClick={(ev) => {
              if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return
              ev.preventDefault()
              if (e.approval.current)
                onOpen(estimatePath(e.reference, e.approval.current.number, e.approval.current.version))
            }}
          >
            {t('portal.estimate.approval.current', { version: e.approval.current.version })}
          </a>
        </p>
      ) : null}
    </section>
  )
}

type Open = ResponseKind | null

function Respond({ e, fetchImpl, onDone }: { e: EstimateDetail; fetchImpl: Fetch; onDone: () => Promise<void> }) {
  const ids = useId()
  const [open, setOpen] = useState<Open>(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<WriteFailure | null>(null)
  const [sent, setSent] = useState<ResponseKind | null>(null)
  // One key per answer: a retry of the same answer cannot record it twice.
  const key = useRef<string | null>(null)
  const { requestChanges, decline, requestUpdate } = e.actions
  if (!requestChanges && !decline && !requestUpdate && !sent) return null
  const blocked = e.freshVerification ? undefined : t('portal.estimate.verifyFirst')

  const start = (kind: ResponseKind) => {
    setOpen(kind)
    setFailure(null)
    setSent(null)
    key.current = null
  }
  async function send(kind: ResponseKind) {
    const body: Record<string, string> = {}
    const words = text.trim()
    if (kind === 'changes_requested') {
      if (!words) return setFailure('invalid')
      body['message'] = words
    } else if (words) body[kind === 'declined' ? 'reason' : 'message'] = words
    setPending(true)
    setFailure(null)
    key.current ??= idempotencyKey()
    const r = await portalApi.respond(
      fetchImpl,
      { reference: e.reference, number: e.number, version: e.version },
      kind,
      body,
      key.current,
    )
    setPending(false)
    if (!r.ok) {
      // A definite refusal ends this answer's key; a network failure keeps it for the retry.
      if (r.failure !== 'failed') key.current = null
      setFailure(r.failure)
      if (r.failure === 'not_applicable') await onDone()
      return
    }
    key.current = null
    setText('')
    setOpen(null)
    setSent(kind)
    await onDone()
  }

  const form = (kind: ResponseKind) => {
    const label =
      kind === 'changes_requested'
        ? 'portal.estimate.changes.label'
        : kind === 'declined'
          ? 'portal.estimate.decline.label'
          : 'portal.estimate.update.label'
    const hint =
      kind === 'changes_requested'
        ? t('portal.estimate.changes.hint')
        : kind === 'declined'
          ? t('portal.estimate.decline.hint')
          : undefined
    const action =
      kind === 'changes_requested'
        ? 'portal.estimate.changes.send'
        : kind === 'declined'
          ? 'portal.estimate.decline.confirm'
          : 'portal.estimate.update.send'
    return (
      <div role="group" aria-labelledby={`${ids}-${kind}`} className="portal-estimate__form">
        <p id={`${ids}-${kind}`} className="hh-visually-hidden">
          {t(
            kind === 'changes_requested'
              ? 'portal.estimate.changes.open'
              : kind === 'declined'
                ? 'portal.estimate.decline.open'
                : 'portal.estimate.update.open',
          )}
        </p>
        <Field
          multiline
          label={t(label)}
          {...(hint ? { hint } : {})}
          value={text}
          maxLength={kind === 'declined' ? 1000 : 2000}
          onChange={(ev) => setText(ev.target.value)}
        />
        <div className="hh-button-row">
          <Button pending={pending} {...(blocked ? { disabledReason: blocked } : {})} onClick={() => void send(kind)}>
            {t(action)}
          </Button>
          <Button variant="secondary" onClick={() => (setOpen(null), setFailure(null))}>
            {t('portal.estimate.cancel')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section className="portal-section" aria-labelledby={`${ids}-respond`} data-testid="estimate-respond">
      <h3 id={`${ids}-respond`} className="hh-h3">
        {t('portal.estimate.respond.title')}
      </h3>
      {requestUpdate ? <p>{t('portal.estimate.update.text')}</p> : null}
      {!e.freshVerification ? <p className="hh-muted">{t('portal.estimate.verifyFirst')}</p> : null}
      {open === null ? (
        <div className="hh-button-row">
          {requestChanges ? (
            <Button variant="secondary" onClick={() => start('changes_requested')}>
              {t('portal.estimate.changes.open')}
            </Button>
          ) : null}
          {decline ? (
            <Button variant="secondary" onClick={() => start('declined')}>
              {t('portal.estimate.decline.open')}
            </Button>
          ) : null}
          {requestUpdate ? (
            <Button variant="secondary" onClick={() => start('update_requested')}>
              {t('portal.estimate.update.open')}
            </Button>
          ) : null}
        </div>
      ) : (
        form(open)
      )}
      {failure ? <StateView kind="error" title={t(FAILURE[failure])} /> : null}
      {sent ? <StateView kind="success" title={t(SENT[sent])} /> : null}
    </section>
  )
}

function History({ e }: { e: EstimateDetail }) {
  if (e.responses.length === 0) return null
  return (
    <section className="portal-section" aria-labelledby="portal-estimate-history">
      <h3 id="portal-estimate-history" className="hh-h3">
        {t('portal.estimate.history.title')}
      </h3>
      <ol className="portal-timeline">
        {e.responses.map((r) => (
          <li key={`${r.at}-${r.kind}`} className="portal-timeline__item">
            <p className="portal-timeline__label">
              <strong>
                {t('portal.estimate.history.entry', {
                  kind: t(KIND_LABEL[r.kind]),
                  version: r.version,
                  date: when(r.at),
                })}
              </strong>
            </p>
            {r.message ? <p className="portal-timeline__text">{r.message}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** One estimate version in the Documents tab. */
export function EstimateView({
  reference,
  number,
  version,
  active,
  fetchImpl,
  onNavigate,
}: {
  reference: string
  number: string
  version: number
  active: boolean
  fetchImpl: Fetch
  onNavigate: (path: string) => void
}) {
  const { live, refresh } = useLive(
    () => portalApi.estimate(fetchImpl, { reference, number, version }),
    `${reference}/${number}/${version}`,
    active,
  )
  const back = `/portal/p/${encodeURIComponent(reference)}/documents`
  return (
    <div className="portal-estimate" data-testid="estimate-view">
      <p className="portal-back">
        <a
          href={back}
          onClick={(ev) => {
            if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return
            ev.preventDefault()
            onNavigate(back)
          }}
        >
          {t('portal.estimate.back')}
        </a>
      </p>
      <h2 className="hh-h3">{t('portal.estimate.heading', { number })}</h2>
      {live.phase !== 'ready' ? (
        <NotShown
          live={live}
          loading="portal.estimate.loading"
          failedTitle="portal.estimate.failed.title"
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <RefreshLine
            refreshedAt={live.refreshedAt}
            stale={live.stale}
            refreshing={live.refreshing}
            onRefresh={() => void refresh()}
          />
          {live.data.testMark ? (
            <p className="portal-estimate__test-mark" role="note">
              <strong>{t('estimatePdf.testMark')}</strong>
            </p>
          ) : null}
          <p>
            <StatusBadge tone={STATUS_TONE[live.data.status]}>
              {t('portal.estimate.versionStatus', {
                version: live.data.version,
                status: t(STATUS_LABEL[live.data.status]),
              })}
            </StatusBadge>
          </p>
          <div className={live.stale ? 'portal-estimate__body portal-section--stale' : 'portal-estimate__body'}>
            <Content e={live.data} />
            <Terms e={live.data} />
            <Approval e={live.data} onOpen={onNavigate} />
            <Respond e={live.data} fetchImpl={fetchImpl} onDone={refresh} />
            <History e={live.data} />
          </div>
        </>
      )}
    </div>
  )
}
