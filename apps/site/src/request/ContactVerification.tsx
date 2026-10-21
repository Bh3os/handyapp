// The receipt's contact verification and the optional account offer (TSK-0033; HH-INT-13, HH-ID-03, HH-INT-14,
// OWN-DEC-94, OWN-DEC-96, OWN-DEC-63, RULE-LANGUAGES). English only.
// - Email and phone each show their masked value and their own state, with code entry, Resend and Change Contact
//   (OWN-DEC-96). Verifying one never marks the other. The phone is verified by text only, so it needs this request's
//   SMS opt-in; without it the page says so and the phone stays unverified.
// - Change Contact (email): the code goes to the new address, and the email changes only when that code is entered.
// - Everything shown comes from the server's answer about this request's own contact, under this tab's receipt
//   capability; nothing about any other request, customer or account is ever asked for or shown.
// - After a contact is verified, Create an Account is offered as optional. Accounts are not available yet (TSK-0036),
//   so the button says so; "No thanks" hides the offer and changes nothing else.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Field, StatusBadge } from '@handyhub/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  api,
  CHANNEL_LABEL,
  minutesLeft,
  noticeText,
  offerAccount,
  STATE_LABEL,
  STATE_TONE,
  type Channel,
  type ChannelStatus,
  type ContactStatus,
  type Fetch,
  type Notice,
} from './verification.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

const SEND_LABEL: Record<Channel, CustomerKey> = {
  email: 'request.verify.send.email',
  phone: 'request.verify.send.phone',
}
const DONE: Record<Channel, CustomerKey> = { email: 'request.verify.done.email', phone: 'request.verify.done.phone' }
/** One stable function: the status is read once per capability, not again on every render. */
const browserFetch: Fetch = (input, init) => fetch(input, init)

type RowProps = {
  channel: Channel
  status: ChannelStatus
  capability: string
  fetchImpl: Fetch
  onStatus: (s: ContactStatus) => void
}

function ChannelRow({ channel, status, capability, fetchImpl, onStatus }: RowProps) {
  const [code, setCode] = useState('')
  const [changing, setChanging] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  /** The new address of a change sent from this page (kept here only, for Resend). */
  const [changeTo, setChangeTo] = useState<string | null>(null)
  const [sent, setSent] = useState<{ minutes: number } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [codeError, setCodeError] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<'send' | 'verify' | 'change' | null>(null)
  const codeRef = useRef<HTMLDivElement>(null)
  /** Bumped after a code was sent: once the code field is on the page, it takes the focus. */
  const [focusCode, setFocusCode] = useState(0)
  const id = `hh-verify-${channel}`

  useEffect(() => {
    if (focusCode) codeRef.current?.querySelector('input')?.focus()
  }, [focusCode])

  const send = async (destination?: string, which: 'send' | 'change' = 'send') => {
    setBusy(which)
    setNotice(null)
    setCodeError(null)
    const r = await api.send(fetchImpl, capability, channel, destination)
    setBusy(null)
    if (!r.ok) return setNotice(r.notice)
    onStatus(r.data.contact)
    setSent({ minutes: minutesLeft(r.data.expiresAt) })
    setChangeTo(r.data.change ? (destination ?? null) : null)
    setChanging(false)
    setCode('')
    setFocusCode((n) => n + 1)
  }

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!code.trim()) return setCodeError({ key: 'request.verify.error.invalidCode' })
    setBusy('verify')
    setNotice(null)
    setCodeError(null)
    const r = await api.verify(fetchImpl, capability, channel, code)
    setBusy(null)
    if (!r.ok) {
      setCodeError(r.notice)
      // The code's state may have moved on (expired, or out of attempts): show the server's current answer.
      const fresh = await api.status(fetchImpl, capability)
      if (fresh.ok) onStatus(fresh.data)
      return
    }
    setCode('')
    setSent(null)
    setChangeTo(null)
    onStatus(r.data.contact)
    setNotice({ key: r.data.changed ? 'request.verify.done.changed' : DONE[channel] })
  }

  const change = status.change
  const live = status.state === 'pending' || change?.state === 'pending'
  const ended = !live && (status.state === 'expired' || status.state === 'failed' || change !== null)

  return (
    <div className="hh-verify__channel" role="group" aria-labelledby={`${id}-label`}>
      <h4 id={`${id}-label`} className="hh-verify__label">
        {t(CHANNEL_LABEL[channel])}
      </h4>
      <p className="hh-verify__value">
        <span>{status.destination}</span>{' '}
        <StatusBadge tone={STATE_TONE[status.state]}>{t(STATE_LABEL[status.state])}</StatusBadge>
      </p>

      {status.state === 'verified' ? null : !status.available ? (
        <p>{t('request.verify.phoneNoTexts')}</p>
      ) : (
        <>
          {live ? (
            <>
              <p>
                {change?.state === 'pending'
                  ? t('request.verify.changePending', { destination: change.destination })
                  : t('request.verify.sentTo', { destination: status.destination })}{' '}
                {sent ? t('request.verify.expiresIn', { minutes: sent.minutes }) : null}
              </p>
              <form className="hh-verify__form" onSubmit={(e) => void verify(e)} noValidate>
                <div ref={codeRef}>
                  <Field
                    label={t('request.verify.code')}
                    name={`${channel}-code`}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    {...(codeError ? { error: noticeText(codeError) } : {})}
                  />
                </div>
                <Button type="submit" pending={busy === 'verify'}>
                  {t('request.verify.submit')}
                </Button>
              </form>
            </>
          ) : ended ? (
            <p>{t('request.verify.ended')}</p>
          ) : null}
          <div className="hh-request__actions">
            {live ? (
              change?.state === 'pending' && !changeTo ? null : (
                <Button
                  variant="secondary"
                  pending={busy === 'send'}
                  onClick={() => void send(change?.state === 'pending' ? (changeTo ?? undefined) : undefined)}
                >
                  {t('request.verify.resend')}
                </Button>
              )
            ) : (
              <Button variant={ended ? 'secondary' : 'primary'} pending={busy === 'send'} onClick={() => void send()}>
                {ended ? t('request.verify.sendNew') : t(SEND_LABEL[channel])}
              </Button>
            )}
            {channel === 'email' && !changing ? (
              <Button variant="quiet" onClick={() => setChanging(true)}>
                {t('request.verify.change')}
              </Button>
            ) : null}
          </div>
          {channel === 'email' && changing ? (
            <form
              className="hh-verify__form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                if (!busy) void send(newEmail.trim(), 'change')
              }}
            >
              <Field
                label={t('request.verify.newEmail')}
                hint={t('request.verify.changeHint')}
                type="email"
                name="new-email"
                autoComplete="email"
                maxLength={254}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <div className="hh-request__actions">
                <Button type="submit" pending={busy === 'change'}>
                  {t('request.verify.changeSend')}
                </Button>
                <Button variant="quiet" onClick={() => setChanging(false)}>
                  {t('request.verify.cancel')}
                </Button>
              </div>
            </form>
          ) : null}
        </>
      )}
      <p role="status" className="hh-verify__notice">
        {notice ? noticeText(notice) : ''}
      </p>
    </div>
  )
}

