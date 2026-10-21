// /access: the secure project link's landing (TSK-0034; HH-ID-05, HH-ID-08, HH-ID-04, HH-INT-21, OWN-DEC-96,
// OWN-DEC-97, RULE-LANGUAGES). A React island; English only.
// - Before anything is shown the visitor presses Open; the page then offers to send a one-time code to the link's own
//   contact (masked) and opens the project only after the code is entered. Nothing private appears before that.
// - Without a link (or after a reload once it was used) the page shows the project this browser's session opens, if
//   any; otherwise it says how to open a project. A link that opens nothing gets the same neutral page whatever the
//   reason, with no project information.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { minutesLeft, noticeText, type Channel, type Fetch, type Notice } from '../request/verification.js'
import {
  accessApi,
  forgetToken,
  sentText,
  stateLabel,
  tabStorage,
  takeToken,
  type AccessChannel,
  type ProjectGlance,
} from './access.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)
const browserFetch: Fetch = (input, init) => fetch(input, init)

const SEND_LABEL: Record<Channel, CustomerKey> = {
  email: 'request.verify.send.email',
  phone: 'request.verify.send.phone',
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'intro'; token: string }
  | { kind: 'choose'; token: string; channels: AccessChannel[] }
  | { kind: 'code'; token: string; channels: AccessChannel[]; channel: Channel; sentTo: string; minutes: number }
  | { kind: 'project'; glance: ProjectGlance }
  | { kind: 'invalid' }
  | { kind: 'none' }

function Project({ glance }: { glance: ProjectGlance }) {
  const label = stateLabel(glance.requestState)
  return (
    <section className="hh-receipt" aria-labelledby="hh-access-project">
      <h2 id="hh-access-project" className="hh-h2" tabIndex={-1}>
        {t('access.project.title')}
      </h2>
      <p className="hh-lead">{t('request.receipt.reference', { reference: glance.reference })}</p>
      {label ? <p>{label}</p> : null}
      <p>{sentText(glance.submittedAt)}</p>
      <section className="hh-receipt__section" aria-labelledby="hh-access-services">
        <h3 id="hh-access-services" className="hh-h3">
          {t('request.step.services')}
        </h3>
        <ul>
          {glance.services.map((s) => (
            <li key={s}>{s}</li>
          ))}
          {glance.notSure ? <li>{t('request.services.notSure')}</li> : null}
        </ul>
      </section>
    </section>
  )
}

function Neutral({ title, text }: { title: CustomerKey; text: CustomerKey }) {
  return (
    <section className="hh-receipt" aria-labelledby="hh-access-neutral">
      <h2 id="hh-access-neutral" className="hh-h2" tabIndex={-1}>
        {t(title)}
      </h2>
      <p>{t(text)}</p>
    </section>
  )
}

