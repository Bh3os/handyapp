// Report definitions and their source states (TSK-0095; HH-DATA-10, HH-FIN-17, HH-FIN-18, T73, OWN-DEC-125).
import { describe, expect, it } from 'vitest'
import {
  combinable,
  definitionProblems,
  PENDING_PAYMENT_STATES,
  RECEIVED_PAYMENT_STATES,
  REPORT_BASES,
  REPORT_DEFINITIONS,
  sourceStatement,
  type ReportDefinition,
} from '../src/report-sources.js'

describe('[HH-DATA-10][HH-FIN-17][T73] each report states its sources', () => {
  it('gives every definition a basis, included records and states, and how unknowns show', () => {
    const ids = REPORT_DEFINITIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of REPORT_DEFINITIONS) {
      expect(REPORT_BASES, d.id).toContain(d.basis)
      expect(d.includes.length, d.id).toBeGreaterThan(0)
      for (const s of [...d.includes, ...d.excludes]) expect(s.record, d.id).toMatch(/^[a-z_]+\.[a-z_]+$/)
      expect(['incomplete', 'unavailable'], d.id).toContain(d.unknown)
      expect(definitionProblems(d), d.id).toEqual([])
    }
  })

  it('names the bases HH-FIN-17 lists: estimates, invoiced revenue, cash received, settlement, estimated profit', () => {
    for (const b of ['estimates', 'invoiced_revenue', 'cash_received', 'settlement', 'estimated_profit'] as const)
      expect(REPORT_BASES).toContain(b)
  })

  it('counts money received once per verified payment, never pending, failed, fees or payouts', () => {
    const cash = REPORT_DEFINITIONS.find((d) => d.id === 'payments_received') as ReportDefinition
    expect(cash.basis).toBe('cash_received')
    expect(cash.includes).toEqual([
      { record: 'finance.payments', where: { state: [...RECEIVED_PAYMENT_STATES] }, countsOnce: 'per_payment' },
    ])
    const left = cash.excludes.map((s) => s.record)
    expect(left).toEqual(expect.arrayContaining(['finance.payments', 'finance.provider_fees', 'finance.payouts']))
    expect(cash.excludes.flatMap((s) => s.where['state'] ?? [])).toEqual(
      expect.arrayContaining([...PENDING_PAYMENT_STATES, 'returned', 'voided']),
    )
  })

  it('keeps invoiced revenue apart from money received and counts the deposit once', () => {
    const invoiced = REPORT_DEFINITIONS.find((d) => d.id === 'invoiced') as ReportDefinition
    expect(invoiced.includes).toEqual([
      { record: 'finance.invoices', where: { kind: ['final'], state: ['issued', 'partially_paid', 'paid'] } },
    ])
    expect(invoiced.excludes).toContainEqual({ record: 'finance.invoices', where: { kind: ['deposit'] } })
    expect(combinable('invoiced', 'payments_received')).toBe(false)
  })

  it('never adds figures of two bases together: no mixed "cash"', () => {
    expect(combinable('payments_received', 'pending_checks')).toBe(false)
    expect(combinable('payments_received', 'payouts')).toBe(false)
    expect(combinable('payments_received', 'provider_fees')).toBe(false)
    expect(combinable('estimates_sent', 'invoiced')).toBe(false)
    expect(combinable('job_costs', 'return_work_costs')).toBe(true)
  })

  it('counts revisions once per estimate', () => {
    const sent = REPORT_DEFINITIONS.find((d) => d.id === 'estimates_sent') as ReportDefinition
    expect(sent.includes[0]?.countsOnce).toBe('per_estimate')
    expect(sent.excludes).toContainEqual({
      record: 'estimating.estimate_versions',
      where: { state: ['draft', 'in_review'] },
    })
  })

  it('shows unknown cost as incomplete and keeps return work apart from the job', () => {
    const costs = sourceStatement('job_costs')
    expect(costs.basis).toBe('job_costs')
    expect(costs.unknown).toBe('incomplete')
    expect(costs.includes.map((s) => s.record)).toContain('finance.job_costs')
    expect(costs.excludes.map((s) => s.record)).toEqual(
      expect.arrayContaining(['quality.return_work_costs', 'finance.invoices', 'finance.payments']),
    )
  })

  it('finds what breaks the rules', () => {
    const base = { id: 'x', excludes: [], unknown: 'unavailable', builtBy: 'TSK-0096' } as const
    expect(definitionProblems({ ...base, basis: 'cash_received', includes: [] })).toContain('NO_SOURCES')
    expect(
      definitionProblems({
        ...base,
        basis: 'cash_received',
        includes: [{ record: 'finance.payments', where: { state: ['recorded', 'received'] } }],
      }),
    ).toEqual(['CASH_INCLUDES_PENDING_OR_FAILED'])
    expect(
      definitionProblems({
        ...base,
        basis: 'cash_received',
        includes: [
          { record: 'finance.payments', where: { state: ['recorded'] } },
          { record: 'finance.invoices', where: { state: ['paid'] } },
        ],
      }),
    ).toEqual(['CASH_INCLUDES_OTHER_RECORDS'])
    expect(
      definitionProblems({
        ...base,
        basis: 'invoiced_revenue',
        includes: [{ record: 'finance.invoices', where: { state: ['issued'] } }],
      }),
    ).toEqual(['INVOICED_INCLUDES_DEPOSIT_INVOICE'])
    expect(
      definitionProblems({
        ...base,
        basis: 'balances',
        includes: [{ record: 'finance.invoices', where: { state: ['issued'] } }],
        excludes: [{ record: 'finance.invoices', where: { state: ['issued'] } }],
      }),
    ).toEqual(['INCLUDED_AND_EXCLUDED'])
  })
})
