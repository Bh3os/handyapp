---
id: HH-DATA-02
type: requirement
title: Exact money totals computed on the server, currency stored, no minimum rule, no tax line
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-31]]", "[[OWN-DEC-83]]", "[[OWN-DEC-102]]", "[[OWN-DEC-128]]", "[[OWN-DEC-122]]", "[[OWN-DEC-145]]"]
  depends_on: ["[[HH-ARC-03]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-NO-MINIMUM]]", "[[FACT-TAX-NO-LINE]]", "[[FACT-NO-SURCHARGE]]", "[[FACT-PRICING-DISCOUNTS]]"]
  tested_by: ["[[T02]]", "[[T31]]", "[[T58]]"]
source: "guide 22.2; OWN-DEC-83, OWN-DEC-102, OWN-DEC-128"
---
- Line amounts, options, discounts, deposits, credits, totals and balances are computed on the server in integer cents with the currency (USD) stored on every amount ([[RULE-MONEY-CENTS]]): one half-up rounding per line, and the total is the sum of the displayed lines, with no hidden rounding charge ([[OWN-DEC-83]]).
- Invalid combinations (a $0 or negative line, a negative quantity, a discount larger than the subtotal, an unsupported currency) are refused with a field error; nothing is silently clamped. A discount is a totals row, never a line ([[FACT-PRICING-DISCOUNTS]], [[OWN-DEC-145]]).
- No minimum-price rule enters through migrations, seeds, defaults or calculators ([[FACT-NO-MINIMUM]]), and no card surcharge exists ([[FACT-NO-SURCHARGE]]).
- Estimates and invoices carry no tax line and charge no tax ([[FACT-TAX-NO-LINE]]). This is applied as active configuration citing [[OWN-DEC-83]] and [[OWN-DEC-128]] through the existing approval process (no general bypass for system-seeded settings, no invented approving user). Staff screens label it "Tax not charged (owner setting; accountant to confirm)"; customer documents never state or imply tax-exempt status. The actual tax treatment stays a human-review item for the accountant ([[RULE-HUMAN-REVIEW]]).
