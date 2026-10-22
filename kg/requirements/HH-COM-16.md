---
id: HH-COM-16
type: requirement
title: "Spanish worker notes and proposed replies go through an Owner/Office review queue; customers only receive approved English messages"
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-211]]", "[[OWN-DEC-162]]"]
  depends_on: ["[[HH-COM-08]]"]
  constrained_by: ["[[RULE-LANGUAGES]]", "[[RULE-SERVER-AUTHZ]]", "[[RULE-AI-WAVE2]]"]
  uses: ["[[ENT-Message]]", "[[ENT-QueueItem]]", "[[ENT-AuditEvent]]", "[[ROLE-WORKER]]", "[[ROLE-OFFICE]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T66]]", "[[T26]]"]
  part_of: ["[[S06]]", "[[S07]]"]
source: "OWN-DEC-211 (new behaviour; no guide id)"
---
- A worker can write an internal project note or a proposed customer reply in Spanish (or English) from the project or My Day. Neither is ever sent to a customer as written.
- A proposed reply creates a review queue item for Owner and Office, who are notified. The reviewer can ask the worker for clarification, writes the English customer message and explicitly approves sending it; only Owner or Office can send, enforced on the server.
- The worker sees each proposal's status: Draft, Awaiting Review, Sent or Rejected.
- The original Spanish text stays internal and is kept with the sent English message for context and audit.
- Internal notes and customer-visible messages are stored and shown separately; no internal note can reach an email, a text, a portal conversation or a customer document.
- Customer-facing text is English only. No translation feature exists in wave 1; wave 2 AI drafts stay disabled ([[RULE-AI-WAVE2]]).
