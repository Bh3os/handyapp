// The receipt's contact verification and the optional account offer (TSK-0033; HH-INT-13, HH-ID-03, HH-INT-14,
// OWN-DEC-94, OWN-DEC-96, OWN-DEC-63, RULE-LANGUAGES). English only.
// - Email and phone each show their masked value and their own state, with code entry, Resend and Change Contact
//   (OWN-DEC-96). Verifying one never marks the other. The phone is verified by text only, so it needs this request's
//   SMS opt-in; without it the page says so and the phone stays unverified.
// - Change Contact (email): the code goes to the new address, and the email changes only when that code is entered.
// - Everything shown comes from the server's answer about this request's own contact, under this tab's receipt
//   capability; nothing about any other request, customer or account is ever asked for or shown.
// - After a contact is verified, Create an Account is offered as optional; "No thanks" hides the offer and changes
//   nothing else. TSK-0036: Create an Account sends a one-time code to a verified value and creates the account (or
//   signs in to the one that value has) with this request's project in it (account/AccountEnrollment.tsx).
// - TSK-0034: a verified code also starts this browser's session for the request's one project; the receipt then
//   offers View My Request.
// - TSK-0134 (OWN-DEC-178, OWN-DEC-190 opt-in point B): without a current SMS opt-in on the request, the phone row
//   offers a separate, unchecked checkbox for a one-time verification code by text, with the owner's label and
//   disclosure (SMS_VERIFICATION_DISCLOSURE) and links to the Privacy Policy, the SMS Terms and the Website Terms.
//   "Text me a code" first records the consent (the server keeps the disclosure version shown) and only then asks for
//   the code; without the box checked nothing is sent or recorded. Leaving it unchecked keeps the phone unverified and
//   the email verification works as before; the request is saved either way.
import { legalDocument, SMS_VERIFICATION_DISCLOSURE } from '@handyhub/domain/legal'
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Field, StatusBadge } from '@handyhub/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AccountEnrollment } from '../account/AccountEnrollment.js'
import type { EnrollChannel } from '../account/account.js'
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
  type SmsCodeConsent,
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
  /** TSK-0134: the phone row's consent to a verification code by text. */
  smsCodeConsent: SmsCodeConsent
  capability: string
  fetchImpl: Fetch
  onStatus: (s: ContactStatus) => void
  onProjectAccess: () => void
}

