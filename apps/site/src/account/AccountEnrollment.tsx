// Create an Account (TSK-0036; HH-INT-14, HH-ID-10, HH-ID-03, OWN-DEC-63, OWN-DEC-94, RULE-LANGUAGES). English only.
// The optional offer after a verified contact: on the receipt (its capability) and, later, on the project page of a
// guest link (its session). The guest picks one of the contact's verified values, enters the one-time code sent to
// it, and only then is the account created (or signed in to) with this one project in it. "No thanks" (receipt only)
// changes nothing. Nothing here names another project, customer or account.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Field } from '@handyhub/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { minutesLeft, noticeText, type Channel, type Fetch, type Notice } from '../request/verification.js'
import { accountApi, accountNotice, type EnrollChannel, type EnrollFrom } from './account.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)
const browserFetch: Fetch = (input, init) => fetch(input, init)

const SEND_LABEL: Record<Channel, CustomerKey> = {
  email: 'request.verify.send.email',
  phone: 'request.verify.send.phone',
}

type Step =
  | { kind: 'offer' }
  | { kind: 'choose' }
  | { kind: 'code'; channel: Channel; sentTo: string; minutes: number }
  | { kind: 'done' }

export function AccountEnrollment({
  from,
  channels,
  onDecline,
  declining = false,
  onEnrolled = () => undefined,
  fetchImpl = browserFetch,
}: {
  from: EnrollFrom
  /** The contact's verified values the code can go to (masked). */
  channels: EnrollChannel[]
  /** Receipt only: "No thanks". */
  onDecline?: () => void
  declining?: boolean
  /** Called once the account exists and this browser is signed in to it. */
  onEnrolled?: () => void
  fetchImpl?: Fetch
}) {
  const [step, setStep] = useState<Step>({ kind: 'offer' })
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [codeError, setCodeError] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const area = useRef<HTMLElement>(null)

  // Each new step takes the focus (the code field, or the step's first control).
  useEffect(() => {
    if (step.kind === 'offer') return
    const target = step.kind === 'code' ? 'input' : step.kind === 'done' ? '[data-focus]' : 'button'
    area.current?.querySelector<HTMLElement>(target)?.focus()
  }, [step.kind])

  const send = async (channel: Channel) => {
    setBusy(`send-${channel}`)
    setNotice(null)
    setCodeError(null)
    const r = await accountApi.sendEnrollCode(fetchImpl, from, channel)
    setBusy(null)
    if (!r.ok) return setNotice(accountNotice(r))
    setCode('')
    setStep({ kind: 'code', channel, sentTo: r.data.sentTo, minutes: minutesLeft(r.data.expiresAt) })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (step.kind !== 'code' || busy) return
    if (!code.trim()) return setCodeError({ key: 'request.verify.error.invalidCode' })
    setBusy('enroll')
    setNotice(null)
    setCodeError(null)
    const r = await accountApi.enroll(fetchImpl, from, step.channel, code)
    setBusy(null)
    if (!r.ok) {
      if (r.field === 'invalid_code') return setCodeError(r.notice)
      return setNotice(accountNotice(r))
    }
    setCode('')
    setStep({ kind: 'done' })
    onEnrolled()
  }

  return (
    <section ref={area} className="hh-receipt__section" aria-labelledby="hh-account-offer">
      <h3 id="hh-account-offer" className="hh-h3">
        {t('request.account.title')}
      </h3>
      {step.kind === 'done' ? (
        <>
          <p role="status" tabIndex={-1} data-focus>
            {t('account.enroll.done')}
          </p>
          <div className="hh-request__actions">
            <a className="hh-button" href="/account">
              {t('account.enroll.goTo')}
            </a>
          </div>
        </>
      ) : (
        <>
          <p>{t('request.continue.accountText')}</p>
          <p>{t('request.account.optional')}</p>
          {step.kind === 'offer' ? (
            <div className="hh-request__actions">
              <Button variant="secondary" onClick={() => setStep({ kind: 'choose' })}>
                {t('request.continue.account')}
              </Button>
              {onDecline ? (
                <Button variant="quiet" pending={declining} onClick={onDecline}>
                  {t('request.account.decline')}
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              {channels.length === 0 ? (
                <p>{t('account.enroll.none')}</p>
              ) : (
                <>
                  <p>{t('account.enroll.choose')}</p>
                  {step.kind === 'code' ? (
                    <>
                      <p>
                        {t('request.verify.sentTo', { destination: step.sentTo })}{' '}
                        {t('request.verify.expiresIn', { minutes: step.minutes })}
                      </p>
                      <form className="hh-verify__form" onSubmit={(e) => void submit(e)} noValidate>
                        <Field
                          label={t('request.verify.code')}
                          name="account-code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={10}
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          {...(codeError ? { error: noticeText(codeError) } : {})}
                        />
                        <Button type="submit" pending={busy === 'enroll'}>
                          {t('account.enroll.submit')}
                        </Button>
                      </form>
                    </>
                  ) : null}
                  <ul className="hh-access__channels">
                    {channels.map((c) => (
                      <li key={c.channel}>
                        <span>{c.destination}</span>{' '}
                        <Button
                          variant={step.kind === 'code' ? 'secondary' : 'primary'}
                          pending={busy === `send-${c.channel}`}
                          onClick={() => void send(c.channel)}
                        >
                          {step.kind === 'code' && step.channel === c.channel
                            ? t('request.verify.resend')
                            : t(SEND_LABEL[c.channel])}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {onDecline ? (
                <div className="hh-request__actions">
                  <Button variant="quiet" pending={declining} onClick={onDecline}>
                    {t('request.account.decline')}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
      <p role="status" className="hh-verify__notice">
        {notice ? noticeText(notice) : ''}
      </p>
    </section>
  )
}
