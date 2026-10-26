// The table-to-retention mapping review on the Retention reviews screen (TSK-0152; OWN-DEC-201 I5, HH-PRIV-01,
// HH-PRIV-05). The Owner sees the mapping's digest, the findings a reviewer looks at, each category with where its rule
// comes from and its tables, the live audit of this database, the latest review and whether production deletion is
// enabled; and records a review of the mapping in force, saying whether the CPA and the attorney confirmed it (fresh
// sign-in, a note). The report itself is docs/retention-mapping-review.md.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState } from 'react'
import { call, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type MappingReviewRecord = {
  id: string
  digest: string
  tables: number
  cpaConfirmed: boolean
  attorneyConfirmed: boolean
  note: string
  recordedBy: { id: string; name: string | null }
  recordedAt: string
}

export type MappingStatus = {
  digest: string
  tables: number
  environment: string
  productionDeletion: 'enabled' | 'disabled'
  latest: MappingReviewRecord | null
  current: boolean
  findings: { finding: string; tables: number }[]
  categories: { category: string; status: string; scan: string; tables: string[] }[]
  live: { unannotated: string[]; missing: string[] }
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')

function reasons(t: T, error: ApiErrorBody): string[] {
  const out = error.fieldErrors.map((f) => codeLabel(t, 'privacyProblem', f.code))
  return out.length ? out : [codeLabel(t, 'privacyProblem', error.code)]
}

export function MappingReview({
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
  const [s, setS] = useState<MappingStatus | null | 'error'>(null)
  const [cpa, setCpa] = useState(false)
  const [attorney, setAttorney] = useState(false)
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState<{ ok: true } | { ok: false; reasons: string[] } | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)
  const load = useCallback(async () => {
    const r = await call<MappingStatus>(fetchImpl, '/staff/retention-mapping')
    setS(r.ok ? r.data : 'error')
  }, [fetchImpl])
  useEffect(() => {
    void load()
  }, [load])
  if (s === null) return <StateView kind="loading" title={t('common.loading')} />
  if (s === 'error') return <StateView kind="error" title={t('mapping.loadFailed')} />
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const enabled = s.productionDeletion === 'enabled'
  const record = () =>
    void w.send<MappingReviewRecord>(
      '/staff/retention-mapping/reviews',
      { digest: s.digest, cpaConfirmed: cpa, attorneyConfirmed: attorney, note },
      (r) => {
        if (!r.ok) return setOutcome({ ok: false, reasons: reasons(t, r.error) })
        setOutcome({ ok: true })
        setNote('')
        void load()
      },
    )
  return (
    <section aria-labelledby={`${ids}-title`} data-testid="mapping-review">
      <h2 id={`${ids}-title`} className="staff-queue__title">
        {t('mapping.title')}
      </h2>
      <p>{t('mapping.intro')}</p>
      <p>
        <StatusBadge tone={enabled ? 'success' : 'warning'}>
          {t(enabled ? 'mapping.deletionEnabled' : 'mapping.deletionDisabled')}
        </StatusBadge>
      </p>
      <ul className="staff-queue__facts">
        <li>{t('mapping.environment', { environment: s.environment })}</li>
        <li>{t('mapping.digest', { digest: s.digest, n: s.tables })}</li>
        <li>
          {s.latest
            ? t(s.current ? 'mapping.latestCurrent' : 'mapping.latestStale', {
                time: time.format(new Date(s.latest.recordedAt)),
                name: s.latest.recordedBy.name ?? '',
              })
            : t('mapping.neverReviewed')}
        </li>
        {s.latest ? (
          <li>
            {t('mapping.latestConfirmations', {
              cpa: t(s.latest.cpaConfirmed ? 'mapping.yes' : 'mapping.no'),
              attorney: t(s.latest.attorneyConfirmed ? 'mapping.yes' : 'mapping.no'),
            })}
          </li>
        ) : null}
      </ul>
      <h3 className="staff-queue__title">{t('mapping.live.title')}</h3>
      {s.live.unannotated.length + s.live.missing.length === 0 ? (
        <p>{t('mapping.live.ok')}</p>
      ) : (
        <ul aria-label={t('mapping.live.title')}>
          {s.live.unannotated.map((x) => (
            <li key={`u-${x}`}>{t('mapping.live.unannotated', { table: x })}</li>
          ))}
          {s.live.missing.map((x) => (
            <li key={`m-${x}`}>{t('mapping.live.missing', { table: x })}</li>
          ))}
        </ul>
      )}
      <h3 className="staff-queue__title">{t('mapping.findings')}</h3>
      <ul aria-label={t('mapping.findings')}>
        {s.findings.map((f) => (
          <li key={f.finding}>
            {t('mapping.finding', { finding: codeLabel(t, 'mappingFinding', f.finding), n: f.tables })}
          </li>
        ))}
      </ul>
      <details>
        <summary>{t('mapping.categories')}</summary>
        <ul className="staff-queue__items">
          {s.categories.map((c) => (
            <li key={c.category} className="staff-queue__item">
              <strong>{codeLabel(t, 'retentionCategory', c.category)}</strong>{' '}
              <StatusBadge tone={c.status === 'decided' ? 'neutral' : 'warning'}>
                {codeLabel(t, 'mappingCategoryStatus', c.status)}
              </StatusBadge>{' '}
              {codeLabel(t, 'retentionScan', c.scan)}
              <p className="staff-queue__refreshed">{c.tables.length ? c.tables.join(', ') : t('mapping.noTables')}</p>
            </li>
          ))}
        </ul>
      </details>
      <form
        className="staff-privacy__decision"
        aria-label={t('mapping.record.title')}
        onSubmit={(e) => {
          e.preventDefault()
          if (note.trim()) record()
        }}
      >
        <h3 className="staff-queue__title">{t('mapping.record.title')}</h3>
        <p>{t('mapping.record.intro')}</p>
        <label className="staff-retention__check">
          <input type="checkbox" checked={cpa} onChange={(e) => setCpa(e.target.checked)} /> {t('mapping.record.cpa')}
        </label>
        <label className="staff-retention__check">
          <input type="checkbox" checked={attorney} onChange={(e) => setAttorney(e.target.checked)} />{' '}
          {t('mapping.record.attorney')}
        </label>
        <Field
          label={t('mapping.record.note')}
          multiline
          name="mapping-note"
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="hh-button-row">
          <Button
            type="submit"
            variant="secondary"
            pending={w.pending}
            {...(note.trim() ? {} : { disabledReason: t('mapping.record.noteFirst') })}
          >
            {t('mapping.record.submit')}
          </Button>
        </div>
        {outcome?.ok ? <StateView kind="success" title={t('mapping.record.done')} /> : null}
        {outcome && !outcome.ok ? (
          <StateView kind="error" title={t('mapping.record.refused')} reasons={outcome.reasons} />
        ) : null}
      </form>
      <ReauthForm t={t} w={w} />
    </section>
  )
}
