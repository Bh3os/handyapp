// The site shell, homepage wording, payment-method wording and copy lint (TSK-0020; HH-CUS-05, HH-CUS-06, HH-CUS-07,
// HH-BASE-04, OWN-DEC-86, OWN-DEC-89, RULE-NO-INVENTED-FACTS, RULE-LANGUAGES).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOGS } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { CLAIMS, copyProblems } from '../src/site/claims.js'
import { contactDetails, paymentItems, parseSiteFacts } from '../src/site/facts.js'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const page = read('pages/index.astro')
const layout = read('layouts/SiteLayout.astro')
const footer = read('components/SiteFooter.astro')
const customer: Record<string, string> = CATALOGS['customer.en']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(astro|tsx?|css)$/.test(name) ? [p] : []
  })
}

// The owner's wording, typed out from OWN-DEC-86 independently of the catalog (the approved wording fixture).
const TRUST = [
  'Free estimates—online or at your property.',
  'Every project individually priced to match its scope.',
  'Visits every day, 8 AM–10 PM, by appointment.',
]
const WHY = [
  'Clear pricing: Written scope and price for your approval.',
  'Respect for your time: Confirmed date, arrival window, and updates.',
  'Prepared team: Tools, materials, and instructions planned for your job.',
  'Your approval matters: No added work or price changes without your agreement.',
  'Careful completion: Quality review, walkthrough when available, and documented follow-up.',
  'Easy project access: Estimates, updates, photos, and invoices through one secure link.',
]

describe('site shell (TSK-0020, HH-CUS-05, RULE-LANGUAGES)', () => {
  it('[HH-CUS-05] the layout is an English page with skip link, header, main and footer; noindex only when asked', () => {
    expect(layout).toContain('<html lang="en">')
    // TSK-0023: public pages are indexable in production; the server keeps every other environment out of search.
    expect(layout).toContain('{noindex ? <meta name="robots" content="noindex, nofollow" /> : null}')
    expect(layout).toContain('const { title, noindex = false } = Astro.props')
    expect(layout).toMatch(/href="#main"/)
    expect(layout).toMatch(/<header[\s>]/)
    expect(layout).toMatch(/<main id="main"/)
    expect(layout).toContain('<SiteFooter />')
    expect(page).toContain('<SiteLayout')
  })

  it('[HH-CUS-05] contact details are never written into the site; the footer reads them from configuration', () => {
    for (const file of files(SRC)) expect(readFileSync(file, 'utf8'), file).not.toMatch(/tel:\+?\d|mailto:[a-z]/i)
    expect(footer).toContain("fetch('/api/v1/public/site'")
  })
})

describe('homepage wording (TSK-0020, HH-CUS-06, OWN-DEC-86)', () => {
  it('[HH-CUS-06] the catalog holds exactly the approved trust facts and Why HandyHub items', () => {
    expect([customer['home.trust.estimates'], customer['home.trust.pricing'], customer['home.trust.visits']]).toEqual(
      TRUST,
    )
    expect(customer['home.why.heading']).toBe('Why HandyHub')
    expect(customer['home.why.subtitle']).toBe('Professional care, from estimate to completion.')
    const items = ['clearPricing', 'respectTime', 'preparedTeam', 'approval', 'completion', 'access'].map(
      (k) => `${customer[`home.why.${k}.label`]} ${customer[`home.why.${k}.text`]}`,
    )
    expect(items).toEqual(WHY)
  })

  it('[HH-CUS-06] every registered claim is the catalog value, cites the owner and its decision, and is on the page', () => {
    // The homepage and payment wording (2026-10-12); the service-page limits of OWN-DEC-51 (2026-10-06, TSK-0021); the
    // warranty sentences of the website terms (OWN-DEC-135, 2026-10-20, TSK-0024) and its cancellation rule (OWN-DEC-134).
    const source: Record<string, string> = {
      'OWN-DEC-86': 'owner, 2026-10-12',
      'OWN-DEC-89': 'owner, 2026-10-12',
      'OWN-DEC-51': 'owner, 2026-10-06',
      'OWN-DEC-135': 'owner, 2026-10-20',
      'OWN-DEC-134': 'owner, 2026-10-20',
    }
    for (const claim of CLAIMS) {
      expect(customer[claim.key], claim.key).toBe(claim.text)
      expect(claim.source, claim.key).toBe(source[claim.decision])
      if (claim.key.startsWith('home.')) expect(page, claim.key).toContain(`'${claim.key}'`)
    }
    expect(CLAIMS.filter((c) => c.decision === 'OWN-DEC-86' && c.key.startsWith('home.'))).toHaveLength(3 + 1 + 12)
    // TSK-0028: the free-estimate fact again, beside the request form's estimate choice (HH-INT-03).
    expect(CLAIMS.find((c) => c.key === 'request.estimate.free')?.text).toBe(customer['home.trust.estimates'])
  })

  it('[HH-CUS-06] the request action uses the approved wording and opens the request page', () => {
    expect(customer['site.cta.requestFree']).toBe('Request a Free Estimate')
    expect(customer['site.cta.request']).toBe('Request an Estimate')
    expect(page).toContain('href="/request"')
    expect(layout).toContain('href="/request"')
  })
})