function AccountOffer({ onDecline, pending }: { onDecline: () => void; pending: boolean }) {
  return (
    <section className="hh-receipt__section" aria-labelledby="hh-account-offer">
      <h3 id="hh-account-offer" className="hh-h3">
        {t('request.account.title')}
      </h3>
      <p>{t('request.continue.accountText')}</p>
      <p>{t('request.account.optional')}</p>
      <div className="hh-request__actions">
        <Button variant="secondary" disabledReason={t('request.continue.accountsUnavailable')}>
          {t('request.continue.account')}
        </Button>
        <Button variant="quiet" pending={pending} onClick={onDecline}>
          {t('request.account.decline')}
        </Button>
      </div>
    </section>
  )
}

export function ContactVerification({
  capability,
  declined,
  onDecline,
  fetchImpl = browserFetch,
}: {
  /** This tab's receipt capability; null when the page has none (the request is saved either way). */
  capability: string | null
  /** The guest already declined the account offer in this tab. */
  declined: boolean
  /** Called once the guest declined the offer (the page remembers it in this tab). */
  onDecline: () => void
  fetchImpl?: Fetch
}) {
  const [status, setStatus] = useState<ContactStatus | null>(null)
  const [load, setLoad] = useState<'loading' | 'ready' | 'unavailable' | 'failed'>(
    capability ? 'loading' : 'unavailable',
  )
  const [declining, setDeclining] = useState(false)
  const [justDeclined, setJustDeclined] = useState(false)

  useEffect(() => {
    if (!capability) return
    let live = true
    void api.status(fetchImpl, capability).then((r) => {
      if (!live) return
      if (r.ok) {
        setStatus(r.data)
        setLoad('ready')
      } else setLoad(r.notice.key === 'request.verify.unavailable' ? 'unavailable' : 'failed')
    })
    return () => {
      live = false
    }
  }, [capability, fetchImpl])

  const decline = async () => {
    if (!capability || declining) return
    setDeclining(true)
    // Declining changes nothing; the server only records the answer, so the offer goes away whatever it says.
    await api.decline(fetchImpl, capability)
    setDeclining(false)
    setJustDeclined(true)
    onDecline()
  }

  return (
    <>
      <section className="hh-receipt__section hh-verify" aria-labelledby="hh-verify-title">
        <h3 id="hh-verify-title" className="hh-h3">
          {t('request.verify.title')}
        </h3>
        {load === 'unavailable' ? (
          <p>{t('request.verify.unavailable')}</p>
        ) : load === 'failed' ? (
          <p role="alert">{t('request.verify.error.failed')}</p>
        ) : load === 'loading' || !status || !capability ? (
          <p role="status">{t('request.verify.loading')}</p>
        ) : (
          <>
            <p>{t('request.verify.intro')}</p>
            {(['email', 'phone'] as const).map((channel) => (
              <ChannelRow
                key={channel}
                channel={channel}
                status={status[channel]}
                capability={capability}
                fetchImpl={fetchImpl}
                onStatus={setStatus}
              />
            ))}
          </>
        )}
      </section>
      {offerAccount(status, declined) ? (
        <AccountOffer onDecline={() => void decline()} pending={declining} />
      ) : justDeclined ? (
        <p role="status">{t('request.account.declined')}</p>
      ) : null}
    </>
  )
}
