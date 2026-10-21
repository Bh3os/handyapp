// /request/received/<ref> after a reload (TSK-0032; HH-INT-12, RULE-SERVER-AUTHZ). A React island: it shows the
// receipt this browser tab kept when the server confirmed the save (receipt.ts), and nothing else. Without that record
// (another browser, an old tab, a guessed or shared reference) it says the receipt is not available here: it never
// shows "Your request is in." on a guess, and it never asks the server about the reference, which grants nothing.
// The photos keep the counts the receipt recorded; their retry needs the photos this page no longer holds.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { StateView } from '@handyhub/ui'
import { useEffect, useRef, useState } from 'react'
import { Receipt } from './Receipt.js'
import { loadReceipt, referenceFromPath, type ReceiptRecord } from './receipt.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

function tabStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export default function ReceiptPage() {
  const [shown, setShown] = useState<ReceiptRecord | null | 'loading'>('loading')
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const reference = referenceFromPath(window.location.pathname)
    setShown(reference ? loadReceipt(tabStorage(), reference) : null)
  }, [])
  useEffect(() => {
    if (shown && shown !== 'loading') headingRef.current?.focus()
  }, [shown])

  if (shown === 'loading') return <StateView kind="loading" title={t('request.title')} />
  if (shown) return <Receipt record={shown} headingRef={headingRef} />
  return (
    <section className="hh-receipt" aria-labelledby="hh-receipt-unavailable">
      <h2 id="hh-receipt-unavailable" className="hh-h2">
        {t('request.receipt.unavailable.title')}
      </h2>
      <p>{t('request.receipt.unavailable.text')}</p>
      <a className="hh-button hh-button--secondary" href="/">
        {t('request.home')}
      </a>
    </section>
  )
}
