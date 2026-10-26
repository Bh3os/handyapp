// The Owner Dashboard's figures, periods and CSV (TSK-0096; HH-FIN-18, HH-FIN-16, HH-DATA-10, T73, OWN-DEC-125).
import { describe, expect, it } from 'vitest'
import {
  addFigures,
  centsAsDollars,
  csvCell,
  csvText,
  DASHBOARD_FIGURES,
  DASHBOARD_MAX_DAYS,
  dashboardCsv,
  dashboardFigure,
  dashboardPeriod,
  incomplete,
  known,
  NOT_CONFIGURED,
  parseCsv,
  sumFigures,
  UNAVAILABLE,
  type DashboardPeriod,
  type ShownFigure,
} from '../src/owner-dashboard.js'
import { REPORT_DEFINITIONS } from '../src/report-sources.js'

describe('[HH-FIN-18][HH-DATA-10] every figure names its section, unit, scope and report', () => {
  it('has unique ids; money figures read a report definition; reports exist', () => {
    const ids = DASHBOARD_FIGURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    const reports = REPORT_DEFINITIONS.map((d) => d.id as string)
    for (const f of DASHBOARD_FIGURES) {
      expect(f.id.startsWith(`${f.section}.`), f.id).toBe(true)
      if (f.report) expect(reports, f.id).toContain(f.report)
      // An amount of money always says which basis it is, except the write-off figure, which is NOT CONFIGURED.
      if (f.unit === 'cents' && f.id !== 'payments.write_offs') expect(f.report, f.id).not.toBeNull()
    }
    expect(dashboardFigure('payments.invoiced')).toMatchObject({ report: 'invoiced', unit: 'cents', scope: 'period' })
    expect(dashboardFigure('nope')).toBeNull()
  })

  it('names the S11 sections: overview, response, estimates, quality, payments, cases (and job costs)', () => {
    expect([...new Set(DASHBOARD_FIGURES.map((f) => f.section))]).toEqual([
      'overview',
      'response',
      'estimates',
      'quality',
      'payments',
      'costs',
      'cases',
    ])
  })
})

describe('[HH-DATA-10][T73] figures are added only within one basis; unknown never becomes zero', () => {
  it('adds figures of one basis, keeping incomplete and unknown states', () => {
    expect(
      addFigures({ report: 'payments_received', value: known(100) }, { report: 'payments_received', value: known(5) }),
    ).toEqual(known(105))
    expect(
      addFigures({ report: 'job_costs', value: known(100) }, { report: 'return_work_costs', value: incomplete(5) }),
    ).toEqual(incomplete(105))
    expect(addFigures({ report: 'invoiced', value: known(1) }, { report: 'invoiced', value: UNAVAILABLE })).toEqual(
      UNAVAILABLE,
    )
    expect(addFigures({ report: 'invoiced', value: NOT_CONFIGURED }, { report: 'invoiced', value: known(1) })).toEqual(
      NOT_CONFIGURED,
    )
    expect(sumFigures('payments_received', [])).toEqual(known(0))
  })

  it('refuses mixed "cash": invoiced plus received, received plus pending checks, fees or payouts', () => {
    const v = known(1)
    expect(() => addFigures({ report: 'invoiced', value: v }, { report: 'payments_received', value: v })).toThrow()
    expect(() =>
      addFigures({ report: 'payments_received', value: v }, { report: 'pending_checks', value: v }),
    ).toThrow()
    expect(() => addFigures({ report: 'payments_received', value: v }, { report: 'provider_fees', value: v })).toThrow()
    expect(() => addFigures({ report: 'payments_received', value: v }, { report: 'payouts', value: v })).toThrow()
  })

  it('a value is an integer: no fractional cents', () => {
    expect(() => known(1.5)).toThrow()
    expect(() => incomplete(Number.NaN)).toThrow()
  })
})