/** TSK-0134: the owner's disclosure beside the box and the links it names, opened in a new tab. */
function SmsCodeDisclosure({ id }: { id: string }) {
  const links = SMS_VERIFICATION_DISCLOSURE.blocks.flatMap((b) => (b.kind === 'link' ? [b] : []))
  return (
    <div id={id} className="hh-request__disclosure" data-testid="sms-code-disclosure">
      {SMS_VERIFICATION_DISCLOSURE.blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i} data-key={b.key}>
            {t(b.key as CustomerKey)}
          </p>
        ) : null,
      )}
      <ul>
        {links.map((b) => (
          <li key={b.key}>
            <a href={legalDocument(b.to).path} target="_blank" rel="noopener">
              {t(b.key as CustomerKey)}
              <span className="hh-visually-hidden"> {t('request.newTab')}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChannelRow({ channel, status, smsCodeConsent, capability, fetchImpl, onStatus, onProjectAccess }: RowProps) {
  const [code, setCode] = useState('')
  const [changing, setChanging] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  /** The new address of a change sent from this page (kept here only, for Resend). */
  const [changeTo, setChangeTo] = useState<string | null>(null)
  const [sent, setSent] = useState<{ minutes: number } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [codeError, setCodeError] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<'send' | 'verify' | 'change' | 'consent' | null>(null)
  /** TSK-0134: the receipt's checkbox, unchecked until the guest checks it. */
  const [agreed, setAgreed] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)
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
    // TSK-0034: the entered code also opened this browser's session for the project (View My Request).
    if (r.data.projectAccess) onProjectAccess()
  }

  /** TSK-0134: records the consent to a verification code by text, then asks for the code; nothing without the box. */
  const agreeAndSend = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!agreed) return setConsentError(t('request.verify.smsConsent.required'))
    setBusy('consent')
    setNotice(null)
    setConsentError(null)
    const r = await api.smsConsent(fetchImpl, capability)
    setBusy(null)
    if (!r.ok) {
      setNotice(r.notice)
      const fresh = await api.status(fetchImpl, capability)
      if (fresh.ok) onStatus(fresh.data)
      return
    }
    onStatus(r.data)
    await send()
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
        channel === 'phone' && smsCodeConsent === 'offered' ? (
          <form className="hh-verify__form" onSubmit={(e) => void agreeAndSend(e)} noValidate>
            <p>{t('request.verify.smsConsent.intro')}</p>
            <fieldset
              className="hh-request__group"
              data-sms-verification-disclosure={SMS_VERIFICATION_DISCLOSURE.documentId}
              aria-invalid={consentError ? true : undefined}
            >
              <legend className="hh-field__label">{t('request.verify.smsConsent.title')}</legend>
              <label className="hh-request__option">
                <input
                  type="checkbox"
                  name="sms-code-consent"
                  aria-describedby={`${id}-disclosure${consentError ? ` ${id}-consent-error` : ''}`}
                  checked={agreed}
                  onChange={(e) => {
                    setAgreed(e.currentTarget.checked)
                    setConsentError(null)
                  }}
                />
                <span>{t(SMS_VERIFICATION_DISCLOSURE.label as CustomerKey)}</span>
              </label>
              <SmsCodeDisclosure id={`${id}-disclosure`} />
              {consentError ? (
                <p id={`${id}-consent-error`} className="hh-field__error">
                  {consentError}
                </p>
              ) : null}
            </fieldset>
            <div className="hh-request__actions">
              <Button type="submit" pending={busy === 'consent' || busy === 'send'}>
                {t(SEND_LABEL.phone)}
              </Button>
            </div>
          </form>
        ) : (
          <p>{t('request.verify.phoneNoTexts')}</p>
        )
      ) : (
        <>
          {channel === 'phone' && smsCodeConsent === 'recorded' ? (
            <p>{t('request.verify.smsConsent.recorded')}</p>
          ) : null}
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

/** TSK-0036: the values an account can be created with: the verified ones (the phone only when it can be texted). */
export function enrollChannels(status: ContactStatus): EnrollChannel[] {
  return [
    ...(status.email.state === 'verified'
      ? [{ channel: 'email' as const, destination: status.email.destination }]
      : []),
    // TSK-0134: a consent to verification codes by text on the receipt is not the SMS opt-in sign-in codes need.
    ...(status.phone.state === 'verified' && status.phone.available && status.smsCodeConsent === 'not_needed'
      ? [{ channel: 'phone' as const, destination: status.phone.destination }]
      : []),
  ]
}

export function ContactVerification({
  capability,
  declined,
  onDecline,
  onProjectAccess = () => undefined,
  fetchImpl = browserFetch,
}: {
  /** This tab's receipt capability; null when the page has none (the request is saved either way). */
  capability: string | null
  /** The guest already declined the account offer in this tab. */
  declined: boolean
  /** Called once the guest declined the offer (the page remembers it in this tab). */
  onDecline: () => void
  /** TSK-0034: called when a verified code opened this browser's session for the request's project. */
  onProjectAccess?: () => void
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
                smsCodeConsent={status.smsCodeConsent}
                capability={capability}
                fetchImpl={fetchImpl}
                onStatus={setStatus}
                onProjectAccess={onProjectAccess}
              />
            ))}
          </>
        )}
      </section>
      {offerAccount(status, declined) && capability && status ? (
        <AccountEnrollment
          from={{ kind: 'receipt', capability }}
          channels={enrollChannels(status)}
          onDecline={() => void decline()}
          declining={declining}
          onEnrolled={onProjectAccess}
          fetchImpl={fetchImpl}
        />
      ) : justDeclined ? (
        <p role="status">{t('request.account.declined')}</p>
      ) : null}
    </>
  )
}