export default function AccessLanding({ fetchImpl = browserFetch }: { fetchImpl?: Fetch }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [notice, setNotice] = useState<Notice | null>(null)
  const [codeError, setCodeError] = useState<Notice | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const area = useRef<HTMLDivElement>(null)

  const showProject = async (reference: string) => {
    const r = await accessApi.project(fetchImpl, reference)
    setPhase(r.ok ? { kind: 'project', glance: r.data } : { kind: 'none' })
  }

  useEffect(() => {
    const token = takeToken(window.location, tabStorage(), window.history)
    if (token) return setPhase({ kind: 'intro', token })
    void accessApi.session(fetchImpl).then(async (r) => {
      const [reference] = r.ok ? r.data : []
      if (reference) await showProject(reference)
      else setPhase({ kind: 'none' })
    })
    // Once per page load.
  }, [])

  // Each new step takes the focus, so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (phase.kind === 'loading') return
    area.current?.querySelector<HTMLElement>(phase.kind === 'code' ? 'input' : 'h2')?.focus()
  }, [phase.kind])

  const invalid = () => {
    forgetToken(tabStorage())
    setPhase({ kind: 'invalid' })
  }

  const open = async (token: string) => {
    setBusy('open')
    setNotice(null)
    const r = await accessApi.open(fetchImpl, token)
    setBusy(null)
    if (r.ok) return setPhase({ kind: 'choose', token, channels: r.data })
    if (r.status === 404) return invalid()
    setNotice(r.notice)
  }

  const send = async (token: string, channels: AccessChannel[], channel: Channel) => {
    setBusy(`send-${channel}`)
    setNotice(null)
    setCodeError(null)
    const r = await accessApi.send(fetchImpl, token, channel)
    setBusy(null)
    if (!r.ok) {
      if (r.status === 404) return invalid()
      return setNotice(r.notice)
    }
    setCode('')
    setPhase({
      kind: 'code',
      token,
      channels,
      channel,
      sentTo: r.data.sentTo,
      minutes: minutesLeft(r.data.expiresAt),
    })
  }

  const exchange = async (event: FormEvent) => {
    event.preventDefault()
    if (phase.kind !== 'code' || busy) return
    if (!code.trim()) return setCodeError({ key: 'request.verify.error.invalidCode' })
    setBusy('exchange')
    setNotice(null)
    setCodeError(null)
    const r = await accessApi.exchange(fetchImpl, phase.token, phase.channel, code)
    setBusy(null)
    if (!r.ok) {
      if (r.status === 404) return invalid()
      return setCodeError(r.notice)
    }
    forgetToken(tabStorage())
    setCode('')
    await showProject(r.data.reference)
  }

  let body
  switch (phase.kind) {
    case 'loading':
      body = <StateView kind="loading" title={t('access.loading')} />
      break
    case 'intro':
      body = (
        <section className="hh-receipt" aria-labelledby="hh-access-intro">
          <h2 id="hh-access-intro" className="hh-h2" tabIndex={-1}>
            {t('access.open.title')}
          </h2>
          <p>{t('access.open.text')}</p>
          <div className="hh-request__actions">
            <Button pending={busy === 'open'} onClick={() => void open(phase.token)}>
              {t('access.open.action')}
            </Button>
          </div>
        </section>
      )
      break
    case 'choose':
    case 'code': {
      const { token, channels } = phase
      body = (
        <section className="hh-receipt hh-verify" aria-labelledby="hh-access-verify">
          <h2 id="hh-access-verify" className="hh-h2" tabIndex={-1}>
            {t('access.verify.title')}
          </h2>
          <p>{t('access.verify.text')}</p>
          {phase.kind === 'code' ? (
            <>
              <p>
                {t('request.verify.sentTo', { destination: phase.sentTo })}{' '}
                {t('request.verify.expiresIn', { minutes: phase.minutes })}
              </p>
              <form className="hh-verify__form" onSubmit={(e) => void exchange(e)} noValidate>
                <Field
                  label={t('request.verify.code')}
                  name="access-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  {...(codeError ? { error: noticeText(codeError) } : {})}
                />
                <Button type="submit" pending={busy === 'exchange'}>
                  {t('access.verify.submit')}
                </Button>
              </form>
            </>
          ) : null}
          <ul className="hh-access__channels">
            {channels.map((c) => (
              <li key={c.channel}>
                <span>{c.destination}</span>{' '}
                <Button
                  variant={phase.kind === 'code' ? 'secondary' : 'primary'}
                  pending={busy === `send-${c.channel}`}
                  onClick={() => void send(token, channels, c.channel)}
                >
                  {phase.kind === 'code' && phase.channel === c.channel
                    ? t('request.verify.resend')
                    : t(SEND_LABEL[c.channel])}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )
      break
    }
    case 'project':
      body = <Project glance={phase.glance} />
      break
    case 'invalid':
      body = <Neutral title="access.invalid.title" text="access.invalid.text" />
      break
    case 'none':
      body = <Neutral title="access.none.title" text="access.none.text" />
      break
  }

  return (
    <div ref={area} className="hh-access">
      {body}
      <p role="status" className="hh-verify__notice">
        {notice ? noticeText(notice) : ''}
      </p>
      <a className="hh-button hh-button--secondary" href="/">
        {t('request.home')}
      </a>
    </div>
  )
}
