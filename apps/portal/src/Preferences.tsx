// /portal/preferences: the signed-in account's preferences (TSK-0113; HH-ID-12, HH-COM-05, ENT-ConsentPreference,
// OWN-DEC-113, OWN-DEC-147). The contact method a new request starts with, and the customer's own permissions for the
// email and phone they sign in with, as the send-time checks read them: marketing, optional follow-ups after a job and
// texts. Any of them can be stopped here; only email permissions are given back here, and texts are agreed to on the
// request form (the SMS terms' opt-in path). Each choice is recorded as the customer's own consent record. The wording
// is PROPOSED (OQ-SAVED-PROPERTIES-DETAILS).
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import type { CustomerKey } from '@handyhub/i18n'
import { Button } from '@handyhub/ui'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  CONTACT_METHODS,
  portalApi,
  type AccountPermission,
  type AccountPreferences,
  type ConsentState,
  type ContactMethod,
  type Failure,
  type Fetch,
  type SettingsFailure,
} from './api'
import { t } from './labels'
import { NotShown } from './States'

type Load =
  | { phase: 'loading' }
  | { phase: 'failed'; failure: Failure; retrying: boolean }
  | { phase: 'ready'; data: AccountPreferences }

const METHOD: Record<ContactMethod, CustomerKey> = {
  email: 'request.contact.email_channel',
  call: 'request.contact.call',
  text: 'request.contact.text',
}
const PERMISSION: Record<AccountPermission, CustomerKey> = {
  marketing: 'portal.preferences.marketing',
  follow_ups: 'portal.preferences.followUps',
  texts: 'portal.preferences.texts',
}
const PROBLEM: Record<SettingsFailure, CustomerKey> = {
  expired: 'portal.expired.title',
  unavailable: 'portal.preferences.error.failed',
  invalid_label: 'portal.preferences.error.failed',
  label_in_use: 'portal.preferences.error.failed',
  already_saved: 'portal.preferences.error.failed',
  texts_on_request_form: 'portal.preferences.error.textsOnForm',
  rate_limited: 'portal.estimate.failure.rate_limited',
  failed: 'portal.preferences.error.failed',
}

/** Whether a permission is in effect: optional follow-ups are on until stopped; the others only once given. */
const isOn = (permission: AccountPermission, state: ConsentState) =>
  state === 'granted' || (permission === 'follow_ups' && state === 'none')

type Choose = (body: { channel: 'email' | 'sms'; permission: AccountPermission; granted: boolean }) => Promise<void>

function Row({
  channel,
  permission,
  state,
  busy,
  choose,
}: {
  channel: 'email' | 'sms'
  permission: AccountPermission
  state: ConsentState
  busy: string | null
  choose: Choose
}) {
  const on = isOn(permission, state)
  const id = `${channel}-${permission}`
  const name = t(PERMISSION[permission])
  return (
    <li className="portal-preferences__row" data-testid={`permission-${id}`}>
      <p>
        <strong>{name}</strong>: {on ? t('portal.preferences.on') : t('portal.preferences.off')}
      </p>
      {on ? (
        <Button
          variant="secondary"
          pending={busy === id}
          onClick={() => void choose({ channel, permission, granted: false })}
        >
          {t('portal.preferences.stop', { permission: name.toLowerCase() })}
        </Button>
      ) : channel === 'email' ? (
        <>
          {permission === 'marketing' ? (
            <p className="hh-small">
              {t('portal.preferences.allowMarketing')}{' '}
              <a href={PRIVACY_NOTICE.path} target="_blank" rel="noopener">
                {t('legal.link.privacy')}
                <span className="hh-visually-hidden"> {t('request.newTab')}</span>
              </a>
            </p>
          ) : null}
          <Button
            variant="secondary"
            pending={busy === id}
            onClick={() => void choose({ channel, permission, granted: true })}
          >
            {t('portal.preferences.allow', { permission: name.toLowerCase() })}
          </Button>
        </>
      ) : permission === 'texts' ? (
        <p className="hh-small hh-muted">{t('portal.preferences.textsAgain')}</p>
      ) : null}
    </li>
  )
}

