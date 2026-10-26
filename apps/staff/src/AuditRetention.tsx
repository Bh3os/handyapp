// The audit-retention workflow on the Owner's retention screen (TSK-0135; HH-SEC-08, HH-SEC-06, HH-STAFF-08,
// OWN-DEC-164). Audit entries are never edited; once past their period the Owner picks a range of them (by entry
// number, or one of the oldest months listed), sees what archiving or deleting it would do and what blocks it, and
// either archives it (kept, with integrity evidence) or deletes it after confirming every check the software does not
// record, with a written reason and a fresh sign-in. The protected trail of every archive and deletion and the hash
// chain's verification are shown below. The screen shows only what the server sends; nothing happens automatically.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type Check = { check: string; result: 'found' | 'none_found' | 'not_applicable' | 'not_recorded'; count?: number }
type Policy = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  years: number | null
  version: number | null
  timeZone: string | null
  minimumYears: number
}

export type AuditRetentionOverview = {
  automaticDeletion: false
  policy: Policy
  eligible: {
    count: number
    months: { month: string; fromSeq: string; toSeq: string; count: number; archived: number }[]
  }
  chain: { seals: number; sealedThrough: string | null; lastSealedAt: string | null }
  operations: { archives: number; deletions: number; deletedEvents: number }
  backups: 'NOT_CONFIGURED'
}

export type AuditRangePreview = {
  range: {
    fromSeq: string
    toSeq: string
    count: number
    firstOccurredAt: string | null
    lastOccurredAt: string | null
    periodEndsAt: string | null
  }
  notYetEligible: number
  archived: number
  policy: Policy
  checks: Check[]
  confirm: string[]
  blockers: { archive: string[]; delete: string[] }
  permanent: true
  backups: 'NOT_CONFIGURED'
}

export type AuditRetentionOperation = {
  id: string
  seq: string
  kind: 'archive' | 'delete'
  fromSeq: string
  toSeq: string
  count: number
  firstOccurredAt: string
  lastOccurredAt: string
  hashBefore: string
  hashAfter: string
  sealSeq: string
  reason: string
  authorizedBy: { id: string; name: string | null }
  authorizedAt: string
  checksConfirmed: string[]
}