describe('payment-method wording (TSK-0020, HH-CUS-07, OWN-DEC-89, FACT-NO-SURCHARGE)', () => {
  it('[HH-CUS-07] cards are named as taken with Square; the other methods by their names', () => {
    expect(customer['payment.method.card']).toBe('Credit or debit cards (Square)')
    expect(['cash', 'check', 'zelle', 'cashApp', 'chime'].map((k) => customer[`payment.method.${k}`])).toEqual([
      'Cash',
      'Check',
      'Zelle',
      'Cash App',
      'Chime',
    ])
  })

  it('[HH-CUS-07] the configured codes list each method once, in order; both Square codes are the card line', () => {
    expect(
      paymentItems(['square_payment_link', 'square_tap_to_pay', 'cash', 'check', 'zelle', 'cash_app', 'chime']),
    ).toEqual(['card', 'cash', 'check', 'zelle', 'cashApp', 'chime'])
    expect(paymentItems(['chime', 'square_tap_to_pay', 'not_a_method'])).toEqual(['card', 'chime'])
    expect(paymentItems([])).toEqual([])
  })

  it('[HH-CUS-07] no customer text mentions a surcharge, convenience fee or same-day charge', () => {
    for (const [key, value] of Object.entries(customer))
      expect(value, key).not.toMatch(
        /surcharge|convenience fee|processing fee|same-day (charge|fee)|rush (charge|fee)/i,
      )
  })
})

describe('public contact (TSK-0020, HH-CUS-05, FACT-PUBLIC-CONTACT, OWN-DEC-47)', () => {
  it('[HH-CUS-05] NOT CONFIGURED contact is a placeholder, never a link', () => {
    expect(contactDetails({ configured: false, phone: null, email: null })).toEqual({
      phone: { kind: 'placeholder' },
      email: { kind: 'placeholder' },
    })
    expect(customer['site.footer.contactPlaceholder']).toMatch(/^Placeholder/)
  })

  it('[HH-CUS-05] configured values become links', () => {
    expect(contactDetails({ configured: true, phone: '(502) 555-0199', email: 'site@example.test' })).toEqual({
      phone: { kind: 'value', value: '(502) 555-0199', href: 'tel:5025550199' },
      email: { kind: 'value', value: 'site@example.test', href: 'mailto:site@example.test' },
    })
  })

  it('[HH-CUS-05] a response that is not the documented shape is unavailable, never guessed', () => {
    expect(parseSiteFacts(null)).toBeNull()
    expect(parseSiteFacts({ brand: 'HandyHub' })).toBeNull()
    expect(parseSiteFacts({ contact: { configured: false }, paymentMethods: 'cash' })).toBeNull()
    expect(
      parseSiteFacts({
        brand: 'HandyHub',
        contact: { configured: false, phone: null, email: null },
        paymentMethods: null,
      }),
    ).toEqual({ brand: 'HandyHub', contact: { configured: false, phone: null, email: null }, paymentMethods: null })
  })
})

describe('copy lint (TSK-0020, HH-BASE-04, OWN-DEC-54)', () => {
  it('[HH-BASE-04] blocks unapproved claim words; registered claims and the Square payment name are allowed', () => {
    expect(copyProblems('Our expert team is fully insured.').map((p) => p.match)).toEqual(['expert', 'insured'])
    expect(copyProblems('Open 24/7')).toHaveLength(1)
    expect(copyProblems('A 3% card surcharge applies.')).toHaveLength(1)
    expect(copyProblems('Prepared team: Tools, materials, and instructions planned for your job.')).toEqual([])
    expect(copyProblems('Credit or debit cards (Square)')).toEqual([])
  })

  it('[HH-BASE-04] every customer catalog value passes the copy lint', () => {
    const problems = Object.entries(customer).flatMap(([key, value]) =>
      copyProblems(value).map((p) => `${key}: ${p.match} (${p.reason})`),
    )
    expect(problems).toEqual([])
  })

  it('[HH-BASE-04] the site source states no price, and its code (comments aside) passes the copy lint', () => {
    for (const file of files(SRC)) {
      if (file.endsWith(join('site', 'claims.ts'))) continue
      // Comments explain the rules (and cite nodes such as FACT-NO-SURCHARGE); they never reach a customer.
      const text = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|\s)\/\/.*$/gm, ' ')
      expect(text, file).not.toMatch(/\$\s?\d/)
      expect(
        copyProblems(text).map((p) => p.match),
        file,
      ).toEqual([])
    }
  })
})
