---
id: HH-FIN-05
type: requirement
title: "Draft invoice from approved scope; issue after the Owner's quality review"
status: active
priority: P0
area: invoicing
links:
  decided_by: ["[[OWN-DEC-110]]", "[[OWN-DEC-64]]", "[[OWN-DEC-104]]", "[[OWN-DEC-138]]"]
  depends_on: ["[[HH-QA-02]]", "[[HH-DATA-04]]"]
  uses: ["[[ENT-Invoice]]", "[[ENT-JobScopeSnapshot]]", "[[ENT-ChangeOrder]]", "[[ENT-DepositRequirement]]", "[[ENT-PaymentAllocation]]"]
  tested_by: ["[[T58]]", "[[T56]]", "[[T59]]"]
  part_of: ["[[C10]]"]
source: "guide 20.2 HH-FIN-05; OWN-DEC-110"
---
- The invoice draft is prepared automatically from the approved estimate lines, approved change orders and recorded deposit credits. Unapproved work never appears; unapproved financial exceptions are shown to staff before issue.
- Issuing is blocked until the Owner's quality review passes ([[HH-QA-02]]); then Office or the Owner may issue at once, even while the team is still on site ([[OWN-DEC-138]]). With minor punch items the Owner may issue if the payment terms allow; with major defects the final invoice stays blocked.
- Deposit or progress invoices and the final invoice have separate purposes.
- The deposit is credited exactly once: unique constraints and idempotency stop a second credit even under concurrent issue attempts.
- One invoice per job, unless a deliberate, audited void-and-reissue or credit path is used.
