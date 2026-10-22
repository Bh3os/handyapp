// The ZIP coverage checker island (TSK-0022; HH-CUS-03, OWN-DEC-88, T07): one of four outcomes with the owner's exact
// message, and "Continue with Request" for every outcome and for a failed lookup. An invalid format shows a correction
// and no outcome. Coverage is area eligibility only: nothing here offers an appointment, a date or a price.
import { customerTranslator } from '@handyhub/i18n'
import { Button, Field } from '@handyhub/ui'
import { useState, type FormEvent } from 'react'
import { checkZip, rememberZip, type CoverageCheck } from './coverage.js'

export default function CoverageChecker({ requestPath = '/request' }: { requestPath?: string }) {
  const { t } = customerTranslator()
  const [zip, setZip] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CoverageCheck | null>(null)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setChecking(true)
    const r = await checkZip(zip)
    setResult(r)
    setChecking(false)
    if (r.kind !== 'invalid') rememberZip(r.zip)
  }

  const answer = result?.kind === 'outcome' ? result.message : result?.kind === 'failed' ? t('coverage.failed') : null

  return (
    <section className="hh-coverage" aria-labelledby="hh-coverage-title">
      <h2 id="hh-coverage-title" className="hh-h2">
        {t('coverage.title')}
      </h2>
      <form className="hh-coverage__form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field
          label={t('coverage.zip')}
          name="zip"
          value={zip}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          onChange={(e) => {
            setZip(e.currentTarget.value)
            if (result?.kind === 'invalid') setResult(null)
          }}
          {...(result?.kind === 'invalid' ? { error: t('coverage.invalid') } : {})}
        />
        <Button type="submit" variant="secondary" pending={checking}>
          {t('coverage.check')}
        </Button>
      </form>
      <div role="status" aria-live="polite" className="hh-coverage__result">
        {checking ? <p className="hh-muted">{t('coverage.checking')}</p> : null}
        {!checking && answer ? (
          <>
            <p className="hh-coverage__message" data-outcome={result?.kind === 'outcome' ? result.outcome : 'failed'}>
              {answer}
            </p>
            {result?.kind === 'outcome' && result.note ? <p className="hh-coverage__note">{result.note}</p> : null}
            <a className="hh-button" href={requestPath}>
              {t('coverage.continue')}
            </a>
          </>
        ) : null}
      </div>
    </section>
  )
}
