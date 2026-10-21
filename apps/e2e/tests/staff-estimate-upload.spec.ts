// Upload an Estimate and the customer PDF in a real browser (TSK-0054; HH-EST-11, T31, OWN-DEC-102). A synthetic request
// is submitted through the public API and moved to "ready for estimate" by the Owner (TSK-0042); the Owner, who may
// draft estimates like an Estimator (the Estimator role is covered route by route in the integration tests), uploads a
// PDF estimate, enters the amounts it states, confirms that they agree and opens the customer PDF; a Word estimate
// needs the PDF of the same document. Accounts, requests, documents and amounts are synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'upload', 'passphrase', String(n)].join(' ')

function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return new URL(out.split('\n')[0] as string).pathname
}
/** The first Owner's invite, or a reset link when another spec already created the Owner. */
function ownerLink(): string {
  try {
    return staffAccess('create-owner', OWNER, 'E2E Owner')
  } catch {
    return staffAccess('password-link', OWNER)
  }
}
async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}
async function setPasswordAndSignIn(page: Page, link: string, email: string, password: string) {
  await page.goto(link)
  await page.getByLabel('New password').fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await signIn(page, email, password)
}
/** Signs in with the password this spec set: one password set per spec run (the set-password limit is shared). */
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
}

/** A one-page synthetic PDF estimate; the amount in its text is never read by the server. */
function pdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  return Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n' +
      `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n` +
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n' +
      'xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n',
    'latin1',
  )
}

/** A minimal synthetic Word (.docx) document: a ZIP with the parts Word needs. */
function docx(text: string): Buffer {
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const parts: [string, string][] = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ' +
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="word/document.xml"/></Relationships>`,
    ],
    [
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ],
  ]
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [n, body] of parts) {
    const raw = Buffer.from(body, 'utf8')
    const data = deflateRawSync(raw)
    const name = Buffer.from(n, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc32(raw), 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc32(raw), 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, data)
    centrals.push(central, name)
    offset += 30 + name.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(parts.length, 8)
  end.writeUInt16LE(parts.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.28' } })

async function submitRequest(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `e2e-estimate-upload-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic e2e uploaded estimate request.',
      property: { street: '540 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'E2E Upload Customer',
        email: `e2e-estimate-upload-${Date.now()}@example.test`,
        phone: '(502) 555-0145',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { reference: string }).reference
}

const CHECKS = [
  'coverage',
  'service_fit',
  'essential_facts',
  'urgency',
  'site_visit_need',
  'staff_equipment',
  'risk_flags',
]

