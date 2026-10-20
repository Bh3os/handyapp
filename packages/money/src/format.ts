// en-US display of amounts (RULE-MONEY-CENTS; HH-FIN-01). Built from the integer digits, so no amount ever passes
// through a float on its way to the screen: 100001 cents is "$1,000.01", -500 is "-$5.00".
import { assertCents, type Cents, toDecimalString } from './cents.js'

/** en-US currency text: dollar sign, comma grouping, exactly two decimals, a leading minus for negatives. */
export function formatUsd(amount: Cents): string {
  assertCents(amount)
  const text = toDecimalString(amount)
  const negative = text.startsWith('-')
  const [whole = '0', frac = '00'] = (negative ? text.slice(1) : text).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}$${grouped}.${frac}`
}
