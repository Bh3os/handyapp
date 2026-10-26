---
id: OQ-SPANISH-NOTES-DETAILS
type: question
title: The worker-note and proposed-reply details OWN-DEC-211 does not give
status: open
area: messaging
links:
  related: ["[[HH-COM-16]]", "[[HH-COM-08]]", "[[HH-COM-01]]", "[[OWN-DEC-211]]", "[[OWN-DEC-162]]", "[[OWN-DEC-115]]", "[[ENT-Message]]", "[[ENT-QueueItem]]", "[[ROLE-MATRIX]]", "[[RULE-LANGUAGES]]", "[[RULE-AI-WAVE2]]", "[[RULE-NO-INVENTED-FACTS]]", "[[TSK-0155]]", "[[TSK-0117]]", "[[OQ-MESSAGES-OUTSIDE-THE-21]]"]
source: "TSK-0155 (2026-10-26): OWN-DEC-211 and HH-COM-16 state the rules; the details below are PROPOSED or NOT CONFIGURED"
---
**Question:** does the owner approve, or change, these PROPOSED details of workers' notes and proposed replies and of their Owner/Office review?

- **Who answers:** the owner.
- **Decided, in use:** workers write internal notes and proposed customer replies in Spanish or English; nothing a worker writes is sent to a customer as written; Owner or Office review it, may ask the worker for clarification, write the English message and explicitly approve sending it; only Owner or Office send, enforced on the server and in the database; the worker sees Draft, Awaiting Review, Sent or Rejected; the original is kept with the sent message; internal notes and customer messages are stored and shown apart; no translation exists ([[OWN-DEC-211]], [[RULE-AI-WAVE2]]).
- **PROPOSED, in use on private staging:**
  - Where workers write: from a job they are assigned to, inside its access window (My Day links "Notes and proposed replies" on a confirmed visit). A note goes to the project's internal conversation, the same one Owner and Office use; a worker sees only their own notes. A proposal belongs to the job it was written from.
  - Permissions: the Worker cell of "Reply from a project, release drafts" (formerly "Assigned operational thread (P)") is refused; the new ROLE-MATRIX rows let a worker propose on assigned jobs and follow their own proposals (edit a draft, send it for review, answer a question, see the status, also after the visit day), and let Owner and Office review. Estimators neither propose nor review.
  - Drafts: kept until the worker sends them for review; a draft is never shown to the reviewers, never withdrawn or deleted, and its text is frozen once submitted. Sent and rejected proposals are final.
  - The notice to Owner and Office is the review item in their action queue ("Proposed reply to review", band time-sensitive, no due time). It resolves while the worker owes an answer to a question and returns, with the reason "the worker answered", when they answer. The worker's notice of a question is the "Clarification requested" mark on My Day and on the job's page. One open question at a time; the reviewer may still send or reject while it is open, which closes it.
  - Explicit approval: the reviewer ticks "I reviewed this message: it is in English, ready for the customer, and I approve sending it" before Send; the server refuses a send without it. The reply is the reviewer's own staff reply, with every rule of a reply from the project ([[HH-COM-08]]): the customer's preferred permitted channel, the English reply template, the delivery hours.
  - What the worker sees: the status, the reviewer's question and the reason of a rejection; never the English message sent. Staff see the worker's original beside the sent reply on the project's conversation; the customer never sees it.
  - Limits: a proposal, a question or an answer up to 2,000 characters (the reply limit), a note up to 5,000; a rejection reason up to 1,000. Lists show the latest 100 proposals and 200 notes.
  - The audit records each note, proposal, edit, submission, question, answer, rejection and sending with the project and the proposal, never a text.
- **NOT CONFIGURED:** an email or text notice to Owner and Office about a proposal needs owner-approved staff notice wording (no template exists, [[OQ-MESSAGES-OUTSIDE-THE-21]]); until it is worded, the queue item is the only notice. No due time or response target applies to a proposal.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
