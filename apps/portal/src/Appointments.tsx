// The Appointments tab's offered windows and confirmed visits (TSK-0063; HH-LEAD-07, HH-SCH-11, HH-SCH-04, T37, T38,
// OWN-DEC-99, OWN-DEC-105, OWN-DEC-144, RULE-LANGUAGES).
// - An open offer lists its windows, each with "Choose this time", and how long they are held for the customer; the
//   customer can instead ask for other times with an optional note, without restarting the request. The server
//   rechecks the chosen window and confirms the visit in one step; when the window can no longer be kept, the page
//   says so and shows the offer as it is now, so another window or other times can be chosen.
// - TSK-0064 (HH-SCH-05, HH-SCH-06): when the server cannot confirm any time yet (the deposit is due, or another
//   confirmation precondition is unmet) the page says so, that nothing is booked, and the times stay as offered.
// - A confirmed visit shows its purpose (an Estimate visit approves no price, T37), the date and arrival window in the
//   property's zone, the property address and the preparation instructions HandyHub wrote.
// - English only, from the customer catalog; the wording no decision gives is PROPOSED (OQ-PORTAL-WORDING).
import type { CustomerKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useRef, useState, type FormEvent } from 'react'
import {
  idempotencyKey,
  portalApi,
  type Appointment,
  type AppointmentStatus,
  type Fetch,
  type OfferAnswerFailure,
  type VisitPurpose,
  type VisitWindow,
  type WindowOffer,
} from './api'
import { t, when } from './labels'

export const PURPOSE_LABEL: Record<VisitPurpose, CustomerKey> = {
  estimate_visit: 'portal.appointment.purpose.estimate_visit',
  work_visit: 'portal.appointment.purpose.work_visit',
}
const OFFER_TITLE: Record<VisitPurpose, CustomerKey> = {
  estimate_visit: 'portal.appointment.offer.title.estimate_visit',
  work_visit: 'portal.appointment.offer.title.work_visit',
}
export const STATUS_LABEL: Record<AppointmentStatus, CustomerKey> = {
  confirmed: 'portal.appointment.status.confirmed',
  en_route: 'portal.appointment.status.en_route',
  arrived: 'portal.appointment.status.arrived',
  completed: 'portal.appointment.status.completed',
}
const FAILURE: Record<OfferAnswerFailure, CustomerKey> = {
  unavailable_window: 'portal.appointment.offer.unavailable',
  closed: 'portal.appointment.offer.closed',
  deposit_due: 'portal.appointment.offer.depositDue',
  not_ready: 'portal.appointment.offer.notReady',
  fresh_verification: 'portal.estimate.failure.fresh_verification',
  not_applicable: 'portal.appointment.offer.closed',
  invalid: 'portal.appointment.offer.failed',
  rate_limited: 'portal.estimate.failure.rate_limited',
  failed: 'portal.appointment.offer.failed',
  expired: 'portal.estimate.failure.expired',
  unavailable: 'portal.appointment.offer.failed',
}

/** "Wednesday, November 4, 2026, arrival between 9:00 AM and 10:00 AM EST", in the property's own zone. */
export function windowText(w: VisitWindow): string {
  const date = new Intl.DateTimeFormat('en-US', { timeZone: w.timeZone, dateStyle: 'full' }).format(
    new Date(w.startsAt),
  )
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: w.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  return t('portal.appointment.window', {
    date,
    start: time.format(new Date(w.startsAt)),
    end: time.format(new Date(w.endsAt)),
  })
}

/** A confirmed visit: purpose, date and arrival window, address and preparation. */
export function AppointmentCard({ a }: { a: Appointment }) {
  const address = [a.address.street, a.address.unit, `${a.address.city}, ${a.address.state} ${a.address.zip}`]
    .filter(Boolean)
    .join(', ')
  return (
    <div className="portal-appointment" data-testid="appointment">
      <p>
        <strong>{t(PURPOSE_LABEL[a.purpose])}</strong>{' '}
        <StatusBadge tone="success">{t(STATUS_LABEL[a.status])}</StatusBadge>
      </p>
      <dl className="portal-appointment__facts">
        <div>
          <dt>{t('portal.appointment.when')}</dt>
          <dd data-testid="appointment-window">{windowText(a.window)}</dd>
        </div>
        <div>
          <dt>{t('portal.appointment.address')}</dt>
          <dd>{address}</dd>
        </div>
        <div>
          <dt>{t('portal.appointment.purpose')}</dt>
          <dd>{t(PURPOSE_LABEL[a.purpose])}</dd>
        </div>
        {a.preparationInstructions ? (
          <div>
            <dt>{t('portal.appointment.preparation')}</dt>
            <dd>{a.preparationInstructions}</dd>
          </div>
        ) : null}
      </dl>
      {a.purpose === 'estimate_visit' ? (
        <p className="hh-small hh-muted">{t('portal.appointment.estimateNote')}</p>
      ) : null}
    </div>
  )
}

