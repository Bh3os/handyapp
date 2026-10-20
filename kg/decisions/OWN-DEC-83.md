---
id: OWN-DEC-83
type: decision
title: No tax line or automatic tax for now; half-up rounding per line
status: active
area: invoicing
links:
  related: ["[[HH-DATA-02]]", "[[HH-FIN-04]]", "[[HH-EST-03]]", "[[HH-EST-05]]"]
  uses: ["[[FACT-TAX-NO-LINE]]"]
  tested_by: ["[[T58]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-HUMAN-REVIEW]]"]
  part_of: ["[[C05]]", "[[C10]]"]
source: "vault-own-decisions.md OWN-DEC-83; owner-answers-verbatim.md 2026-10-12T16:49"
---
Owner wording (project chat, 2026-10-12, answering how cents are rounded): "For the current setup, do not add a separate tax line or automatically charge tax on estimates and invoices. Keep tax configuration disabled and show the approved final price clearly. Keep consistent half-up rounding to cents per line, with totals matching the displayed amounts. No hidden rounding charges. This is a software setting, not a determination that every service is tax-exempt. Any applicable tax treatment will be confirmed separately with the accountant."

Effect:
- Estimates and invoices have no tax line and the software calculates no tax ([[FACT-TAX-NO-LINE]]); the approved final price is shown clearly.
- Each line is rounded half-up to cents; totals equal the sum of the displayed amounts. No hidden rounding charge.
- This is a software setting, not a tax determination: customer documents never state or imply tax-exempt status.

Partly replaced by [[OWN-DEC-122]] and [[OWN-DEC-128]]: the "Tax not charged" setting is applied as the owner's authorized configuration through the existing supported process (no general bypass for system-seeded settings, no invented approving user), not left waiting for activation.

Open:
- The applicable tax treatment, to be confirmed with the accountant: [[OQ-TAX-CPA]].
