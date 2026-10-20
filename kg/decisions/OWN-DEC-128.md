---
id: OWN-DEC-128
type: decision
title: No-tax-line configuration authorized without bypassing approval protections
status: active
area: invoicing
links:
  related: ["[[OWN-DEC-83]]", "[[OWN-DEC-122]]", "[[OQ-TAX-CPA]]", "[[RULE-DECIDED-VALUES-ACTIVE]]", "[[HH-EST-05]]", "[[HH-FIN-01]]"]
  uses: ["[[FACT-TAX-NO-LINE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
source: "owner-answers-verbatim 2026-10-12T21:06:18.657Z [Tax active]; decision-briefs 2026-10-12T21:06"
---
Owner, 2026-10-12, tax activation question.

Question asked:
> The no-tax-line setting (OWN-DEC-83) is built, but my safety check blocked the agent from editing the database migration that would make it start ACTIVE (it changes an approval rule so a system-seeded setting needs no approving user). Should I make that change, or will you activate the pre-filled 'Tax not charged' setting yourself once?

Owner wording:
> My instruction to disable tax calculations and omit the tax line is already approved. Apply that specific configuration now so I do not need to activate it manually.
>
> Keep the existing approval protections. Do not change the general rule to let all system-seeded settings bypass approval, and do not invent an approving user. Record this instruction as the authorization using the existing supported process.
>
> If the safety check prevents that, leave the migration unchanged and give me the exact one-time activation step. Continue completing the rest of the project.
>
> This configures the website’s behavior; it does not declare the business legally tax-exempt.

Effect:
- The owner's instruction is the authorization for the no-tax-line configuration of [[OWN-DEC-83]] ([[FACT-TAX-NO-LINE]]): tax calculation disabled, no tax line on estimates and invoices.
- Approval protections stay: the general rule is not changed to let system-seeded settings skip approval, and no approving user is invented.
- In the old repo the safety check refused the migration change, so the fallback applied: the owner activates the pre-filled "Tax not charged" setting once in Business settings (Sales tax) with a reason citing OWN-DEC-83. In the rebuild the value is seeded active citing OWN-DEC-83 and this decision as the recorded authorization ([[OWN-DEC-122]], [[RULE-DECIDED-VALUES-ACTIVE]]).
- This configures the website only; it is not a tax-exempt declaration and documents never state or imply exemption. The tax treatment stays with the CPA ([[OQ-TAX-CPA]]).

Links: uses [[FACT-TAX-NO-LINE]]; constrained by [[RULE-HUMAN-REVIEW]].