export function PreferencesPage({ fetchImpl }: { fetchImpl: Fetch }) {
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [channel, setChannel] = useState<ContactMethod | 'none'>('none')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const show = (data: AccountPreferences) => {
    setLoad({ phase: 'ready', data })
    setChannel(data.preferredChannel ?? 'none')
  }
  const refresh = useCallback(async () => {
    setLoad((l) => (l.phase === 'failed' ? { ...l, retrying: true } : l))
    const r = await portalApi.preferences(fetchImpl)
    if (r.ok) show(r.data)
    else setLoad({ phase: 'failed', failure: r.failure, retrying: false })
  }, [fetchImpl])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const outcome = (r: Awaited<ReturnType<typeof portalApi.setPermission>>, done: CustomerKey) => {
    if (r.ok) {
      show(r.data)
      return setNotice(t(done))
    }
    if (r.failure === 'expired') return setLoad({ phase: 'failed', failure: 'expired', retrying: false })
    setNotice(t(PROBLEM[r.failure]))
  }

  const saveChannel = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy('channel')
    setNotice(null)
    const r = await portalApi.setPreferredChannel(fetchImpl, channel === 'none' ? null : channel)
    setBusy(null)
    outcome(r, 'portal.preferences.channel.saved')
  }

  const choose: Choose = async (body) => {
    if (busy) return
    setBusy(`${body.channel}-${body.permission}`)
    setNotice(null)
    const r = await portalApi.setPermission(fetchImpl, {
      ...body,
      // A marketing permission given here records the privacy notice version shown beside it.
      ...(body.granted && body.permission === 'marketing' ? { privacyNoticeVersion: PRIVACY_NOTICE.documentId } : {}),
    })
    setBusy(null)
    outcome(r, 'portal.preferences.done')
  }

  return (
    <>
      <p className="portal-back">
        <a href="/portal/">{t('portal.account.back')}</a>
      </p>
      <h1 className="hh-h2">{t('portal.preferences.title')}</h1>
      {load.phase !== 'ready' ? (
        <NotShown
          live={load}
          loading="portal.preferences.loading"
          failedTitle="portal.preferences.failed"
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <p role="status" className="portal-claim__notice">
            {notice ?? ''}
          </p>
          <section className="portal-dashboard__section" aria-labelledby="portal-preferences-channel">
            <h2 id="portal-preferences-channel" className="hh-h3">
              {t('portal.preferences.channel.title')}
            </h2>
            <form className="portal-claim__form" onSubmit={(e) => void saveChannel(e)} noValidate>
              <fieldset className="portal-preferences__choices">
                <legend className="hh-visually-hidden">{t('portal.preferences.channel.title')}</legend>
                <p className="hh-small">{t('portal.preferences.channel.text')}</p>
                {[...CONTACT_METHODS, 'none' as const].map((m) => (
                  <label key={m} className="portal-preferences__choice">
                    <input
                      type="radio"
                      name="preferred-channel"
                      value={m}
                      checked={channel === m}
                      onChange={() => setChannel(m)}
                    />{' '}
                    {m === 'none' ? t('portal.preferences.channel.none') : t(METHOD[m])}
                  </label>
                ))}
              </fieldset>
              <Button type="submit" pending={busy === 'channel'}>
                {t('portal.preferences.channel.save')}
              </Button>
            </form>
          </section>
          <section className="portal-dashboard__section" aria-labelledby="portal-preferences-messages">
            <h2 id="portal-preferences-messages" className="hh-h3">
              {t('portal.preferences.messages.title')}
            </h2>
            <p>{t('portal.preferences.messages.text')}</p>
            {load.data.email ? (
              <section aria-labelledby="portal-preferences-email">
                <h3 id="portal-preferences-email" className="hh-h3">
                  {t('portal.preferences.email', { destination: load.data.email.destination })}
                </h3>
                <ul className="portal-preferences">
                  <Row
                    channel="email"
                    permission="marketing"
                    state={load.data.email.marketing}
                    busy={busy}
                    choose={choose}
                  />
                  <Row
                    channel="email"
                    permission="follow_ups"
                    state={load.data.email.followUps}
                    busy={busy}
                    choose={choose}
                  />
                </ul>
              </section>
            ) : null}
            {load.data.phone ? (
              <section aria-labelledby="portal-preferences-phone">
                <h3 id="portal-preferences-phone" className="hh-h3">
                  {t('portal.preferences.phone', { destination: load.data.phone.destination })}
                </h3>
                <ul className="portal-preferences">
                  <Row channel="sms" permission="texts" state={load.data.phone.texts} busy={busy} choose={choose} />
                  <Row
                    channel="sms"
                    permission="marketing"
                    state={load.data.phone.marketing}
                    busy={busy}
                    choose={choose}
                  />
                  <Row
                    channel="sms"
                    permission="follow_ups"
                    state={load.data.phone.followUps}
                    busy={busy}
                    choose={choose}
                  />
                </ul>
              </section>
            ) : null}
          </section>
        </>
      )}
    </>
  )
}
