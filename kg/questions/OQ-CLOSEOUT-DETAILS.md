---
id: OQ-CLOSEOUT-DETAILS
type: question
title: The closeout, reopen, satisfaction-check and review-request details no decision gives
status: open
area: quality
links:
  related: ["[[HH-QA-09]]", "[[HH-QA-10]]", "[[HH-STATE-02]]", "[[HH-COM-05]]", "[[OWN-DEC-77]]", "[[OWN-DEC-157]]", "[[OWN-DEC-113]]", "[[OWN-DEC-109]]", "[[OWN-DEC-124]]", "[[OWN-DEC-151]]", "[[OWN-DEC-190]]", "[[FACT-REMINDER-CADENCES]]", "[[ENT-Job]]", "[[ROLE-MATRIX]]", "[[TSK-0092]]", "[[TSK-0094]]", "[[OQ-MESSAGES-OUTSIDE-THE-21]]"]
source: "TSK-0092 (2026-10-25): HH-QA-09, HH-QA-10, OWN-DEC-77, OWN-DEC-157 and OWN-DEC-113 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of closing a job, reopening it, the service-quality follow-up (the satisfaction check) and review requests?

- **Who answers:** the owner.
- **Decided, in use:** operational completion and the money are separate; the job is closed only with every task and QA item disposed of, every punch item re-checked, the financial records approved and no open complaint, and a refusal names what is open ([[HH-QA-09]], [[HH-STATE-02]]). Only the Owner reopens a closed job, with a fresh sign-in and a reason; the original record is kept and the reopen is audited ([[OWN-DEC-77]]). The service-quality follow-up (`customer_follow_up`) is prepared for every completed job 48 hours after authorized final completion, once, released by staff, suppressed on an opt-out of optional follow-ups, an active complaint or a reopened job, with a secure concern link ([[OWN-DEC-157]]). Review requests are staff-released marketing with marketing consent, never sent automatically, never score-gated, paused during an active complaint and reconsidered after it whatever the outcome ([[OWN-DEC-113]]).
- **PROPOSED, in use on private staging:**
  - **Who closes.** The Owner (`job.close`, in the Owner's quality-review row of [[ROLE-MATRIX]]), from the job's closeout page; the Owner Decisions item "Jobs to close" stays open while the job is operationally complete or reopened. Nothing closes a job by itself.
  - **What "closed" needs.** The Owner's review passed and every punch item re-checked; every work package complete; no visit still planned or under way; no change order waiting for the customer; no open hold on the project; the final invoice issued and either paid or its balance explicitly tracked; no other invoice open; no pending check, open payment dispute, refund, credit or write-off under review, or overpayment waiting for the Owner's decision; every case on the project closed.
  - **"Remaining obligations explicitly tracked".** Read as an active payment plan, an active collection hold, or the Owner's "Overdue—owner decision" recorded on the final invoice ([[TSK-0091]]). The close records which of these (or "paid") it was made on.
  - **The project's own state.** Closing and reopening change the job only; the project's PROPOSED `completed` and `closed` states are not moved by this task.
  - **Reopen.** From `closed` only, to `reopened`, with a reason of up to 2,000 characters; a reopened job leaves that state only by closing again on the same conditions. An operationally complete job leaves its state only by closing. Return work for a customer issue stays a linked return visit or job ([[TSK-0094]]), never a reopen.
  - **Authorized final completion.** The moment the Owner's quality review passed (the job became operationally complete). The follow-up is prepared `reminders.cadences.satisfaction.daysAfterCompletion` (2) × 24 hours after it, an elapsed 48 hours whatever the daylight-saving change.
  - **Reopened.** A job ever reopened gets no follow-up, also after it is closed again; a follow-up waiting or queued when the job is reopened is cancelled.
  - **"Requested no optional follow-ups".** Read as the customer's service-communication preference withdrawn on the channel; it stops both the follow-up and review requests, checked when the draft is prepared and again right before it sends.
  - **Active complaint.** Any case on the project that is not closed (complaints, incidents, damage, injury and disputes) pauses both: the draft is kept, marked held, cannot be released, and is offered again in the staff queue ("Follow-ups to release") once every case is closed. A released follow-up that meets an open case at send time goes back to a held draft.
  - **Channel.** Email only, to the request's contact, while texts are off ([[OWN-DEC-190]]).
  - **Who releases.** The Owner or Office (`message.release_draft` on the project's records). Staff may also decide not to send a draft (kept as cancelled).
  - **The concern link.** The owner's `customer_follow_up` wording is kept as it is, with one added paragraph before the closing, released as version 2 (migration 0101): "If anything about the work needs attention, you can report a concern or ask for help securely through your project page: / {projectLink}". The link opens the project page in the portal, behind its verified access; the customer replies through the project's messages, and a reply to the email reaches the project's conversation.
  - **The customer's answer.** Staff record it from the customer's reply or a call as positive, mixed or negative, with an optional note (append-only, the Owner or Office). It never changes review-request eligibility; a problem reported is recorded as a complaint case ([[TSK-0093]]).
  - **Review requests.** Staff prepare one per job; another may be prepared only after one was cancelled, failed or suppressed. Prepared only with the customer's current marketing permission on the channel, rechecked at send.
- **NOT CONFIGURED:** the review request's wording (no template of `review.request` is released) and the place reviews are left (no review link): staff may prepare a review request draft but not release it until the Owner releases the wording. The job-complete notice (MESSAGE 16, `job.complete`) is not wired here.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