function OfferCard({
  reference,
  offer,
  fetchImpl,
  onChanged,
}: {
  reference: string
  offer: WindowOffer
  fetchImpl: Fetch
  onChanged: () => void
}) {
  const [message, setMessage] = useState<CustomerKey | null>(null)
  const [pending, setPending] = useState<number | 'other' | null>(null)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  // One key per answer, kept for its retries.
  const key = useRef<{ answer: string; key: string } | null>(null)
  const keyFor = (answer: string) => {
    if (key.current?.answer !== answer) key.current = { answer, key: idempotencyKey() }
    return key.current.key
  }
  const done = (r: { ok: boolean; failure?: OfferAnswerFailure }) => {
    setPending(null)
    if (r.ok || r.failure !== 'failed') key.current = null
    if (r.ok) {
      setMessage(null)
      return onChanged()
    }
    setMessage(FAILURE[r.failure as OfferAnswerFailure])
    // The offer as it is now: another window, other times, or what happened to it.
    if (r.failure === 'unavailable_window' || r.failure === 'closed') onChanged()
  }
  async function choose(position: number) {
    setPending(position)
    done(await portalApi.selectWindow(fetchImpl, { reference, number: offer.number }, position, keyFor(`w${position}`)))
  }
  async function other(e: FormEvent) {
    e.preventDefault()
    setPending('other')
    done(await portalApi.requestOtherTimes(fetchImpl, { reference, number: offer.number }, note, keyFor('other')))
  }
  return (
    <section className="portal-offer" aria-labelledby={`offer-${offer.number}`} data-testid="window-offer">
      <h3 id={`offer-${offer.number}`} className="hh-h3">
        {t(OFFER_TITLE[offer.purpose])}
      </h3>
      {offer.status === 'open' ? (
        <>
          <p data-testid="offer-held">{t('portal.appointment.offer.held', { time: when(offer.expiresAt) })}</p>
          <ul className="portal-offer__windows">
            {offer.windows.map((w) => (
              <li key={w.position} className="portal-offer__window" data-testid="offer-window">
                <p>{windowText(w)}</p>
                <Button pending={pending === w.position} onClick={() => void choose(w.position)}>
                  {t('portal.appointment.offer.choose')}
                </Button>
              </li>
            ))}
          </ul>
          {asking ? (
            <form onSubmit={(e) => void other(e)} data-testid="offer-other-times">
              <Field
                label={t('portal.appointment.offer.other.note')}
                multiline
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="hh-button-row">
                <Button type="submit" variant="secondary" pending={pending === 'other'}>
                  {t('portal.appointment.offer.other.submit')}
                </Button>
              </div>
            </form>
          ) : (
            <div className="hh-button-row">
              <Button variant="secondary" onClick={() => setAsking(true)}>
                {t('portal.appointment.offer.other.open')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <StateView
          kind="empty"
          title={t(
            offer.status === 'expired' ? 'portal.appointment.offer.expired' : 'portal.appointment.offer.otherRequested',
          )}
        />
      )}
      {message ? (
        <p className="hh-field__error" role="alert" data-testid="offer-message">
          {t(message)}
        </p>
      ) : null}
    </section>
  )
}

/** The Appointments tab when it lists something: the offers, then the confirmed visits. */
export function AppointmentsList({
  reference,
  offers,
  appointments,
  fetchImpl,
  onChanged,
}: {
  reference: string
  offers: WindowOffer[]
  appointments: Appointment[]
  fetchImpl: Fetch
  onChanged: () => void
}) {
  return (
    <>
      {offers.map((o) => (
        <OfferCard key={o.number} reference={reference} offer={o} fetchImpl={fetchImpl} onChanged={onChanged} />
      ))}
      {appointments.length ? (
        <section aria-labelledby="portal-appointments">
          <h3 id="portal-appointments" className="hh-h3">
            {t('portal.appointment.confirmed.title')}
          </h3>
          {appointments.map((a) => (
            <AppointmentCard key={`${a.purpose}-${a.window.startsAt}`} a={a} />
          ))}
        </section>
      ) : null}
    </>
  )
}
