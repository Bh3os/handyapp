// The offline actions beyond the minimal set, the Owner's switch in Settings (TSK-0115; HH-OFF-08, OWN-DEC-121,
// RULE-SAFETY-GATES). Nothing is on until the Owner turns it on, with a fresh sign-in and a reason, after walking the
// offline controls on staging (docs/owner-acceptance-testing.md, section K). The list of actions is PROPOSED
// (OQ-OFFLINE-ACTIONS-DETAILS): today checklist steps (start, pause, resume, complete). Start Work, holds, approvals,
// payments and Finished never work offline, whatever is turned on here. Staff text in English and Spanish.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { call, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type Setting = { version: number; actions: string[]; available: string[]; changedAt: string; reason: string | null }

function refusal(t: T, e: ApiErrorBody): string {
  if (e.code === 'STALE_VERSION') return t('ownerApproval.stale')
  try {
    return t(`error.${e.code}` as StaffKey)
  } catch {
    return t('error.INTERNAL')
  }
}

/** The offline actions turned on (Settings). Hidden when the server refuses it (anyone but the Owner). */
export function OfflineActionsSetting({
  t,
  fetchImpl,
  onSession,
}: {
  t: T
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
}) {
  const ids = useId()
  const [setting, setSetting] = useState<Setting | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)
  useEffect(() => {
    void call<Setting>(fetchImpl, '/staff/settings/offline-actions').then((r) => {
      if (!r.ok || !Array.isArray(r.data?.actions)) return setSetting(null)
      setSetting(r.data)
      setChosen(r.data.actions)
    })
  }, [fetchImpl])
  if (!setting) return null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!setting) return
    if (reason.trim() === '') return setError(t('approvalThreshold.reasonRequired'))
    setError(null)
    setResult(null)
    await w.send<Setting>(
      '/staff/settings/offline-actions',
      { actions: chosen, reason: reason.trim() },
      (r) => {
        if (!r.ok) return setResult({ ok: false, text: refusal(t, r.error) })
        setSetting(r.data)
        setChosen(r.data.actions)
        setReason('')
        setResult({ ok: true, text: '' })
      },
      { 'if-match': `"${setting.version}"` },
      'PUT',
    )
  }

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-title`} data-testid="offline-actions">
      <h2 id={`${ids}-title`} className="staff-queue__heading">
        {t('offlineActions.title')}
      </h2>
      <p data-testid="offline-actions-current">
        {setting.actions.length
          ? t('offlineActions.on', {
              actions: setting.actions.map((a) => codeLabel(t, 'offlineAction', a)).join(', '),
              n: setting.version,
            })
          : t('offlineActions.none', { n: setting.version })}
      </p>
      <p className="staff-request__hint">{t('offlineActions.hint')}</p>
      <p className="staff-request__hint">{t('offlineActions.never')}</p>
      <ReauthForm t={t} w={w} />
      {!w.reauth ? (
        <form onSubmit={(e) => void save(e)} noValidate aria-label={t('offlineActions.change')}>
          <fieldset>
            <legend>{t('offlineActions.choose')}</legend>
            {setting.available.map((a) => (
              <label key={a} className="staff-loadout__choice">
                <input
                  type="checkbox"
                  checked={chosen.includes(a)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, a] : c.filter((x) => x !== a)))}
                />{' '}
                {codeLabel(t, 'offlineAction', a)}
              </label>
            ))}
          </fieldset>
          <Field
            multiline
            label={t('approvalThreshold.reason')}
            name="offlineActionsReason"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            {...(error ? { error } : {})}
          />
          <Button type="submit" pending={w.pending}>
            {t('offlineActions.save')}
          </Button>
        </form>
      ) : null}
      {result?.ok ? <StateView kind="success" title={t('offlineActions.saved')} /> : null}
      {result && !result.ok ? (
        <StateView kind="error" title={t('ownerApproval.refused')} reasons={[result.text]} />
      ) : null}
    </section>
  )
}
