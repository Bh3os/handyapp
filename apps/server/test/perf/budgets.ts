// The performance budgets (TSK-0105; HH-NFR-01, RULE-NO-INVENTED-FACTS): read from docs/perf/budgets.json, the one
// place they are written. A null budget is NOT CONFIGURED: measured and reported, never enforced.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Group, Sample } from './load.js'
import { groupP95 } from './load.js'

export const BUDGETS_FILE = fileURLToPath(new URL('../../../../docs/perf/budgets.json', import.meta.url))

type ApiBudget = { p95Ms: number | null; source: string }
export type Budgets = { api: Record<Group, ApiBudget> }

export function loadBudgets(file = BUDGETS_FILE): Budgets {
  return JSON.parse(readFileSync(file, 'utf8')) as Budgets
}

export type Verdict = {
  group: Group
  n: number
  p95: number
  budgetMs: number | null
  /** 'within' or 'over' a configured budget; 'not_configured' when the budget is null; 'no_samples'. */
  state: 'within' | 'over' | 'not_configured' | 'no_samples'
}

/** Each group's p95 against its budget. */
export function verdicts(samples: readonly Sample[], budgets: Budgets = loadBudgets()): Verdict[] {
  return (Object.keys(budgets.api) as Group[]).map((group) => {
    const { n, p95 } = groupP95(samples, group)
    const budgetMs = budgets.api[group].p95Ms
    const state = n === 0 ? 'no_samples' : budgetMs === null ? 'not_configured' : p95 <= budgetMs ? 'within' : 'over'
    return { group, n, p95, budgetMs, state }
  })
}
