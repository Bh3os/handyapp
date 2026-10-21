// Tests of the content lint (TSK-0023; HH-BASE-04, HH-CUS-04, HH-CUS-05), run by node --test. Every sentence checked
// here is synthetic test copy, never site text.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, test } from 'node:test'
import { collectTexts, htmlText, lintTexts, stripComments } from './content-lint.mjs'

const lint = (text) => lintTexts([{ where: 'synthetic', text }]).map((p) => p.match.toLowerCase())

describe('content-lint.mjs (TSK-0023, HH-BASE-04)', () => {
  test('[HH-BASE-04] flags availability claims beyond the configured visit hours', () => {
    for (const text of [
      'Same-day service across the metro.',
      'Emergency repairs on request.',
      'Our crew is on call.',
      'Appointments available today.',
      'Walk-ins welcome.',
      'Open 24/7.',
    ])
      assert.ok(lint(text).length > 0, text)
  })

  test('[HH-BASE-04] flags response-time claims beyond the owner wording', () => {
    for (const text of [
      'We reply within 15 minutes.',
      'Expect a fast response.',
      'We call back in under an hour.',
      'We get back to you immediately.',
    ])
      assert.ok(lint(text).length > 0, text)
  })

  test('[HH-BASE-04] flags review, rating and credential claims', () => {
    for (const text of [
      'Read our customer reviews.',
      'Top-rated in Louisville.',
      'Trusted by local homeowners.',
      'Fully licensed and insured.',
      'BBB accredited and background-checked.',
      'Five-star testimonials.',
    ])
      assert.ok(lint(text).length > 0, text)
  })

  test('[HH-BASE-04] flags price claims', () => {
    for (const text of [
      'Drywall patches from $99.',
      'Painting starting at a low rate.',
      'Only 50 dollars per hour.',
      'Flat-rate cleaning.',
      'Get 10% off today.',
      'Affordable, cheap and with a discount.',
      'Free haul-away with every job.',
    ])
      assert.ok(lint(text).length > 0, text)
  })

  test('[HH-BASE-04] approved wording and ordinary sentences pass', () => {
    for (const text of [
      'Free estimates—online or at your property.',
      'Request a Free Estimate',
      'Visits every day, 8 AM–10 PM, by appointment.',
      'Prepared team: Tools, materials, and instructions planned for your job.',
      'Quality review, walkthrough when available, and documented follow-up.',
      'We review your request and confirm the approach.',
      'You may be within our service area.',
      'Need help today?',
      'Any time',
      'HandyHub serves 11 counties in the Louisville metro area in Kentucky and Southern Indiana.',
    ])
      assert.deepEqual(lint(text), [], text)
  })

  test('[HH-CUS-05] reads the visible text, text attributes and structured data of a built page, never code', () => {
    const html = [
      '<html><head><meta name="description" content="Synthetic description">',
      '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Synthetic &amp; Co"}</script>',
      '<script type="module">const best = "expert"</script><style>.top-rated{}</style></head>',
      '<body><h1>Synthetic &amp; page</h1><img alt="Synthetic photo"><!-- a premium comment --></body></html>',
    ].join('')
    const texts = htmlText(html)
    assert.ok(texts.includes('Synthetic description'))
    assert.ok(texts.includes('LocalBusiness'))
    assert.ok(texts.includes('Synthetic &amp; Co'))
    assert.ok(texts.includes('Synthetic photo'))
    assert.ok(texts.some((t) => t.includes('Synthetic & page')))
    assert.ok(!texts.some((t) => /expert|top-rated|premium/.test(t)))
  })

  test('[HH-BASE-04] comments are removed from source; URLs in strings are kept', () => {
    const code = "// the best wording\nconst a = 'https://schema.org' /* expert */\n"
    assert.equal(stripComments(code).includes('best'), false)
    assert.equal(stripComments(code).includes('expert'), false)
    assert.ok(stripComments(code).includes('https://schema.org'))
  })

  test('[HH-BASE-04] a built page with an unapproved claim fails', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'content-lint-'))
    after(() => rmSync(dir, { recursive: true, force: true }))
    mkdirSync(path.join(dir, 'dist'))
    writeFileSync(
      path.join(dir, 'dist', 'index.html'),
      '<html><body><p>Same-day service, 5-star rated.</p></body></html>',
    )
    const entries = collectTexts({ dist: [path.join(dir, 'dist')] })
    const problems = lintTexts(entries).filter(
      (p) => p.where.endsWith('index.html') && p.where.includes('content-lint-'),
    )
    assert.ok(problems.length >= 2)
    assert.throws(() => collectTexts({ dist: [path.join(dir, 'missing')] }), /no such directory/)
  })

  test('[HH-BASE-04][HH-CUS-04] the repository passes: catalog, service names, site and portal source', () => {
    const entries = collectTexts()
    assert.ok(entries.some((e) => e.where.startsWith('customer.en.json areas.intro')))
    assert.ok(entries.some((e) => e.where.startsWith('services.json SVC-DW-01')))
    assert.ok(entries.some((e) => e.where.endsWith(path.join('pages', 'areas.astro'))))
    assert.deepEqual(lintTexts(entries), [])
  })
})
