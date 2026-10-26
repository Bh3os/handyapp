// /access: the secure project link's landing (TSK-0034; HH-ID-05, HH-ID-08, HH-ID-04, HH-INT-21, OWN-DEC-96,
// OWN-DEC-97, RULE-LANGUAGES). A React island; English only.
// - Before anything is shown the visitor presses Open; the page then offers to send a one-time code to the link's own
//   contact (masked) and opens the project only after the code is entered. Nothing private appears before that.
// - Without a link (or after a reload once it was used) the page shows the project this browser's session opens, if
//   any; otherwise it says how to open a project. A link that opens nothing gets the same neutral page whatever the
//   reason, with no project information.
// - Neutral recovery (TSK-0035, HH-ID-09, HH-ID-06): that page, and the page without a link, offer to ask for a new
//   link with the email or mobile phone on the request (and the reference when this tab holds no old link). The
//   answer is the same whether or not anything matches. A code that can no longer be used (expired, or too many
//   tries) gets its own neutral page that offers a new code; nothing about the project is shown on either.
// - TSK-0149 (OWN-DEC-198 F5, F6): after asking, every visitor also sees the same offer to ask HandyHub for help (the
//   secure alternative when the reissue limits are reached or staff revoked the link), whatever the answer was.
// - TSK-0036 (HH-ID-10, HH-INT-14 "registering later"): a project opened through its guest link offers the optional
//   Create an Account, with a code to the link's own verified contact; an account session shows no offer.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { minutesLeft, noticeText, type Channel, type Fetch, type Notice } from '../request/verification.js'
import { AccountEnrollment } from '../account/AccountEnrollment.js'
import { accountApi, type EnrollChannel } from '../account/account.js'
import { AccessHelp } from './AccessHelp.js'
import {
  accessApi,
  forgetToken,
  recoveryNotice,
  recoveryProblems,
  sentText,
  stateLabel,
  tabStorage,
  takeToken,
  type AccessChannel,
  type ProjectGlance,
  type RecoveryForm,
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
  | { kind: 'ended'; token: string; channels: AccessChannel[] }
  | { kind: 'project'; glance: ProjectGlance }
  | { kind: 'recover'; token: string }
  | { kind: 'none' }

/** The opened project at a glance (TSK-0034); TSK-0036: also on the account page, one heading level down. */
export function ProjectGlanceView({ glance, level = 2 }: { glance: ProjectGlance; level?: 2 | 3 }) {
  const label = stateLabel(glance.requestState)
  const Title = level === 2 ? 'h2' : 'h3'
  const Sub = level === 2 ? 'h3' : 'h4'
  return (
    <section className="hh-receipt" aria-labelledby="hh-access-project">
      <Title id="hh-access-project" className={level === 2 ? 'hh-h2' : 'hh-h3'} tabIndex={-1}>
        {t('access.project.title')}
      </Title>
      <p className="hh-lead">{t('request.receipt.reference', { reference: glance.reference })}</p>
      {label ? <p>{label}</p> : null}
      <p>{sentText(glance.submittedAt)}</p>
      <section className="hh-receipt__section" aria-labelledby="hh-access-services">
        <Sub id="hh-access-services" className="hh-h3">
          {t('request.step.services')}
        </Sub>
        <ul>
          {glance.services.map((s) => (
            <li key={s}>{s}</li>
          ))}
          {glance.notSure ? <li>{t('request.services.notSure')}</li> : null}
        </ul>
      </section>
      {/* TSK-0038: the project's workspace in the portal (status, next action, timeline). */}
      <p>
        <a className="hh-button" href={`/portal/p/${encodeURIComponent(glance.reference)}`}>
          {t('access.project.portal')}
        </a>
      </p>
    </section>
  )
}

/** The optional account offer for a guest-link session; nothing for an account session or without one. */
function LinkEnrollment({ fetchImpl }: { fetchImpl: Fetch }) {
  const [channels, setChannels] = useState<EnrollChannel[] | null>(null)
  useEffect(() => {
    let live = true
    void accountApi.linkChannels(fetchImpl).then((r) => {
      if (live && r.ok) setChannels(r.data)
    })
    return () => {
      live = false
    }
  }, [fetchImpl])
  return channels ? <AccountEnrollment from={{ kind: 'link' }} channels={channels} fetchImpl={fetchImpl} /> : null
}

function Neutral({ title, text, children }: { title: CustomerKey; text: CustomerKey; children?: ReactNode }) {
  return (
    <section className="hh-receipt" aria-labelledby="hh-access-neutral">
      <h2 id="hh-access-neutral" className="hh-h2" tabIndex={-1}>
        {t(title)}
      </h2>
      <p>{t(text)}</p>
      {children}
    </section>
  )
}

type RecoveryField = keyof RecoveryForm
const RECOVERY_ERROR: Record<RecoveryField, CustomerKey> = {
  contact: 'access.recover.error.contact',
  reference: 'access.recover.error.reference',
}

/**
 * Ask for a new link (TSK-0035, HH-ID-09). With the old link this tab holds, only the contact is asked for; without
 * one, the reference from the receipt too. Every accepted request shows the same words.
 */
function Recovery({ token, fetchImpl }: { token: string | null; fetchImpl: Fetch }) {
  const withReference = token === null
  const [form, setForm] = useState<RecoveryForm>({ contact: '', reference: '' })
  const [errors, setErrors] = useState<Partial<Record<RecoveryField, CustomerKey>>>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const area = useRef<HTMLElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  const showErrors = (fields: RecoveryField[]) => {
    setErrors(Object.fromEntries(fields.map((f) => [f, RECOVERY_ERROR[f]])))
    // The first field with a problem takes the focus.
    requestAnimationFrame(() => area.current?.querySelector<HTMLElement>(`[name="access-${fields[0]}"]`)?.focus())
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const problems = recoveryProblems(form, withReference)
    if (problems.length > 0) return showErrors(problems)
    setErrors({})
    setNotice(null)
    setBusy(true)
    const r = await accessApi.reissue(fetchImpl, { token, ...form })
    setBusy(false)
    if (r.ok) return setDone(true)
    if (r.field === 'invalid_contact') return showErrors(['contact'])
    if (r.field === 'required') return showErrors(['reference'])
    setNotice(recoveryNotice(r))
  }

  return (
    <section ref={area} className="hh-receipt__section" aria-labelledby="hh-access-recover">
      <h3 id="hh-access-recover" className="hh-h3">
        {t('access.recover.title')}
      </h3>
      {done ? (
        <>
          <p ref={doneRef} tabIndex={-1} role="status">
            {t('access.recover.done')}
          </p>
          <AccessHelp kind="project_link" fetchImpl={fetchImpl} level={4} />
        </>
      ) : (
        <>
          <p>{t('access.recover.text')}</p>
          <form className="hh-verify__form hh-access__recover" onSubmit={(e) => void submit(e)} noValidate>
            {withReference ? (
              <Field
                label={t('access.recover.reference')}
                hint={t('access.recover.referenceHint')}
                name="access-reference"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                {...(errors.reference ? { error: t(errors.reference) } : {})}
              />
            ) : null}
            <Field
              label={t('access.recover.contact')}
              name="access-contact"
              autoComplete="email"
              spellCheck={false}
              maxLength={320}
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              {...(errors.contact ? { error: t(errors.contact) } : {})}
            />
            <Button type="submit" pending={busy}>
              {t('access.recover.submit')}
            </Button>
          </form>
          <p role="status" className="hh-verify__notice">
            {notice ? noticeText(notice) : ''}
          </p>
        </>
      )}
    </section>
  )
}

function SendButtons({
  channels,
  busy,
  current,
  primary,
  onSend,
}: {
  channels: AccessChannel[]
  busy: string | null
  current: Channel | null
  primary: boolean
  onSend: (channel: Channel) => void
}) {
  return (
    <ul className="hh-access__channels">
      {channels.map((c) => (
        <li key={c.channel}>
          <span>{c.destination}</span>{' '}
          <Button
            variant={primary ? 'primary' : 'secondary'}
            pending={busy === `send-${c.channel}`}
            onClick={() => onSend(c.channel)}
          >
            {current === c.channel ? t('request.verify.resend') : t(SEND_LABEL[c.channel])}
          </Button>
        </li>
      ))}
    </ul>
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

  // The link opens nothing (any reason): it is forgotten, and kept in this page only to name it in a reissue request.
  const invalid = (token: string) => {
    forgetToken(tabStorage())
    setPhase({ kind: 'recover', token })
  }

  const open = async (token: string) => {
    setBusy('open')
    setNotice(null)
    const r = await accessApi.open(fetchImpl, token)
    setBusy(null)
    if (r.ok) return setPhase({ kind: 'choose', token, channels: r.data })
    if (r.status === 404) return invalid(token)
    setNotice(r.notice)
  }

  const send = async (token: string, channels: AccessChannel[], channel: Channel) => {
    setBusy(`send-${channel}`)
    setNotice(null)
    setCodeError(null)
    const r = await accessApi.send(fetchImpl, token, channel)
    setBusy(null)
    if (!r.ok) {
      if (r.status === 404) return invalid(token)
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
      if (r.status === 404) return invalid(phase.token)
      // The code can no longer be used (expired, or too many tries): a neutral page that offers a new one.
      if (r.field === 'code_ended') {
        setCode('')
        return setPhase({ kind: 'ended', token: phase.token, channels: phase.channels })
      }
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
          <SendButtons
            channels={channels}
            busy={busy}
            current={phase.kind === 'code' ? phase.channel : null}
            primary={phase.kind !== 'code'}
            onSend={(channel) => void send(token, channels, channel)}
          />
        </section>
      )
      break
    }
    case 'ended': {
      const { token, channels } = phase
      body = (
        <Neutral title="access.ended.title" text="access.ended.text">
          <SendButtons
            channels={channels}
            busy={busy}
            current={null}
            primary
            onSend={(channel) => void send(token, channels, channel)}
          />
        </Neutral>
      )
      break
    }
    case 'project':
      body = (
        <>
          <ProjectGlanceView glance={phase.glance} />
          <LinkEnrollment fetchImpl={fetchImpl} />
        </>
      )
      break
    case 'recover':
      body = (
        <Neutral title="access.invalid.title" text="access.invalid.text">
          <Recovery token={phase.token} fetchImpl={fetchImpl} />
        </Neutral>
      )
      break
    case 'none':
      body = (
        <Neutral title="access.none.title" text="access.none.text">
          <Recovery token={null} fetchImpl={fetchImpl} />
        </Neutral>
      )
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
