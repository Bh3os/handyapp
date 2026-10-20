---
id: HH-LEAD-03
type: requirement
title: Staff questions published in the project; customer replies with text and photos
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-98]]"]
  depends_on: ["[[HH-COM-06]]", "[[HH-PORT-09]]", "[[HH-ID-04]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-Question]]", "[[ENT-Message]]", "[[ENT-Photo]]", "[[ENT-AuditEvent]]", "[[INT-Resend]]", "[[INT-Bird]]"]
  tested_by: ["[[T30]]", "[[T65]]"]
  part_of: ["[[C04]]", "[[S02]]"]
source: "guide 12.2 HH-LEAD-03; OWN-DEC-98"
---
Staff side:
- Staff write and publish questions inside the correct project. Publishing is the staff release action; the notice then sends automatically with no second approval ([[HH-COM-06]]).
- The composer and guidance never let staff ask customers to inspect hazardous areas: a guard or warning appears in the composer and in the guidance copy.

Customer notice:
- A brief notice goes through the customer's permitted, preferred channel: "HandyHub has a question about your request. View and reply securely." It contains no private details and links directly to the question through verified project access.

Customer side:
- The workspace shows "Waiting on you" with a clear **Reply** action. Replies allow text, optional photos and "I'm not sure" for measurements.
- Reply drafts and successfully uploaded photos are kept if an upload fails.
- After submission the customer sees "Reply received—HandyHub will review it" and the assigned staff member is notified. Other unanswered questions stay open.
- Customers see only the questions intended for them.

Records:
- Questions, replies, attachments, authors and timestamps are kept append-only in project history. Answers update the request without erasing the original inputs or staff decisions.
- Retries never send a duplicate notice. A delivery failure appears in the staff queue without losing the question, and never counts as customer non-response ([[HH-LEAD-06]]).
