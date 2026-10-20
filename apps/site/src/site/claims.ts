// Claims register and copy lint for customer-facing text (TSK-0020; HH-CUS-06, HH-CUS-07, HH-BASE-04, OWN-DEC-54,
// OWN-DEC-86, OWN-DEC-89, RULE-NO-INVENTED-FACTS).
//
// - CLAIMS lists every owner-approved claim the public site makes, with the catalog key that holds it, the exact
//   sentence and its source. A test checks that each catalog value is exactly the registered sentence.
// - copyProblems() blocks the claim words of OWN-DEC-54 (premium, luxury, best, expert, team, insured, licensed,
//   guarantee, years of experience and similar), 24/7 wording (OWN-DEC-02) and any surcharge or convenience fee
//   (FACT-NO-SURCHARGE). Registered claims are allowed: "Prepared team" is approved wording although "team" is a
//   blocked word. "Square" is a payment name (OWN-DEC-89) and is not blocked.

export type Claim = {
  /** The customer catalog key that holds the sentence. */
  readonly key: string
  /** The exact approved sentence. */
  readonly text: string
  /** Who approved it, and when. */
  readonly source: string
  /** The decision node that records it. */
  readonly decision: string
}

const OWNER_2026_10_12 = 'owner, 2026-10-12'

export const CLAIMS: readonly Claim[] = [
  // Homepage trust facts (OWN-DEC-86; FACT-VISIT-FEE, OWN-DEC-32, FACT-HOURS).
  { key: 'home.trust.estimates', text: 'Free estimates—online or at your property.' },
  { key: 'home.trust.pricing', text: 'Every project individually priced to match its scope.' },
  { key: 'home.trust.visits', text: 'Visits every day, 8 AM–10 PM, by appointment.' },
  // The same free-estimate fact beside the estimate choice of the request form (TSK-0028, HH-INT-03, FACT-VISIT-FEE),
  // shown only while estimate.visit_fee is configured free.
  { key: 'request.estimate.free', text: 'Free estimates—online or at your property.' },
  // Why HandyHub (OWN-DEC-86).
  { key: 'home.why.subtitle', text: 'Professional care, from estimate to completion.' },
  { key: 'home.why.clearPricing.label', text: 'Clear pricing:' },
  { key: 'home.why.clearPricing.text', text: 'Written scope and price for your approval.' },
  { key: 'home.why.respectTime.label', text: 'Respect for your time:' },
  { key: 'home.why.respectTime.text', text: 'Confirmed date, arrival window, and updates.' },
  { key: 'home.why.preparedTeam.label', text: 'Prepared team:' },
  { key: 'home.why.preparedTeam.text', text: 'Tools, materials, and instructions planned for your job.' },
  { key: 'home.why.approval.label', text: 'Your approval matters:' },
  { key: 'home.why.approval.text', text: 'No added work or price changes without your agreement.' },
  { key: 'home.why.completion.label', text: 'Careful completion:' },
  { key: 'home.why.completion.text', text: 'Quality review, walkthrough when available, and documented follow-up.' },
  { key: 'home.why.access.label', text: 'Easy project access:' },
  { key: 'home.why.access.text', text: 'Estimates, updates, photos, and invoices through one secure link.' },
]
  .map((c) => ({ ...c, source: OWNER_2026_10_12, decision: 'OWN-DEC-86' }))
  // The card wording names Square, with no surcharge (OWN-DEC-89, HH-CUS-07).
  .concat([
    {
      key: 'payment.method.card',
      text: 'Credit or debit cards (Square)',
      source: OWNER_2026_10_12,
      decision: 'OWN-DEC-89',
    },
  ])

/** Claim words and phrases that stay off customer text unless the claim is registered above. */
export const BLOCKED: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  {
    pattern: /\b(premium|luxury|best|expert\w*|team|top-rated|award\w*)\b/i,
    reason: 'unapproved quality claim (OWN-DEC-54)',
  },
  {
    pattern: /\b(insured|insurance|licen[sc]e[ds]?|bonded|certified|certification)\b/i,
    reason: 'unapproved credential (OWN-DEC-54, HH-BASE-04)',
  },
  { pattern: /\b(guarantee\w*|warrant\w*)\b/i, reason: 'unapproved guarantee (OWN-DEC-54, OWN-DEC-35)' },
  { pattern: /\byears? of experience\b/i, reason: 'unapproved experience claim (OWN-DEC-54)' },
  { pattern: /24\s*\/\s*7|24 hours a day|around the clock/i, reason: '24/7 promise (OWN-DEC-02, FACT-HOURS)' },
  { pattern: /\bsurcharge|convenience fee|card fee|processing fee/i, reason: 'card surcharge (FACT-NO-SURCHARGE)' },
  { pattern: /\b(same-day|rush) (charge|fee)\b/i, reason: 'same-day charge (OWN-DEC-140)' },
  { pattern: /\b(testimonials?|five-star|5-star|\d stars?)\b/i, reason: 'unverified reviews (OWN-DEC-11)' },
]

export type CopyProblem = { readonly text: string; readonly match: string; readonly reason: string }

/** Problems in `text` after removing every registered claim (the allow-list). */
export function copyProblems(text: string, claims: readonly Claim[] = CLAIMS): CopyProblem[] {
  let rest = text
  for (const claim of claims) rest = rest.split(claim.text).join(' ')
  const problems: CopyProblem[] = []
  for (const rule of BLOCKED) {
    const m = rule.pattern.exec(rest)
    if (m)
      problems.push({ text: text.length > 160 ? `${text.slice(0, 157)}...` : text, match: m[0], reason: rule.reason })
  }
  return problems
}
