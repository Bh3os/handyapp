// The three first-visit site checks on a project's visits (TSK-0126; OWN-DEC-167, OWN-DEC-179, HH-SCH-06). The API
// is a synthetic stand-in (RULE-SYNTHETIC-DATA): every name, address, phone and email below is fictional.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteChecksPanel, type SiteChecks } from '../src/SiteChecks'

afterEach(cleanup)

const PROJECT = '33333333-3333-4333-8333-333333333333'
const PROPERTY = '66666666-6666-4666-8666-666666666666'
const CHECK = '77777777-7777-4777-8777-777777777777'
const OFFICE = { id: 'staff-1', name: 'Synthetic Office' }
const OWNER = { id: 'staff-0', name: 'Synthetic Owner' }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const when = (iso: string) => iso.slice(0, 10)

const checks = (over: Partial<SiteChecks> = {}): SiteChecks => ({
  property: {
    id: PROPERTY,
    version: 3,
    addressVersion: 2,
    address: { street: '100 Synthetic Test Way', unit: 'Apt 2', city: 'Testville', state: 'KY', zip: '40202' },
  },
  address: { done: false, problems: [], verification: null },
  siteContact: {
    done: false,
    problem: 'SITE_CONTACT_MISSING',
    current: null,
    customer: { name: 'Synthetic Customer', phone: '+15025550100', email: 'customer@example.test' },
  },
  coverage: { done: false, outcome: null, countyVerificationId: null, acceptance: null },
  actions: { verifyAddress: true, recordSiteContact: true, acceptCoverage: false, approveException: false },
  ...over,
})
const verified = {
  id: CHECK,
  state: 'KY',
  county: 'Jefferson',
  inArea: true,
  addressVersion: 2,
  verifiedBy: OFFICE,
  verifiedAt: '2026-10-24T15:00:00.000Z',
}

function renderPanel(c: SiteChecks, fetchImpl = vi.fn(async () => json(200, {})), locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  const onChanged = vi.fn()
  render(
    <SiteChecksPanel
      t={t}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      projectId={PROJECT}
      checks={c}
      when={when}
      onChanged={onChanged}
    />,
  )
  return { fetchImpl, onChanged }
}

