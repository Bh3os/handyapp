---
id: HH-EST-05
type: requirement
title: "Unknown facts are never invented; decided values are active"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-122]]", "[[OWN-DEC-82]]", "[[OWN-DEC-126]]", "[[OWN-DEC-127]]", "[[OWN-DEC-128]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-DECIDED-VALUES-ACTIVE]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-PolicyVersion]]", "[[ENT-Hold]]", "[[FACT-BUSINESS-ADDRESS]]"]
  tested_by: ["[[T31]]", "[[T40]]"]
  part_of: ["[[S04]]", "[[S08]]"]
source: "guide 13.1 HH-EST-05; OWN-DEC-82, OWN-DEC-122, OWN-DEC-126, OWN-DEC-127, OWN-DEC-128"
---
- Values the owner decided (estimate validity, deposit rule, no tax line, no minimum, no surcharge, payment term, business name) are seeded as active, versioned configuration citing their decision. No settings-activation step blocks drafting, publishing, approval or payment.
- Rates, tax treatment, deposit terms, qualifications and agreement wording that the owner has not supplied are never invented. A draft can always be saved.
- Tax mode is "Tax not charged (owner setting; accountant to confirm)". It is applied as the owner's authorization through the supported configuration process, without inventing an approving user and without a general bypass for system-seeded settings. Customer documents never state or imply tax-exempt status. Tax treatment stays a human-review item for the accountant.
- The missing mailing address omits that line and blocks nothing ([[FACT-BUSINESS-ADDRESS]]).
- Estimate terms v1.0 are used on staging with TEST marking. Real-customer approvals wait only for the owner's approval of that wording ([[HH-EST-13]]).
- Qualifications, licenses and permits are not tracked in the software. A job with an unresolved requirement carries a job-level Hold with a note ([[ENT-Hold]]); the Hold blocks confirmation and start until cleared with a note ([[HH-SCH-06]], [[HH-WORK-02]]). The owner checks requirements outside the software.
