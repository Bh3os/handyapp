---
id: OWN-DEC-145
type: decision
title: "No zero or negative lines; a discount is a totals row"
status: active
area: estimates
links:
  related: ["[[OWN-DEC-66]]", "[[OWN-DEC-102]]"]
  uses: ["[[FACT-PRICING-DISCOUNTS]]"]
source: "owner answers 2026-10-20 (coordinator session)"
---
Owner wording (2026-10-20): Q: "Can an estimate line be $0 (for example a free item) or a negative amount (a discount line)?" Answer: "Neither". Q: "Since lines can't be $0 or negative, how is a discount (10% military, senior or returning customer; one per job) applied on the estimate?" Answer: "Separate discount row in totals".

Effect:
- Every estimate, change-order and invoice line must be greater than $0.00. Publishing refuses a $0 or negative line.
- A discount (one per job, the biggest applies: 10% military, senior or returning customer) is a separate row in the totals, for example "Discount (military) -10%", shown before the total. It is not a line item.
- The discount is computed in integer cents, half-up ([[RULE-MONEY-CENTS]]). The deposit is computed on the total after the discount.