describe('[HH-FIN-18] periods are calendar dates in the business zone, with the previous period beside', () => {
  it('counts both ends; the previous period is the same length just before', () => {
    expect(dashboardPeriod('2026-10-01', '2026-10-31')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      days: 31,
      previous: { from: '2026-08-31', to: '2026-09-30' },
    })
    // Across the clock change of 2026-11-01: calendar days, never 24-hour steps.
    expect(dashboardPeriod('2026-11-01', '2026-11-01')).toMatchObject({
      days: 1,
      previous: { from: '2026-10-31', to: '2026-10-31' },
    })
  })

  it('refuses a period that ends before it starts, a malformed date, or more than 366 days', () => {
    expect(dashboardPeriod('2026-10-02', '2026-10-01')).toBe('RANGE_INVALID')
    expect(dashboardPeriod('2026-13-01', '2026-10-01')).toBe('RANGE_INVALID')
    expect(dashboardPeriod('2025-10-01', '2026-10-01')).toMatchObject({ days: DASHBOARD_MAX_DAYS })
    expect(dashboardPeriod('2025-09-30', '2026-10-01')).toBe('RANGE_TOO_LONG')
  })
})

describe('[HH-FIN-16][HH-FIN-18] CSV: the same values, exact dollars, formula-safe', () => {
  it('writes integer cents as exact dollars', () => {
    expect(centsAsDollars(0)).toBe('0.00')
    expect(centsAsDollars(5)).toBe('0.05')
    expect(centsAsDollars(123_456)).toBe('1234.56')
    expect(centsAsDollars(-50)).toBe('-0.50')
    expect(centsAsDollars(null)).toBeNull()
    expect(() => centsAsDollars(1.5)).toThrow()
  })

  it('neutralizes cells starting with =, +, -, @, tab or carriage return; quotes commas and quotes', () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`)
    expect(csvCell('+1')).toBe(`"'+1"`)
    expect(csvCell('-2')).toBe(`"'-2"`)
    expect(csvCell('@cmd')).toBe(`"'@cmd"`)
    expect(csvCell('a, "b"')).toBe(`"a, ""b"""`)
    expect(csvCell(null)).toBe('')
    expect(csvCell(12)).toBe('12')
    expect(parseCsv(csvText(['x', 'y'], [['=1', 'a,b']]))).toEqual([
      ['x', 'y'],
      ["'=1", 'a,b'],
    ])
  })

  it('one row per figure, the same state and value; amounts in dollars; unknown stays empty, never 0', () => {
    const period = dashboardPeriod('2026-10-01', '2026-10-31') as DashboardPeriod
    const figures: ShownFigure[] = [
      {
        id: 'payments.invoiced',
        section: 'payments',
        unit: 'cents',
        scope: 'period',
        report: 'invoiced',
        detail: null,
        current: known(240_000),
        previous: known(0),
      },
      {
        id: 'response.average_minutes',
        section: 'response',
        unit: 'minutes',
        scope: 'period',
        report: null,
        detail: null,
        current: UNAVAILABLE,
        previous: UNAVAILABLE,
      },
      {
        id: 'cases.open_by_assignee',
        section: 'cases',
        unit: 'count',
        scope: 'now',
        report: null,
        detail: { id: 'staff-1', name: '=Synthetic' },
        current: known(2),
        previous: null,
      },
    ]
    const rows = parseCsv(dashboardCsv({ period, figures }))
    const [header, invoiced, minutes, assignee] = rows as string[][]
    const at = (r: string[] | undefined, c: string) => r?.[(header as string[]).indexOf(c)]
    expect(rows).toHaveLength(4)
    expect(at(invoiced, 'basis')).toBe('invoiced_revenue')
    expect(at(invoiced, 'value')).toBe('240000')
    expect(at(invoiced, 'amount_usd')).toBe('2400.00')
    expect(at(invoiced, 'previous_from')).toBe('2026-08-31')
    expect(at(invoiced, 'previous_value')).toBe('0')
    expect(at(minutes, 'state')).toBe('unavailable')
    expect(at(minutes, 'value')).toBe('')
    expect(at(assignee, 'detail')).toBe("'=Synthetic")
    expect(at(assignee, 'period_from')).toBe('')
  })
})
