---
id: HH-COM-06
type: requirement
title: Only the listed automatic messages send without staff release; all others are staff-released drafts
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-65]]", "[[OWN-DEC-95]]", "[[OWN-DEC-98]]", "[[OWN-DEC-99]]", "[[OWN-DEC-100]]", "[[OWN-DEC-102]]", "[[OWN-DEC-105]]", "[[OWN-DEC-107]]", "[[OWN-DEC-110]]", "[[OWN-DEC-111]]", "[[OWN-DEC-114]]", "[[OWN-DEC-119]]", "[[OWN-DEC-120]]"]
  depends_on: ["[[HH-ARC-08]]", "[[HH-COM-05]]"]
  constrained_by: ["[[RULE-DECIDED-VALUES-ACTIVE]]", "[[RULE-SYNTHETIC-DATA]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[ENT-Message]]", "[[ENT-OutboxEvent]]", "[[INT-Resend]]", "[[INT-Bird]]"]
  tested_by: ["[[T12]]", "[[T65]]"]
  part_of: ["[[S06]]", "[[C03]]"]
source: "OWN-DEC-65 as amended by OWN-DEC-95 and later decisions"
---
- One policy list in the notification outbox names the customer messages that send automatically ([[FACT-AUTOMATIC-MESSAGES]]). Each later decision adds its message to this same list; there is no second list.
- Every other customer message is a draft that a staff member releases. Pressing **Send** on a staff reply or **Publish** on a question or decision is itself the release; no second approval is needed.
- An automatic message is triggered only by its committed business event (for example the saved request, the published estimate, the committed appointment change), never by a request or a draft alone.
- Each automatic message has a unique outbox key per subject, so retries never send duplicates. Delivery failures are shown to staff with a retry action and never undo the business event.
- On staging, automatic messages go only to approved test destinations.
