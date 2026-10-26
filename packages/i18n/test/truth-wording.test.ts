// Content truth checks of the customer catalog (TSK-0110; HH-BASE-05, HH-BASE-04, RULE-NO-INVENTED-FACTS). The copy
// lint (tools/content-lint.mjs) blocks invented availability, prices, reviews and credentials everywhere; these checks
// add the state truths: on the way from a request to its receipt nothing reads as a booking, and on the Payments tab
// nothing reads as paid because of a card-page return or a claim.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const customer = JSON.parse(
  readFileSync(new URL('../src/catalogs/customer.en.json', import.meta.url), 'utf8'),
) as Record<string, string>

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/)

describe('customer wording never claims a state the records do not hold (TSK-0110, HH-BASE-05)', () => {
  it('[HH-BASE-05][HH-INT-02][T09] request, coverage, access and account text never reads as a booking', () => {
    // A sentence about appointments, bookings or scheduling must defer them: a preference, a later confirmation by
    // staff, or the owner's "by appointment" (OWN-DEC-86). One that states a booking fails.
    const topic = /\b(appointments?|book\w*|schedul\w*|reserv\w*|arrival windows?|time slots?|slots?)\b/i
    const deferred =
      /\b(not|never|until|after|separately|preferred|preferences?|request\w*|only|once|when|if|staff)\b|\bby appointment\b/i
    const claims = Object.entries(customer)
      .filter(([key]) => /^(request|coverage|access|account)\./.test(key))
      .flatMap(([key, text]) =>
        sentences(text)
          .filter((s) => topic.test(s) && !deferred.test(s))
          .map((s) => `${key}: ${s}`),
      )
    expect(claims).toEqual([])
  })

  it('[HH-BASE-05][T01] the receipt says pricing and the appointment are confirmed separately', () => {
    expect(customer['request.receipt.separate']).toBe(
      'Your request is received. Pricing and your appointment will be confirmed separately.',
    )
  })

  it('[HH-BASE-05][HH-FIN-09][T60] the Payments tab says a card-page return marks nothing paid', () => {
    expect(customer['portal.payments.verifiedOnly']).toMatch(/only after HandyHub verifies and records it/)
    expect(customer['portal.payments.verifiedOnly']).toMatch(/does not mark anything paid/)
    // No customer text thanks the customer for a payment or calls one successful: a receipt follows a recorded payment.
    const thanked = Object.entries(customer).filter(([, text]) =>
      /\b(thank you for your payment|payment (was )?(successful|complete[d]?)|you('| ha)ve paid)\b/i.test(text),
    )
    expect(thanked).toEqual([])
  })
})
