---
id: OQ-AI-GUARDRAILS-DETAILS
type: question
title: The AI guardrail details no decision gives (wave 2, AI off)
status: open
area: security
links:
  related: ["[[HH-AUTO-04]]", "[[HH-AUTO-03]]", "[[TSK-0116]]", "[[TSK-0117]]", "[[OWN-DEC-74]]", "[[OWN-DEC-15]]", "[[OWN-DEC-14]]", "[[OWN-DEC-211]]", "[[RULE-AI-WAVE2]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "TSK-0116 (2026-10-26): HH-AUTO-04, OWN-DEC-15 and OWN-DEC-14 state the rules; the details below are PROPOSED or NOT CONFIGURED"
---
**Question:** when the owner approves plan 33 and a provider, does the owner approve, or change, these PROPOSED guardrail details, and what are the NOT CONFIGURED values?

- **Who answers:** the owner.
- **Decided, in use:** AI is off in every environment and the off state is tested ([[RULE-AI-WAVE2]], [[OWN-DEC-74]]); authorization stays outside the model, customer text is untrusted evidence, credentials, access codes, card details and private photos are never exposed ([[OWN-DEC-15]]); every AI output follows the action contract ([[OWN-DEC-14]]).
- **PROPOSED, built and inert (nothing calls a model):**
  - The allowed uses, each with the staff action the requester must hold, the person's review action and the manual path: classify a request (request.view; reviewed with request.qualify), draft a reply (message.reply), draft estimate descriptions and assumptions, never prices (estimate.draft), draft packet instructions (job.view_packet; no review action exists, so it stays refused), suggest arrival windows (schedule.view_board; visit.offer_windows), point out missing checklist evidence (quality.review), summarize dashboard totals (dashboard.view), and draft an English version of a Spanish worker note (message.review_proposal, [[OWN-DEC-211]]).
  - Each use's named inputs (for example the service code, the request description, the city and state): anything else is dropped. Never sent, whatever a use declares: every secret field of the redaction schema, card and bank details, access codes and instructions, photos, images, videos, attachments and documents, and contact details (email, phone, street address, names).
  - Free text is redacted before it could leave the server: card-like numbers, North American phone numbers, email addresses, and the word after code, PIN, passcode, password, lockbox, combo or combination.
  - A model may answer only draft, proposed or blocked; "verified" is set by the reviewing person. Any field outside the contract, a record ID the server did not hand in, or an action the use does not allow refuses the whole answer.
  - Each refused request is audited as `ai.assist` (denied) with the use, the reasons and the input field names, never their contents.
- **NOT CONFIGURED (each refuses the use):** the provider and region each use's data may go to; the bounds per use (model steps, tool steps, retries, cost per run in cents, time limit); each use's fixed instructions ([[TSK-0117]]); a review action for packet drafts.
- **Until answered:** AI stays off; each PROPOSED detail is a small change to the registry (`apps/server/src/platform/ai/registry.ts`).
