// Markdown of one measurement result (TSK-0105): the verdicts and every operation of every phase, as
// docs/perf/README.md shows them. Lab results only.
import type { Verdict } from './budgets.js'
import type { OpSummary } from './load.js'

export type ResultTables = {
  verdicts: readonly Verdict[]
  operations: Readonly<Record<string, readonly OpSummary[]>>
}

const ms = (n: number) => `${Math.round(n)} ms`

export function renderResult(r: ResultTables): string {
  const out = ['| Group | Samples | p95 | Budget | State |', '| --- | --- | --- | --- | --- |']
  for (const v of r.verdicts)
    out.push(
      `| ${v.group} | ${v.n} | ${ms(v.p95)} | ${v.budgetMs === null ? 'NOT CONFIGURED' : ms(v.budgetMs)} | ${v.state} |`,
    )
  for (const [phase, ops] of Object.entries(r.operations)) {
    out.push('', `Phase ${phase}`, '', '| Operation | Group | n | p50 | p95 | max | Statements | Answers |')
    out.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const o of ops)
      out.push(
        `| ${o.op} | ${o.group} | ${o.n} | ${ms(o.p50)} | ${ms(o.p95)} | ${ms(o.max)} | ${o.queries ?? ''} | ${Object.entries(
          o.statuses,
        )
          .map(([s, n]) => `${s}×${n}`)
          .join(', ')} |`,
      )
  }
  return `${out.join('\n')}\n`
}
