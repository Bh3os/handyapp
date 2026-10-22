---
id: OWN-DEC-211
type: decision
title: "Spanish-speaking workers write notes and proposed replies in Spanish; Owner or Office reviews them and sends the customer an approved English message"
status: active
area: messaging
links:
  constrained_by: ["[[RULE-LANGUAGES]]", "[[RULE-AI-WAVE2]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Message]]", "[[ENT-QueueItem]]", "[[ENT-AuditEvent]]", "[[ROLE-WORKER]]", "[[ROLE-OFFICE]]", "[[ROLE-OWNER]]"]
  related: ["[[OWN-DEC-162]]", "[[OWN-DEC-166]]", "[[OWN-DEC-154]]", "[[OWN-DEC-120]]", "[[OQ-SPANISH-DRAFTS-WAVE1]]", "[[HH-COM-08]]", "[[HH-COM-16]]", "[[TSK-0155]]", "[[TSK-0117]]"]
source: "owner answers 2026-10-22 R13-Q4; retained in R14"
---
Owner answer (round 13, question 4, "Spanish-speaking staff before wave 2: Notes in Spanish"), verbatim:

> Choose **Notes in Spanish (Recommended)**.
>
> I want Spanish-speaking HandyHub employees to participate fully in customer-related workflows without requiring them to write English.
>
> Implement the following:
> 1. Workers may write internal project notes and proposed customer replies in Spanish.
> 2. These notes must never be sent directly to customers.
> 3. Route customer-facing reply requests to an authorized Owner or Office review queue.
> 4. The Owner or Office reviews the Spanish note, prepares the English message, and explicitly approves sending it.
> 5. Preserve the original Spanish note internally for context and audit purposes.
> 6. Customer-facing messages must always be in professional, natural American English.
> 7. Clearly separate internal notes from customer-visible messages in the database and interface.
> 8. Prevent internal notes from accidentally appearing in emails, SMS messages, customer portal conversations, or customer-facing documents.
> 9. Show workers the status of their proposed replies: Draft, Awaiting Review, Sent, or Rejected.
> 10. Allow Owner/Office to request clarification from the worker before sending.
> 11. Notify Owner/Office when a customer-related note requires attention.
> 12. Enforce all sending permissions on the backend.
>
> **Wave 2 — AI Translation**
> When AI translation becomes available:
> - Automatically create an English draft from the Spanish note.
> - Preserve the original Spanish text.
> - Allow Owner/Office to compare the original and translated versions.
> - Require Owner/Office approval before sending personalized customer messages.
> - Never allow AI to independently send unreviewed customer replies.
> - Never allow AI translation to change pricing, contractual terms, safety instructions, or customer commitments without authorized review.
>
> Keep the existing automatic transactional notification rules unchanged.
>
> Implement, test, and publish this Wave 1 workflow to protected staging now. Do not delay launch waiting for Wave 2 AI translation.

Retained in round 14 (2026-10-22): "Spanish internal notes from Workers routed to Owner/Office for English customer replies" and "English-only customer-facing content".

Effect (wave 1):
- Workers may write internal project notes and proposed customer replies in Spanish. They are never sent to a customer as written.
- A proposed reply goes to an Owner or Office review queue; Owner or Office is notified when a customer-related note needs attention, may ask the worker for clarification, writes the English message and explicitly approves sending it (the Send of [[OWN-DEC-120]] by an authorized reviewer). The worker sees the proposal's status: Draft, Awaiting Review, Sent or Rejected.
- The original Spanish text is kept internally for context and audit. Customer-facing messages are always professional, natural American English ([[OWN-DEC-162]]).
- Internal notes and customer-visible messages are separate in the database and in the interface; no internal note can appear in an email, a text, a portal conversation or a customer document. Sending permissions are enforced on the server.
- Automatic transactional notifications are unchanged. Launch does not wait for wave 2.
- Wave 2 (AI translation, [[OWN-DEC-166]], [[RULE-AI-WAVE2]]): an English draft is created from the Spanish note, the original is kept, Owner or Office compares both and approves before a personalized message is sent; AI never sends an unreviewed reply and never changes pricing, contractual terms, safety instructions or customer commitments without authorized review. Recorded on [[TSK-0117]]; it stays disabled until the owner approves wave 2.
- Answers [[OQ-SPANISH-DRAFTS-WAVE1]] (its PROPOSED answer is confirmed with the review queue). Requirement [[HH-COM-16]]. Built by [[TSK-0155]].
