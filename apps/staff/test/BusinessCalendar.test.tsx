// The business-day calendar on the Owner's Settings screen (TSK-0136; OWN-DEC-205, FACT-BUSINESS-CALENDAR). The API
// is a synthetic stand-in (RULE-SYNTHETIC-DATA); the calendar is the decided default written out as test input.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BusinessCalendarSetting, closedDatesOf, type BusinessCalendarSettingView } from '../src/BusinessCalendar'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const t = staffTranslator('en').t

const setting = (
  over: Partial<NonNullable<BusinessCalendarSettingView['calendar']>> = {},
): BusinessCalendarSettingView => ({
  state: 'CONFIGURED',
  version: 1,
  calendar: {
    workdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    holidays: [
      'new_years_day',
      'martin_luther_king_jr_birthday',
      'washingtons_birthday',
      'memorial_day',
      'juneteenth',
      'independence_day',
      'labor_day',
      'columbus_day',
      'veterans_day',
      'thanksgiving_day',
      'christmas_day',
    ],
    observance: 'federal_weekend_rule',
    closedDates: [],
    ...over,
  },
  sourceIds: ['FACT-BUSINESS-CALENDAR', 'OWN-DEC-205'],
  observed: [
    { holiday: 'independence_day', date: '2026-07-04', observed: '2026-07-03' },
    { holiday: 'thanksgiving_day', date: '2026-11-26', observed: '2026-11-26' },
  ],
})

describe('business-day calendar setting (TSK-0136, OWN-DEC-205)', () => {
  it('[HH-PRIV-07] shows the calendar in force with the observed holidays', async () => {
    const fetchImpl = vi.fn(async () => json(200, setting()))
    render(<BusinessCalendarSetting t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('business-calendar')
    expect(within(section).getByText('Business days: Monday, Tuesday, Wednesday, Thursday, Friday')).toBeTruthy()
    const observed = within(section).getByTestId('business-calendar-observed')
    expect(
      within(observed).getByText('Independence Day: observed Friday, July 3, 2026 (falls on Saturday, July 4, 2026)'),
    ).toBeTruthy()
    expect(within(observed).getByText('Thanksgiving Day: Thursday, November 26, 2026')).toBeTruthy()
    expect(within(section).getByText(/never sets or shortens a legal deadline/)).toBeTruthy()
  })

  it('[HH-PRIV-07] the Owner adds a closed date with a reason; the change is sent once with the version shown', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'PUT'
        ? json(200, { ...setting({ closedDates: ['2026-11-27'] }), version: 2 })
        : json(200, setting()),
    )
    render(<BusinessCalendarSetting t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('business-calendar')
    fireEvent.change(within(section).getByLabelText('Further closed dates (one per row, YYYY-MM-DD)'), {
      target: { value: '2026-11-27\n' },
    })
    fireEvent.click(within(section).getByRole('button', { name: 'Save the calendar' }))
    expect(await within(section).findByText('Write the reason for the change.')).toBeTruthy()
    fireEvent.change(within(section).getByLabelText('Reason for the change'), {
      target: { value: 'Synthetic: closed the day after Thanksgiving.' },
    })
    fireEvent.click(within(section).getByRole('button', { name: 'Save the calendar' }))
    expect(await within(section).findByText(/The calendar is saved/)).toBeTruthy()
    const sent = fetchImpl.mock.calls.filter((c) => c[1]?.method === 'PUT')
    expect(sent).toHaveLength(1)
    const init = sent[0]?.[1] as RequestInit & { headers: Record<string, string> }
    expect(JSON.parse(String(init.body))).toMatchObject({
      workdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      closedDates: ['2026-11-27'],
      reason: 'Synthetic: closed the day after Thanksgiving.',
    })
    expect(init.headers['if-match']).toBe('"1"')
    expect(within(section).getByText(/^Also closed: Friday, November 27, 2026/)).toBeTruthy()
  })

  it('[HH-PRIV-07] reads the closed dates one per row and refuses anything else', () => {
    expect(closedDatesOf('2026-12-24\n\n 2026-11-27 \n2026-12-24')).toEqual(['2026-11-27', '2026-12-24'])
    expect(closedDatesOf('November 27')).toBeNull()
    expect(closedDatesOf('')).toEqual([])
  })

  it('[HH-LANG-02] is translated into Spanish', async () => {
    const es = staffTranslator('es').t
    render(
      <BusinessCalendarSetting
        t={es}
        locale="es"
        fetchImpl={vi.fn(async () => json(200, setting())) as unknown as typeof fetch}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'Calendario de días hábiles' })).toBeTruthy()
  })
})
