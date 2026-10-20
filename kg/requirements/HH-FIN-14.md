---
id: HH-FIN-14
type: requirement
title: "Refunds, credits, voids and write-offs: Owner-only, reasoned, audited"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-67]]", "[[OWN-DEC-118]]", "[[OWN-DEC-112]]", "[[OWN-DEC-114]]", "[[OWN-DEC-134]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-Refund]]", "[[ENT-Payment]]", "[[ENT-Invoice]]", "[[ENT-AuditEvent]]", "[[ROLE-OWNER]]", "[[FACT-CANCELLATION-RULES]]"]
  tested_by: ["[[T63]]", "[[T64]]"]
  part_of: ["[[S01]]", "[[S11]]"]
source: "guide 20.5 HH-FIN-14; 23 (Refund); OWN-DEC-67, OWN-DEC-118"
---
- Refund, credit, invoice void, write-off and payment correction require the Owner, a fresh sign-in (password re-entry, or TOTP when enrolled), a reason, the link to the original record and a current-state check; each is audited.
- Refund states: `requested → approved → processing → succeeded / failed / needs_review`. A Square refund is done in Square and counts as complete only when staff record its confirmation.
- Finance is never corrected by deleting transactions or rewriting accepted scope; corrections are new superseding records.
- Write-off is never automatic (accounting treatment: human review with the accountant).
- Cancellation refunds and charges follow [[FACT-CANCELLATION-RULES]] ([[OWN-DEC-134]]): with 24 hours or more notice before work starts the whole deposit is refunded; under 24 hours $50.00 is kept from the deposit and the rest refunded, or $50.00 is invoiced when no deposit was paid; after work started the customer owes the work done plus materials, which the Owner determines; when HandyHub cancels or moves a visit the customer chooses a free reschedule or a full refund. The Owner approves each one; nothing is refunded or charged automatically.