describe('[HH-SCH-06][OWN-DEC-167] first-visit site checks (TSK-0126)', () => {
  it('[OWN-DEC-167] three checkboxes, each with what it rests on; nothing done yet', () => {
    renderPanel(checks())
    const items = within(screen.getByTestId('site-checks')).getAllByRole('listitem')
    expect(items.map((i) => i.getAttribute('data-done'))).toEqual(['false', 'false', 'false'])
    expect(screen.getByTestId('site-check-address-value').textContent).toBe(
      '100 Synthetic Test Way, Apt 2, Testville, KY 40202 (address version 2)',
    )
    expect(screen.getByTestId('site-check-contact-value').textContent).toBe('No site contact recorded yet.')
    expect(screen.getByTestId('site-check-coverage-value').textContent).toContain('Verify the address and county first')
    expect(screen.getByText(/never approve prices, payments or contract changes/)).toBeTruthy()
  })

  it('[OWN-DEC-167] the address check needs the county and the checkbox, and records it for the address version shown', async () => {
    const { fetchImpl, onChanged } = renderPanel(checks())
    const form = screen.getByRole('form', { name: 'Record address check' })
    const submit = within(form).getByRole('button', { name: 'Record address check' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(form).getByLabelText('County'), { target: { value: 'KY:Jefferson' } })
    fireEvent.click(within(form).getByLabelText(/I checked the complete address/))
    fireEvent.click(within(form).getByRole('button', { name: 'Record address check' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe(`/api/v1/staff/properties/${PROPERTY}/county-verification`)
    expect((init.headers as Record<string, string>)['if-match']).toBe('"3"')
    expect(JSON.parse(init.body as string)).toEqual({
      addressVersion: 2,
      addressChecked: true,
      state: 'KY',
      county: 'Jefferson',
    })
  })

  it('[OWN-DEC-179] an invalid address is named and cannot be checked until corrected', () => {
    renderPanel(
      checks({ address: { done: false, problems: ['ADDRESS_MAILING_ZIP'], verification: null } }),
      undefined,
      'es',
    )
    expect(screen.getByText(/es solo para correo/)).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Registrar la verificación de la dirección' })).toBeNull()
  })

  it('[OWN-DEC-167] the customer is prefilled as their own site contact; the authority and the confirmation are ticked', async () => {
    const { fetchImpl, onChanged } = renderPanel(checks())
    fireEvent.click(screen.getByRole('button', { name: 'Record site contact' }))
    const form = screen.getByRole('form', { name: 'Record site contact' })
    expect(within(form).getByTestId('site-contact-customer').textContent).toBe(
      'The customer, Synthetic Customer (+15025550100 · customer@example.test)',
    )
    fireEvent.click(within(form).getByLabelText('May coordinate the visit'))
    const submit = within(form).getByRole('button', { name: 'Record site contact' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(form).getByLabelText(/I confirmed that this person is the site contact/))
    fireEvent.click(within(form).getByRole('button', { name: 'Record site contact' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe(`/api/v1/staff/projects/${PROJECT}/site-contact`)
    expect(JSON.parse(init.body as string)).toEqual({
      currentVersion: 0,
      designation: 'customer',
      authority: ['visit_coordination'],
      source: 'customer_call',
      note: null,
    })
  })

  it('[OWN-DEC-167] another person needs a name, a role and a phone or email; a refusal is named', async () => {
    const fetchImpl = vi.fn(async () =>
      json(400, {
        error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.phone', code: 'PHONE_INVALID' }] },
      }),
    )
    const { onChanged } = renderPanel(checks(), fetchImpl)
    fireEvent.click(screen.getByRole('button', { name: 'Record site contact' }))
    const form = screen.getByRole('form', { name: 'Record site contact' })
    fireEvent.click(within(form).getByLabelText('Another person the customer named'))
    fireEvent.click(within(form).getByLabelText(/I confirmed that this person is the site contact/))
    const submit = within(form).getByRole('button', { name: 'Record site contact' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Synthetic Tenant' } })
    fireEvent.change(within(form).getByLabelText(/Role at the property/), { target: { value: 'Tenant' } })
    fireEvent.change(within(form).getByLabelText('Phone'), { target: { value: '12' } })
    fireEvent.click(within(form).getByLabelText('May give access to the property'))
    fireEvent.click(within(form).getByRole('button', { name: 'Record site contact' }))
    expect(await within(form).findByText('Enter a 10-digit US phone number.')).toBeTruthy()
    expect(onChanged).not.toHaveBeenCalled()
    expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({
      designation: 'other',
      fullName: 'Synthetic Tenant',
      role: 'Tenant',
      phone: '12',
      email: null,
      authority: ['property_access'],
    })
  })

  it('[OWN-DEC-167] a recorded contact shows its authority; an unauthorized one is named', () => {
    renderPanel(
      checks({
        siteContact: {
          done: false,
          problem: 'SITE_CONTACT_NOT_AUTHORIZED',
          current: {
            version: 1,
            designation: 'other',
            name: 'Synthetic Tenant',
            role: 'Tenant',
            phone: '+15025550101',
            email: null,
            authority: [],
            source: 'customer_call',
            note: null,
            recordedBy: OFFICE,
            recordedAt: '2026-10-24T16:00:00.000Z',
          },
          customer: null,
        },
      }),
    )
    expect(screen.getByTestId('site-check-contact-value').textContent).toBe(
      'Synthetic Tenant, Tenant (+15025550101). Authorized to: not confirmed. Recorded by Synthetic Office on 2026-10-24.',
    )
    expect(screen.getByText(/authority is not confirmed/)).toBeTruthy()
  })

  it('[OWN-DEC-167] SERVED coverage is accepted by staff with a checkbox', async () => {
    const { fetchImpl, onChanged } = renderPanel(
      checks({
        address: { done: true, problems: [], verification: verified },
        coverage: { done: false, outcome: 'served', countyVerificationId: CHECK, acceptance: null },
        actions: { verifyAddress: true, recordSiteContact: true, acceptCoverage: true, approveException: false },
      }),
    )
    expect(screen.getByTestId('site-check-coverage-value').textContent).toBe(
      'SERVED: Jefferson County, KY is in the service area.',
    )
    const form = screen.getByRole('form', { name: 'Accept coverage' })
    fireEvent.click(within(form).getByLabelText(/I confirm that Jefferson County, KY is in the service area/))
    fireEvent.click(within(form).getByRole('button', { name: 'Accept coverage' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe(`/api/v1/staff/projects/${PROJECT}/coverage-acceptance`)
    expect(JSON.parse(init.body as string)).toEqual({ countyVerificationId: CHECK })
  })

  it('[OWN-DEC-167][RULE-SAFETY-GATES] OUTSIDE needs the Owner’s exception with a reason; others only see that it is needed', async () => {
    const outside = {
      address: { done: true, problems: [], verification: { ...verified, county: 'Synthetic', inArea: false } },
      coverage: { done: false, outcome: 'outside' as const, countyVerificationId: CHECK, acceptance: null },
    }
    renderPanel(checks(outside))
    expect(
      screen.getByText("This needs the Owner's exception with a reason before a visit can be confirmed."),
    ).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Approve exception' })).toBeNull()
    cleanup()
    const { fetchImpl, onChanged } = renderPanel(
      checks({
        ...outside,
        actions: { verifyAddress: true, recordSiteContact: true, acceptCoverage: false, approveException: true },
      }),
    )
    const form = screen.getByRole('form', { name: 'Approve exception' })
    expect(within(form).getByText(/no legal, licensing or safety restriction is lifted/)).toBeTruthy()
    fireEvent.click(within(form).getByLabelText(/I approve serving this property in Synthetic County, KY/))
    const submit = within(form).getByRole('button', { name: 'Approve exception' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(form).getByLabelText('Reason for the exception'), {
      target: { value: 'Synthetic: a nearby property.' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Approve exception' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe(`/api/v1/staff/projects/${PROJECT}/coverage-exception`)
    expect(JSON.parse(init.body as string)).toEqual({
      countyVerificationId: CHECK,
      reason: 'Synthetic: a nearby property.',
    })
  })

  it('[OWN-DEC-167] a recorded exception shows the Owner, the time and the reason (Spanish)', () => {
    renderPanel(
      checks({
        address: { done: true, problems: [], verification: { ...verified, county: 'Synthetic', inArea: false } },
        coverage: {
          done: true,
          outcome: 'outside',
          countyVerificationId: CHECK,
          acceptance: {
            outcome: 'outside',
            exceptionReason: 'Synthetic: a nearby property.',
            acceptedBy: OWNER,
            acceptedAt: '2026-10-24T17:00:00.000Z',
          },
        },
      }),
      undefined,
      'es',
    )
    expect(screen.getByTestId('site-check-coverage-acceptance').textContent).toBe(
      'Excepción del Propietario por Synthetic Owner el 2026-10-24: Synthetic: a nearby property.',
    )
    expect(screen.getByText('Cobertura del área de servicio', { exact: false })).toBeTruthy()
  })
})