test.describe('Upload an Estimate and the customer PDF (TSK-0054)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  let reference = ''
  let requestId = ''
  test('[HH-LEAD-02] the Owner moves a request to "ready for estimate"', async ({ page }) => {
    reference = await submitRequest(page.request)
    await setPasswordAndSignIn(page, ownerLink(), OWNER, pw(1))
    const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
      .csrfToken
    const list = (await (await page.request.get('/api/v1/staff/requests?state=received')).json()) as {
      items: { id: string; reference: string }[]
    }
    requestId = list.items.find((i) => i.reference === reference)?.id as string
    const write = (path: string, method: 'PUT' | 'POST', data: unknown, version: number) =>
      page.request.fetch(`/api/v1/staff/requests/${requestId}${path}`, {
        method,
        data,
        headers: {
          'x-csrf-token': csrf,
          'idempotency-key': `e2e-upload-${path.replace(/\W/g, '')}-${Date.now()}`,
          'if-match': `"${version}"`,
        },
      })
    const checks = Object.fromEntries(CHECKS.map((c) => [c, { outcome: 'ok' }]))
    expect((await write('/qualification', 'PUT', { checks }, 0)).status()).toBe(200)
    const detail = (await (await page.request.get(`/api/v1/staff/requests/${requestId}`)).json()) as {
      version: number
    }
    const moved = await write(
      '/actions/online-estimate',
      'POST',
      { workPackages: ['SVC-DW-01', 'SVC-PT-01'] },
      detail.version,
    )
    expect(moved.status()).toBe(200)
  })

  test('[HH-EST-11][T31] the Owner uploads a PDF estimate, enters its amounts and confirms that they agree', async ({
    page,
  }) => {
    await signIn(page, OWNER, pw(1))
    await page.goto(`/staff/requests/${requestId}`)
    await expect(page.getByRole('heading', { level: 1, name: `Request ${reference}` })).toBeVisible()
    await page.getByRole('button', { name: 'Upload an Estimate' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Estimate ${reference}-E1` })).toBeVisible()
    await expect(page.getByText('Uploaded document with structured amounts')).toBeVisible()
    await expect(page.getByText('No document uploaded yet.')).toBeVisible()
    await axe(page)

    // The document: kept private and unchanged; the server's job worker checks it, then the customer copy is ready.
    const bytes = pdf('Synthetic estimate: total 1325.00 USD')
    await page.getByLabel('Estimate document (PDF or Word)').setInputFiles({
      name: 'synthetic-estimate.pdf',
      mimeType: 'application/pdf',
      buffer: bytes,
    })
    await page.getByRole('button', { name: 'Upload the document' }).click()
    const original = page.getByTestId('estimate-original')
    await expect(original.getByText('Ready', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('estimate-customer-pdf').getByText('Ready', { exact: true })).toBeVisible({
      timeout: 30_000,
    })
    const href = (await original.getByRole('link', { name: 'Open the uploaded document' }).getAttribute('href')) ?? ''
    const download = await page.request.get(href)
    expect(download.status()).toBe(200)
    expect(download.headers()['content-type']).toBe('application/pdf')
    expect(Buffer.from(await download.body()).equals(bytes)).toBe(true)

    // The amounts the document states, entered as a line: the server computes the total and the deposit.
    await page.getByRole('button', { name: 'Add a line to Patching & Repair' }).click()
    const line = page.getByRole('group', { name: 'Line 1' })
    await line.getByLabel('Description').fill('Synthetic: work as described in the estimate document')
    await line.getByLabel('Quantity', { exact: true }).fill('1')
    await line.getByLabel('Unit price (USD)').fill('1325.00')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByText('Draft saved. Amounts and totals were computed on the server.')).toBeVisible()
    await expect(
      page.getByText('Structured amounts: total $1,325.00; deposit $265.00; valid for 14 days from publishing.'),
    ).toBeVisible()
    const readiness = page.getByRole('region', { name: 'Ready to publish?' })
    await expect(readiness.getByText('Confirm that the document and the structured amounts agree.')).toBeVisible()

    // The agree-confirmation: publishing an uploaded estimate needs it.
    await page
      .getByRole('checkbox', {
        name: 'I checked that the document and the structured amounts agree (total, options, deposit and validity).',
      })
      .click()
    await expect(page.getByText(/^Confirmed by E2E Owner, /)).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /^I checked that the document/ })).toBeChecked()
    await expect(readiness.getByText('Confirm that the document and the structured amounts agree.')).toHaveCount(0)
    await expect(
      readiness.getByText('Estimate terms version is NOT CONFIGURED (HH-EST-13, OWN-DEC-127, OQ-ATTORNEY-TERMS)'),
    ).toBeVisible()
    await expect(page.getByText(/tax/i)).toHaveCount(0)
    await axe(page)

    // The English customer PDF, generated on the server.
    const preview = page.getByRole('link', { name: 'Preview the customer PDF' })
    const pdfResponse = await page.request.get((await preview.getAttribute('href')) ?? '')
    expect(pdfResponse.status()).toBe(200)
    expect(pdfResponse.headers()['content-type']).toBe('application/pdf')
    expect(
      Buffer.from(await pdfResponse.body())
        .subarray(0, 5)
        .toString('latin1'),
    ).toBe('%PDF-')
  })

  test('[OWN-DEC-102] a Word estimate shows "PDF required" until the PDF of the same document is uploaded', async ({
    page,
  }) => {
    await signIn(page, OWNER, pw(1))
    await page.goto(`/staff/requests/${requestId}`)
    await page.getByRole('button', { name: 'Upload an Estimate' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Estimate ${reference}-E2` })).toBeVisible()
    await page.getByLabel('Estimate document (PDF or Word)').setInputFiles({
      name: 'synthetic-estimate.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docx('Synthetic Word estimate'),
    })
    await page.getByRole('button', { name: 'Upload the document' }).click()
    await expect(page.getByTestId('estimate-original').getByText('Ready', { exact: true })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('PDF required', { exact: true })).toBeVisible()
    const readiness = page.getByRole('region', { name: 'Ready to publish?' })
    await expect(readiness.getByText('PDF required: upload the PDF of the Word document.')).toBeVisible()
    await axe(page)

    await page.getByLabel('PDF of the same document').setInputFiles({
      name: 'synthetic-estimate.pdf',
      mimeType: 'application/pdf',
      buffer: pdf('Synthetic PDF of the Word estimate'),
    })
    await page.getByRole('button', { name: 'Upload the PDF' }).click()
    await expect(page.getByTestId('estimate-customer-pdf').getByText('Ready', { exact: true })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('PDF required', { exact: true })).toHaveCount(0)
    await expect(readiness.getByText('PDF required: upload the PDF of the Word document.')).toHaveCount(0)
  })
})
