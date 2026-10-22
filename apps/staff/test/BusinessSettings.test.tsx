// Business settings and the legal documents in the staff app (TSK-0144; OWN-DEC-183, OWN-DEC-187, HH-FIN-04,
// HH-EST-13, HH-LANG-03). The API is a synthetic stand-in and the address a synthetic placeholder
// (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addressLines,
  LegalDocumentsView,
  MailingAddressSetting,
  type LegalDocumentEntry,
} from '../src/BusinessSettings'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const LINES = ['SYNTHETIC-TEST-ADDRESS line one', 'SYNTHETIC-TEST-ADDRESS line two']
const NOT_CONFIGURED = {
  state: 'NOT_CONFIGURED',
  version: 1,
  lines: null,
  sourceIds: ['FACT-BUSINESS-ADDRESS', 'OQ-MAILING-ADDRESS'],
}

describe('MailingAddressSetting (TSK-0144, HH-FIN-04, OWN-DEC-183)', () => {
  it('[FACT-BUSINESS-ADDRESS] NOT CONFIGURED until the Owner enters it with a reason and the version shown', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { mailingAddress: NOT_CONFIGURED }))
      .mockResolvedValueOnce(
        json(200, {
          state: 'CONFIGURED',
          version: 2,
          lines: LINES,
          sourceIds: ['FACT-BUSINESS-ADDRESS', 'OWN-DEC-183'],
        }),
      )
    const { t } = staffTranslator('en')
    render(<MailingAddressSetting t={t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('business-details')
    expect(within(section).getByText('NOT CONFIGURED')).toBeTruthy()
    expect(within(section).getByText(/leave the address line out until you enter it/)).toBeTruthy()
    expect(within(section).queryByRole('button', { name: 'Remove the mailing address' })).toBeNull()
    fireEvent.click(within(section).getByRole('button', { name: 'Save the mailing address' }))
    expect(within(section).getByText('Enter at least one line of the address.')).toBeTruthy()
    expect(within(section).getByText('Write the reason for the change.')).toBeTruthy()
    fireEvent.change(within(section).getByLabelText('Mailing address (one line per row, up to 4 lines)'), {
      target: { value: `  ${LINES[0]}\n\n${LINES[1]}  ` },
    })
    fireEvent.change(within(section).getByLabelText('Reason for the change'), { target: { value: 'Synthetic' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save the mailing address' }))
    await waitFor(() =>
      expect(within(section).getByText('The mailing address is saved. Documents print it from now on.')).toBeTruthy(),
    )
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/v1/staff/settings/business-details/mailing-address')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ lines: LINES, reason: 'Synthetic' })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
    expect(within(section).getByText('Mailing address in force (configuration version 2):')).toBeTruthy()
    expect(within(section).getByText(LINES[0] as string)).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Remove the mailing address' })).toBeTruthy()
  })

  it('too many lines are refused before sending; a fresh sign-in is asked for, then the same write is sent', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { mailingAddress: NOT_CONFIGURED }))
      .mockResolvedValueOnce(json(403, { error: { code: 'FRESH_AUTH_REQUIRED', message: '', fieldErrors: [] } }))
      .mockResolvedValueOnce(json(200, { csrfToken: 'synthetic-token' }))
      .mockResolvedValueOnce(json(200, { state: 'CONFIGURED', version: 2, lines: ['A'], sourceIds: [] }))
    const { t } = staffTranslator('en')
    render(<MailingAddressSetting t={t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('business-details')
    const box = within(section).getByLabelText('Mailing address (one line per row, up to 4 lines)')
    fireEvent.change(box, { target: { value: 'A\nB\nC\nD\nE' } })
    fireEvent.change(within(section).getByLabelText('Reason for the change'), { target: { value: 'Synthetic' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save the mailing address' }))
    expect(within(section).getByText('Use at most 4 lines of at most 120 characters each.')).toBeTruthy()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    fireEvent.change(box, { target: { value: 'A' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save the mailing address' }))
    const reauth = await within(section).findByTestId('owner-reauth')
    fireEvent.change(within(reauth).getByLabelText('Password'), { target: { value: 'synthetic' } })
    fireEvent.submit(reauth)
    await waitFor(() =>
      expect(within(section).getByText('The mailing address is saved. Documents print it from now on.')).toBeTruthy(),
    )
    expect(fetchImpl.mock.calls[2]?.[0]).toBe('/api/v1/staff/auth/reauth')
    expect(JSON.parse(String((fetchImpl.mock.calls[3] as [string, RequestInit])[1].body))).toEqual({
      lines: ['A'],
      reason: 'Synthetic',
    })
  })

  it('is hidden for a role the server refuses; Spanish has every label', async () => {
    const refused = vi.fn().mockResolvedValue(json(403, { error: { code: 'FORBIDDEN', message: '', fieldErrors: [] } }))
    const { t } = staffTranslator('en')
    const { container } = render(<MailingAddressSetting t={t} fetchImpl={refused as unknown as typeof fetch} />)
    await waitFor(() => expect(refused).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
    cleanup()
    const es = staffTranslator('es').t
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { mailingAddress: NOT_CONFIGURED }))
    render(<MailingAddressSetting t={es} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('business-details')
    expect(within(section).getByText('Datos del negocio')).toBeTruthy()
    expect(within(section).getByText('NO CONFIGURADO')).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Guardar la dirección postal' })).toBeTruthy()
  })

  it('splits the box into trimmed lines and drops blank rows', () => {
    expect(addressLines('  a  b \r\n\n c ')).toEqual(['a b', 'c'])
    expect(addressLines('   \n ')).toEqual([])
  })
})

const TERMS: LegalDocumentEntry = {
  key: 'legal.estimate_terms',
  state: 'CONFIGURED',
  version: 2,
  documentId: 'estimate-terms-1',
  status: 'approved',
  attorneyReviewed: false,
  attorneyReviewRequired: false,
  ownerSignOff: {
    by: 'owner',
    decisionId: 'OWN-DEC-187',
    source: 'owner answers 2026-10-21 R10-Q2',
    signedOn: '2026-10-21',
    wording: 'I approve v1.0 now',
  },
  inEffect: true,
  wordingMatches: true,
  effectiveFrom: '2026-10-22T12:00:00.000Z',
  waitsOn: ['OQ-ATTORNEY-TERMS'],
  realUseWaitsOn: ['OWN-DEC-191', 'OQ-ATTORNEY-PRIVACY'],
}
const PRIVACY: LegalDocumentEntry = {
  ...TERMS,
  key: 'legal.privacy_notice',
  version: 1,
  documentId: 'privacy-notice-1',
  status: 'draft',
  attorneyReviewRequired: null,
  ownerSignOff: null,
  inEffect: null,
  waitsOn: ['OQ-ATTORNEY-PRIVACY'],
  realUseWaitsOn: [],
}

describe('LegalDocumentsView (TSK-0144, HH-EST-13, OWN-DEC-187)', () => {
  it('[OWN-DEC-187] shows the owner sign-off of terms v1.0 and keeps the attorney review visibly open', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { documents: [PRIVACY, TERMS] }))
    const { t } = staffTranslator('en')
    render(<LegalDocumentsView t={t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const terms = await screen.findByRole('listitem', { name: 'Estimate terms' })
    expect(within(terms).getByText('Approved by the owner')).toBeTruthy()
    expect(
      within(terms).getByText(
        'Owner sign-off: OWN-DEC-187, 2026-10-21 (owner answers 2026-10-21 R10-Q2): "I approve v1.0 now"',
      ),
    ).toBeTruthy()
    expect(within(terms).getByText('Attorney review: not reviewed.')).toBeTruthy()
    expect(within(terms).getByText(/in effect without an attorney review/)).toBeTruthy()
    expect(within(terms).getByText('Customer approvals are accepted under this version.')).toBeTruthy()
    expect(within(terms).getByText('Still waiting on: OQ-ATTORNEY-TERMS')).toBeTruthy()
    expect(within(terms).getByText('Real customer use also waits for: OWN-DEC-191, OQ-ATTORNEY-PRIVACY')).toBeTruthy()
    const privacy = screen.getByRole('listitem', { name: 'Privacy policy' })
    expect(within(privacy).getByText('Draft')).toBeTruthy()
    expect(within(privacy).queryByText(/Owner sign-off/)).toBeNull()
    expect(within(privacy).getByText('Still waiting on: OQ-ATTORNEY-PRIVACY')).toBeTruthy()
  })
})
