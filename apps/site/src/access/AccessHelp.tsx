// Ask HandyHub for help (TSK-0149; OWN-DEC-198 F4, F5, F6, HH-ID-09, HH-ID-03, RULE-LANGUAGES). A React component of
// the access and account pages; English only.
// - The secure alternative for a legitimate customer: after asking for a new link (whatever the answer, so at the
//   reissue limits too), and on the sign-in when texts cannot be used or a contact is lost. The visitor gives the email
//   or mobile phone they used and, when they have it, the request reference.
// - Every visitor sees the same words before and after, whether or not anything matches: HandyHub checks who they are
//   with the contact details on file and answers through them. Nothing here names a project, account or contact.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Field } from '@handyhub/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { noticeText, type Fetch, type Notice } from '../request/verification.js'
import { accessApi, helpNotice, type HelpForm, type HelpKind } from './access.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)
const browserFetch: Fetch = (input, init) => fetch(input, init)

const TEXT: Record<HelpKind, CustomerKey> = {
  sign_in: 'access.help.text.signIn',
  project_link: 'access.help.text.projectLink',
}

export function AccessHelp({
  kind,
  fetchImpl = browserFetch,
  level = 3,
}: {
  kind: HelpKind
  fetchImpl?: Fetch
  /** The heading level: 4 inside a page section, 3 below a page heading, 2 on its own. */
  level?: 2 | 3 | 4
}) {
  const Heading = level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4'
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<HelpForm>({ contact: '', reference: '' })
  const [contactError, setContactError] = useState<CustomerKey | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const area = useRef<HTMLElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (done) doneRef.current?.focus()
    else if (open) area.current?.querySelector<HTMLInputElement>('input[name="help-contact"]')?.focus()
  }, [open, done])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!form.contact.trim()) return setContactError('access.recover.error.contact')
    setContactError(null)
    setNotice(null)
    setBusy(true)
    const r = await accessApi.help(fetchImpl, kind, form)
    setBusy(false)
    if (r.ok) return setDone(true)
    if (r.field === 'invalid_contact') return setContactError('access.recover.error.contact')
    setNotice(helpNotice(r))
  }

  return (
    <section ref={area} className="hh-receipt__section" aria-labelledby={`hh-access-help-${kind}`}>
      <Heading id={`hh-access-help-${kind}`} className="hh-h3">
        {t('access.help.title')}
      </Heading>
      {done ? (
        <p ref={doneRef} tabIndex={-1} role="status">
          {t('access.help.done')}
        </p>
      ) : (
        <>
          <p>{t(TEXT[kind])}</p>
          {!open ? (
            <div className="hh-request__actions">
              <Button variant="secondary" onClick={() => setOpen(true)}>
                {t('access.help.start')}
              </Button>
            </div>
          ) : (
            <form className="hh-verify__form hh-access__recover" onSubmit={(e) => void submit(e)} noValidate>
              <Field
                label={t('access.help.contact')}
                name="help-contact"
                autoComplete="email"
                spellCheck={false}
                maxLength={320}
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                {...(contactError ? { error: t(contactError) } : {})}
              />
              <Field
                label={t('access.help.reference')}
                hint={t('access.recover.referenceHint')}
                name="help-reference"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
              <Button type="submit" pending={busy}>
                {t('access.help.submit')}
              </Button>
            </form>
          )}
          <p role="status" className="hh-verify__notice">
            {notice ? noticeText(notice) : ''}
          </p>
        </>
      )}
    </section>
  )
}
