// Server-side estimate totals from the active configuration (TSK-0052; HH-DATA-02, HH-EST-02, HH-EST-03, HH-FIN-01,
// ENT-PolicyVersion, RULE-DECIDED-VALUES-ACTIVE, RULE-MONEY-CENTS).
// - Every amount is computed by @handyhub/money; this file only maps configuration to its inputs. No business value
//   is written here: the discount share and categories come from discount.rule, the deposit threshold and share from
//   deposit.rule, and the version pins the policy versions it used (HH-EST-03), so a later policy change never
//   recalculates it.
// - A NOT CONFIGURED deposit rule yields deposit 'not_configured', never "no deposit"; a discount asked for while the
//   discount rule is NOT CONFIGURED, or with a category the rule does not list, is refused (RULE-NO-INVENTED-FACTS).
// - Only the tax-mode version in force is pinned. No amount depends on it: there is no tax line (FACT-TAX-NO-LINE).
import {
  basisPoints,
  type BasisPoints,
  cents,
  type Cents,
  type DepositRule,
  type EstimateLineInput,
  type EstimateProblem,
  priceEstimate,
  type Totals,
} from '@handyhub/money'
import type { Config } from '../../platform/config/index.js'

export type DepositState = 'not_required' | 'required' | 'not_configured'

/** The policy values a version's totals are computed with, and the versions they came from. */
export type PricingPolicies = {
  readonly deposit: { readonly rule: DepositRule; readonly version: number } | null
  readonly discount: {
    readonly percent: BasisPoints
    readonly categories: readonly string[]
    readonly version: number
  } | null
  /** The tax-mode policy version in force (pinned only), or null while NOT CONFIGURED. */
  readonly taxModeVersion: number | null
}

export function pricingPolicies(config: Config): PricingPolicies {
  const deposit = config.get('deposit.rule')
  const discount = config.get('discount.rule')
  const taxMode = config.get('tax.mode')
  return {
    deposit:
      deposit.state === 'CONFIGURED'
        ? {
            rule: {
              thresholdCents: cents(deposit.value.thresholdCents),
              percent: basisPoints(deposit.value.percentBps),
            },
            version: deposit.version,
          }
        : null,
    discount:
      discount.state === 'CONFIGURED'
        ? {
            percent: basisPoints(discount.value.percentBps),
            categories: discount.value.categories,
            version: discount.version,
          }
        : null,
    taxModeVersion: taxMode.state === 'CONFIGURED' ? taxMode.version : null,
  }
}

export type DiscountProblem = { readonly code: 'DISCOUNT_NOT_CONFIGURED' | 'DISCOUNT_CATEGORY_UNKNOWN' }

/** The discount row's share and pinned rule version for a category, or the reason it cannot apply. */
export function discountFor(
  policies: PricingPolicies,
  category: string | null,
):
  | { readonly ok: true; readonly discount: { category: string; percent: BasisPoints; version: number } | null }
  | { readonly ok: false; readonly problem: DiscountProblem } {
  if (category === null) return { ok: true, discount: null }
  if (!policies.discount) return { ok: false, problem: { code: 'DISCOUNT_NOT_CONFIGURED' } }
  if (!policies.discount.categories.includes(category)) {
    return { ok: false, problem: { code: 'DISCOUNT_CATEGORY_UNKNOWN' } }
  }
  return {
    ok: true,
    discount: { category, percent: policies.discount.percent, version: policies.discount.version },
  }
}

export type VersionTotals = {
  readonly lineAmounts: readonly (Cents | null)[]
  readonly problems: readonly EstimateProblem[]
  /** Null while a line is incomplete or invalid. */
  readonly totals: {
    readonly subtotal: Cents
    readonly discount: Cents
    readonly total: Cents
    readonly depositState: DepositState
    readonly deposit: Cents | null
    readonly depositRuleVersion: number | null
    readonly taxModeVersion: number | null
  } | null
}

/**
 * Prices the lines and computes the totals of the base offer (or, with `selectedOptions`, of the customer's choice)
 * under the given policies and discount. Deterministic: the same lines and policies always give the same totals.
 */
export function computeVersionTotals(input: {
  readonly lines: readonly EstimateLineInput[]
  readonly policies: PricingPolicies
  readonly discountPercent: BasisPoints | null
  readonly selectedOptions?: readonly number[]
}): VersionTotals {
  const priced = priceEstimate({
    currency: 'USD',
    lines: input.lines,
    discountPercent: input.discountPercent,
    depositRule: input.policies.deposit?.rule ?? null,
    ...(input.selectedOptions ? { selectedOptions: input.selectedOptions } : {}),
  })
  if (!priced.totals) return { lineAmounts: priced.lineAmounts, problems: priced.problems, totals: null }
  return { lineAmounts: priced.lineAmounts, problems: [], totals: depositOf(priced.totals, input.policies) }
}

function depositOf(t: Totals, policies: PricingPolicies): NonNullable<VersionTotals['totals']> {
  const common = { subtotal: t.subtotal, discount: t.discount, total: t.total, taxModeVersion: policies.taxModeVersion }
  if (!policies.deposit || !t.deposit) {
    return { ...common, depositState: 'not_configured', deposit: null, depositRuleVersion: null }
  }
  return t.deposit.required
    ? { ...common, depositState: 'required', deposit: t.deposit.amount, depositRuleVersion: policies.deposit.version }
    : { ...common, depositState: 'not_required', deposit: null, depositRuleVersion: policies.deposit.version }
}
