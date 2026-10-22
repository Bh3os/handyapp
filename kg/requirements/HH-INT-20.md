---
id: HH-INT-20
type: requirement
title: Receipt email sends automatically, once per request
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-95]]", "[[OWN-DEC-60]]", "[[OWN-DEC-65]]", "[[OWN-DEC-131]]", "[[OWN-DEC-151]]"]
  depends_on: ["[[HH-INT-10]]", "[[HH-COM-06]]", "[[HH-ARC-08]]"]
  constrained_by: ["[[RULE-LANGUAGES]]", "[[RULE-SYNTHETIC-DATA]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[INT-Resend]]", "[[ENT-OutboxEvent]]", "[[ENT-Message]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-HOURS]]", "[[FACT-RESPONSE-TARGET]]", "[[FACT-PUBLIC-CONTACT]]"]
  tested_by: ["[[T12]]", "[[T65]]"]
  part_of: ["[[C03]]"]
source: "OWN-DEC-95 (amends the staff-release rule OWN-DEC-65)"
---
- The receipt email sends automatically after the request is successfully saved; it is one of the automatic-message exceptions ([[HH-COM-06]]).
- Content, in English: the actual reference, the selected services, a brief summary, the next steps, secure instructions for viewing the request, that account creation is optional, that pricing and the appointment are confirmed separately, and the same response-hours wording as the receipt page ([[HH-INT-12]]). It contains no access codes and no private details beyond what the customer submitted. Any business phone or email in it is a labelled placeholder from [[FACT-PUBLIC-CONTACT]].
- Exactly one receipt per request: the submission idempotency key plus a unique outbox key per request mean double submits and retries create neither a duplicate request nor a duplicate email.
- If delivery fails, the request stays saved and staff see a delivery issue with a **Retry** action in the queue ([[HH-OPS-01]]).
- Staging sends only to approved test destinations.

**Changed by [[OWN-DEC-151]] (2026-10-21):** the receipt email wording is MESSAGE 01.