type Verification = {
  ok: boolean
  checkedEvents: number
  seals: number
  sealedThrough: string | null
  archives: number
  deletions: number
  unsealedEvents: number
  mismatch: { at: string; id: string; seq: string } | null
  verifiedAt: string
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const TONE = { found: 'danger', none_found: 'success', not_applicable: 'neutral', not_recorded: 'warning' } as const
const SEQ = /^[1-9][0-9]{0,17}$/

/** The refusal codes of an archive or deletion, labelled. */
export function auditRefusal(t: T, error: ApiErrorBody): string[] {
  const out = error.fieldErrors.map((f) =>
    f.field === 'blockers'
      ? codeLabel(t, 'auditRetentionBlocker', f.code.toLowerCase())
      : codeLabel(t, 'privacyProblem', f.code),
  )
  return out.length ? out : [codeLabel(t, 'privacyProblem', error.code)]
}

export function AuditRetention({
  t,
  locale,
  fetchImpl,
  onSession,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
}) {
  const ids = useId()
  const [overview, setOverview] = useState<AuditRetentionOverview | 'error' | null>(null)
  const [trail, setTrail] = useState<AuditRetentionOperation[] | 'error' | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preview, setPreview] = useState<AuditRangePreview | 'error' | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [refused, setRefused] = useState<string[]>([])
  const [done, setDone] = useState<string | null>(null)
  const [verification, setVerification] = useState<Verification | 'error' | 'loading' | null>(null)
  const [reload, setReload] = useState(0)
  const w = useOwnerWrite(fetchImpl, onSession)

  useEffect(() => {
    let live = true
    void call<AuditRetentionOverview>(fetchImpl, '/staff/audit-retention').then((r) => {
      if (live) setOverview(r.ok ? r.data : 'error')
    })
    void call<{ items: AuditRetentionOperation[] }>(fetchImpl, '/staff/audit-retention/operations').then((r) => {
      if (live) setTrail(r.ok ? r.data.items : 'error')
    })
    return () => {
      live = false
    }
  }, [fetchImpl, reload])

  const show = useCallback(
    async (fromSeq: string, toSeq: string) => {
      setRefused([])
      const q = new URLSearchParams({ fromSeq, toSeq })
      const r = await call<AuditRangePreview>(fetchImpl, `/staff/audit-retention/range?${q.toString()}`)
      setPreview(r.ok ? r.data : 'error')
    },
    [fetchImpl],
  )

  async function verify() {
    setVerification('loading')
    const r = await call<Verification>(fetchImpl, '/staff/audit-retention/verification')
    setVerification(r.ok ? r.data : 'error')
  }

  const info = overview && overview !== 'error' ? overview : null
  const zone = info?.policy.timeZone ? { timeZone: info.policy.timeZone } : {}
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short', ...zone })
  const at = (iso: string | null) => (iso ? time.format(new Date(iso)) : '')
  const p = preview && preview !== 'error' ? preview : null
  const missing = p ? p.confirm.filter((c) => !checked.includes(c)) : []
  const rangeOk = SEQ.test(from) && SEQ.test(to)

  const finish = (message: StaffKey) => (r: { ok: true } | { ok: false; error: ApiErrorBody }) => {
    if (r.ok) {
      setRefused([])
      setDone(t(message))
      setChecked([])
      setReason('')
      setReload((n) => n + 1)
    } else setRefused(auditRefusal(t, r.error))
    if (p) void show(p.range.fromSeq, p.range.toSeq)
  }
  const body = p ? { fromSeq: p.range.fromSeq, toSeq: p.range.toSeq, reason } : null
  const archive = () => body && void w.send('/staff/audit-retention/archive', body, finish('auditRetention.archived'))
  const remove = () =>
    body &&
    void w.send(
      '/staff/audit-retention/delete',
      { ...body, confirmedChecks: checked },
      finish('auditRetention.deleted'),
    )
  const reasonFirst = reason.trim() ? undefined : t('auditRetention.reasonFirst')
  const archiveReason = p && p.blockers.archive.length ? t('auditRetention.archiveBlocked') : reasonFirst
  const deleteReason =
    p && p.blockers.delete.length
      ? t('auditRetention.deleteBlocked')
      : missing.length
        ? t('auditRetention.checkFirst')
        : reasonFirst

  return (
    <section aria-labelledby={`${ids}-title`} className="staff-retention__audit" data-testid="audit-retention">
      <h2 id={`${ids}-title`} className="staff-queue__title">
        {t('auditRetention.title')}
      </h2>
      {overview === 'error' ? <StateView kind="error" title={t('retention.loadFailed')} /> : null}
      {info ? (
        <>
          {info.policy.state === 'CONFIGURED' ? (
            <p>
              {t('auditRetention.intro', {
                years: info.policy.years ?? info.policy.minimumYears,
                zone: info.policy.timeZone ?? '',
              })}
            </p>
          ) : (
            <StateView kind="blocked" title={t('auditRetention.notConfigured', { years: info.policy.minimumYears })} />
          )}
          <p>{t('auditRetention.backups')}</p>
          <p>
            {info.chain.sealedThrough
              ? t('auditRetention.sealed', { seq: info.chain.sealedThrough, n: info.chain.seals })
              : t('auditRetention.notSealed')}
          </p>
          <div className="hh-button-row">
            <Button variant="secondary" pending={verification === 'loading'} onClick={() => void verify()}>
              {t('auditRetention.verify')}
            </Button>
          </div>
          {verification === 'error' ? <StateView kind="error" title={t('retention.loadFailed')} /> : null}
          {verification && verification !== 'loading' && verification !== 'error' ? (
            verification.ok ? (
              <p role="status">
                {t('auditRetention.verified', {
                  n: verification.checkedEvents,
                  deletions: verification.deletions,
                  archives: verification.archives,
                })}
              </p>
            ) : (
              <StateView
                kind="error"
                title={t('auditRetention.broken')}
                reasons={
                  verification.mismatch
                    ? [
                        t('auditRetention.mismatch', {
                          at: codeLabel(t, 'auditChainMismatch', verification.mismatch.at),
                          seq: verification.mismatch.seq,
                        }),
                      ]
                    : []
                }
              />
            )
          ) : null}
          <h3 id={`${ids}-months`} className="staff-queue__title">
            {t('auditRetention.eligible', { n: info.eligible.count })}
          </h3>
          {info.eligible.months.length ? (
            <ul className="staff-queue__items" aria-labelledby={`${ids}-months`}>
              {info.eligible.months.map((m) => (
                <li key={m.month} className="staff-queue__item">
                  <span>
                    {t('auditRetention.month', {
                      month: m.month,
                      from: m.fromSeq,
                      to: m.toSeq,
                      n: m.count,
                      archived: m.archived,
                    })}
                  </span>{' '}
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setFrom(m.fromSeq)
                      setTo(m.toSeq)
                      void show(m.fromSeq, m.toSeq)
                    }}
                  >
                    {t('auditRetention.useMonth', { month: m.month })}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('auditRetention.noneEligible')}</p>
          )}
        </>
      ) : null}

      <form
        className="staff-queue__filters"
        aria-label={t('auditRetention.rangeTitle')}
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (rangeOk) void show(from, to)
        }}
      >
        <Field
          label={t('auditRetention.from')}
          name="fromSeq"
          inputMode="numeric"
          value={from}
          onChange={(e) => setFrom(e.target.value.trim())}
        />
        <Field
          label={t('auditRetention.to')}
          name="toSeq"
          inputMode="numeric"
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
        />
        <Button
          type="submit"
          variant="secondary"
          {...(rangeOk ? {} : { disabledReason: t('auditRetention.rangeFirst') })}
        >
          {t('auditRetention.show')}
        </Button>
      </form>
      {preview === 'error' ? <StateView kind="error" title={t('auditRetention.rangeFailed')} /> : null}
      {p ? (
        <div className="staff-retention__decision" data-testid="audit-range">
          <h3 className="staff-queue__title">
            {t('auditRetention.range', { from: p.range.fromSeq, to: p.range.toSeq, n: p.range.count })}
          </h3>
          <ul className="staff-queue__facts">
            {p.range.firstOccurredAt ? (
              <li>
                {t('auditRetention.recorded', { first: at(p.range.firstOccurredAt), last: at(p.range.lastOccurredAt) })}
              </li>
            ) : null}
            {p.range.periodEndsAt ? (
              <li>{t('auditRetention.periodEnds', { time: at(p.range.periodEndsAt) })}</li>
            ) : null}
            {p.notYetEligible ? <li>{t('auditRetention.notYet', { n: p.notYetEligible })}</li> : null}
            {p.archived ? <li>{t('auditRetention.alreadyArchived', { n: p.archived })}</li> : null}
            <li>{t('auditRetention.permanent')}</li>
          </ul>
          <dl className="staff-system__fields" aria-label={t('auditRetention.checks')}>
            {p.checks.map((c) => (
              <div key={c.check}>
                <dt>{codeLabel(t, 'auditRetentionCheck', c.check)}</dt>
                <dd>
                  <StatusBadge tone={TONE[c.result]}>
                    {c.result === 'found' && c.count !== undefined
                      ? t('retention.entry.found', { n: c.count })
                      : codeLabel(t, 'retentionHoldResult', c.result)}
                  </StatusBadge>
                </dd>
              </div>
            ))}
          </dl>
          {p.blockers.archive.length ? (
            <StateView
              kind="blocked"
              title={t('auditRetention.archiveBlocked')}
              reasons={p.blockers.archive.map((b) => codeLabel(t, 'auditRetentionBlocker', b))}
            />
          ) : null}
          {p.blockers.delete.length ? (
            <StateView
              kind="blocked"
              title={t('auditRetention.deleteBlocked')}
              reasons={p.blockers.delete.map((b) => codeLabel(t, 'auditRetentionBlocker', b))}
            />
          ) : (
            <fieldset className="staff-retention__checks">
              <legend>{t('auditRetention.confirmChecks')}</legend>
              {p.confirm.map((c) => (
                <label key={c} className="staff-retention__check">
                  <input
                    type="checkbox"
                    checked={checked.includes(c)}
                    onChange={(e) => setChecked((cur) => (e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)))}
                  />{' '}
                  {t('auditRetention.checked', { check: codeLabel(t, 'auditRetentionCheck', c) })}
                </label>
              ))}
            </fieldset>
          )}
          <Field
            label={t('auditRetention.reason')}
            multiline
            name="auditRetentionReason"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="hh-button-row">
            <Button
              variant="secondary"
              pending={w.pending}
              onClick={archive}
              {...(archiveReason ? { disabledReason: archiveReason } : {})}
            >
              {t('auditRetention.archive')}
            </Button>
            <Button
              variant="danger"
              pending={w.pending}
              onClick={remove}
              {...(deleteReason ? { disabledReason: deleteReason } : {})}
            >
              {t('auditRetention.delete')}
            </Button>
          </div>
          <ReauthForm t={t} w={w} />
          {refused.length ? <StateView kind="error" title={t('auditRetention.refused')} reasons={refused} /> : null}
        </div>
      ) : null}
      {done ? (
        <p role="status" className="staff-retention__done">
          {done}
        </p>
      ) : null}

      <h3 id={`${ids}-trail`} className="staff-queue__title">
        {t('auditRetention.trail')}
      </h3>
      {trail === 'error' ? <StateView kind="error" title={t('retention.loadFailed')} /> : null}
      {Array.isArray(trail) && trail.length === 0 ? <p>{t('auditRetention.trailEmpty')}</p> : null}
      {Array.isArray(trail) && trail.length ? (
        <ol className="staff-queue__items" aria-labelledby={`${ids}-trail`}>
          {trail.map((o) => (
            <li
              key={o.id}
              className="staff-queue__item"
              aria-label={t('auditRetention.operation', {
                kind: codeLabel(t, 'auditRetentionKind', o.kind),
                from: o.fromSeq,
                to: o.toSeq,
              })}
            >
              <div className="staff-queue__head">
                <span className="staff-queue__title">
                  {t('auditRetention.operation', {
                    kind: codeLabel(t, 'auditRetentionKind', o.kind),
                    from: o.fromSeq,
                    to: o.toSeq,
                  })}
                </span>
                <StatusBadge tone={o.kind === 'delete' ? 'warning' : 'neutral'}>
                  {t('auditRetention.entries', { n: o.count })}
                </StatusBadge>
              </div>
              <ul className="staff-queue__facts">
                <li>
                  {t('auditRetention.authorized', {
                    time: at(o.authorizedAt),
                    name: o.authorizedBy.name ?? o.authorizedBy.id.slice(0, 8),
                  })}
                </li>
                <li>{t('auditRetention.operationReason', { reason: o.reason })}</li>
                <li className="staff-queue__refreshed">
                  {t('auditRetention.evidence', {
                    before: o.hashBefore.slice(0, 16),
                    after: o.hashAfter.slice(0, 16),
                    seal: o.sealSeq,
                  })}
                </li>
              </ul>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
