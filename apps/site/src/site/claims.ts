// Claims register and copy lint for customer-facing text (TSK-0020; HH-CUS-06, HH-CUS-07, HH-BASE-04, OWN-DEC-54,
// OWN-DEC-86, OWN-DEC-89, RULE-NO-INVENTED-FACTS).
//
// - CLAIMS lists every owner-approved claim the public site makes, with the catalog key that holds it, the exact
//   sentence and its source. A test checks that each catalog value is exactly the registered sentence.
// - copyProblems() blocks the claim words of OWN-DEC-54 (premium, luxury, best, expert, team, insured, licensed,
//   guarantee, years of experience and similar), 24/7 wording (OWN-DEC-02) and any surcharge or convenience fee
//   (FACT-NO-SURCHARGE). Registered claims are allowed: "Prepared team" is approved wording although "team" is a
//   blocked word. "Square" is a payment name (OWN-DEC-89) and is not blocked.
// - TSK-0023 adds the availability, response-time, review, credential and price families (HH-BASE-04);
//   tools/content-lint.mjs runs this lint over every customer text in CI (the catalog, the registry's service names,
//   the site and portal source and, after a build, the built pages).

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
    // Every service page names the licensed-trade, structural and hazardous-material limits (TSK-0021; OWN-DEC-51,
    // FACT-SVC-EXCLUDED-SCOPE): "licensed" here describes work HandyHub does not do, never a credential. The facts are
    // the owner's; this wording stays PROPOSED pending attorney and safety review (OQ-ATTORNEY-TERMS, OQ-SAFETY-REVIEW).
    {
      key: 'service.limits.excluded',
      text: "We don't do licensed trade work (gas, line-voltage electrical, plumbing or HVAC), structural work, or asbestos, lead or mold work.",
      source: 'owner, 2026-10-06',
      decision: 'OWN-DEC-51',
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
  // The claim families TSK-0023's content lint (tools/content-lint.mjs) adds, per HH-BASE-04: availability beyond the
  // configured visit hours, response times beyond the owner's wording, reviews, credentials and prices.
  {
    pattern:
      /\b(same[- ]day|next[- ]day) (service|visits?|appointments?|repairs?|availability)\b|\bemergenc(y|ies)\b|\bon[- ]call\b|\bopen now\b|\b(available|availability|appointments?|openings?|slots?) (today|tonight|now|anytime|any time|immediately)\b|\balways (open|available)\b|\bbook (now|instantly)\b|\binstant (booking|appointments?)\b|\bwalk-?ins?\b/i,
    reason: 'unapproved availability claim (HH-BASE-04, FACT-HOURS)',
  },
  {
    pattern:
      /\b(within|in under|in less than|under)\s+(an?|one|two|three|a few|\d+)\s+(minutes?|mins?|hours?|hrs?|days?|business days?)\b|\b(fast|quick|rapid|prompt|immediate|instant) (response|reply|replies|callbacks?|turnaround)\b|\b(right away|immediately|asap)\b/i,
    reason: 'unapproved response-time claim (HH-BASE-04, OWN-DEC-35, FACT-RESPONSE-TARGET)',
  },
  {
    pattern:
      /\b(customer|client|google|yelp|online|verified|our|\d+\+?) reviews\b|\breviews? (from|on)\b|\b(top[- ])?rated\b|\bratings?\b|\bstar rating\b|\b(happy|satisfied) (customers|clients|homeowners)\b|\bcustomer satisfaction\b|\btrusted by\b/i,
    reason: 'unverified reviews (OWN-DEC-11, HH-BASE-04)',
  },
  {
    pattern: /\b(accredit\w*|bbb|background[- ]check\w*|vetted|osha|epa|rrp)\b/i,
    reason: 'unapproved credential (OWN-DEC-11, HH-BASE-04)',
  },
  {
    pattern:
      /\$\s?\d|\b\d+(\.\d+)?\s?(dollars|usd)\b|\bper (hour|hr|room|sq\.? ?ft|square (foot|feet))\b|\bhourly rates?\b|\bflat[- ](rate|fee)s?\b|\bstarting (at|from)\b|\b\d+\s?% off\b|\bdiscount\w*\b|\bcheap\w*\b|\b(lowest|low|best) prices?\b|\baffordabl\w*\b|\bno hidden (fees|costs)\b|\bfree (?!estimates?\b)[a-z]+/i,
    reason: 'unapproved price claim (HH-BASE-04, RULE-NO-INVENTED-FACTS)',
  },
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
