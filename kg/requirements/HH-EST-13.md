---
id: HH-EST-13
type: requirement
title: "Estimate terms v1.0 shown in full and pinned on every approval"
status: active
priority: P0
area: approval
links:
  decided_by: ["[[OWN-DEC-127]]", "[[OWN-DEC-72]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-PolicyVersion]]", "[[ENT-Approval]]", "[[ENT-Document]]", "[[FACT-ESTIMATE-VALIDITY]]", "[[FACT-DEPOSIT-RULE]]", "[[FACT-PAYMENT-DUE]]", "[[FACT-PAYMENT-METHODS]]", "[[FACT-REOPEN-PERIOD]]", "[[FACT-BUSINESS-NAME]]"]
  tested_by: ["[[T33]]"]
  part_of: ["[[C05]]", "[[S04]]"]
source: "OWN-DEC-127 (new behaviour; no guide id)"
---
- The estimate terms are a versioned legal document (version 1.0, status "owner review pending"), written in plain, numbered English sections from the owner's agreed policies only: validity, individual pricing, no tax line, no minimum, no surcharge, the deposit rule and its credit to the final invoice, scheduling waiting for the deposit or an owner waiver, payment not guaranteeing a date, payment due on receipt after the quality review, accepted payment methods, scope equal to the approved version and options, exclusions as listed, changes only by approved change order, appointments confirmed separately, reschedule and cancellation requests confirmed by staff with no cancellation fee, pauses for safety review, the work HandyHub does not perform, the walkthrough and quality review, the request reopen period, automatic and staff-released communications, photo sharing without marketing use, privacy by reference to the privacy notice, the electronic approval record, and the business name.
- Each numeric policy stated in the terms is read from the active policy data, never typed into the text.
- The terms never contain a warranty or guarantee, limitation of liability, indemnity, arbitration or venue, late fees or interest, refund or forfeiture terms, cancellation fees, damage-claim procedures, or licensing or insurance claims. Draft clauses of these kinds were removed and listed for attorney review (human-review boundary: legal).
- The estimate screen (staff preview and customer view) and the approval screen show the full terms readably: an expandable section plus a link to the full page. A terms PDF is rendered with the same content.
- Every approval stores the terms version ID and content hash ([[HH-EST-06]]).
- On staging, v1.0 is the current terms version with the banner "TEST — wording pending owner approval for real customer use". Real-customer approvals require the owner's recorded approval of the final wording through the legal-document sign-off.
