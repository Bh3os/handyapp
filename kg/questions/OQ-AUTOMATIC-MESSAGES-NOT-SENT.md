---
id: OQ-AUTOMATIC-MESSAGES-NOT-SENT
type: question
title: Two decided automatic messages have no event that sends them (estimate question answered, job complete)
status: open
area: messaging
links:
  related: ["[[HH-COM-06]]", "[[HH-PRIV-04]]", "[[HH-COM-12]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[OWN-DEC-151]]", "[[OWN-DEC-152]]", "[[HH-QA-09]]", "[[OQ-CLOSEOUT-DETAILS]]", "[[TSK-0110]]"]
source: "TSK-0110 (2026-10-26): review of the message catalogue (apps/server/src/modules/notifications/message-types.ts) against FACT-AUTOMATIC-MESSAGES rows 9 and 19"
---
**Question:** when exactly should the automatic "estimate question answered" (#9, `estimate_follow_up`) and "job complete" (#19, `job_complete`) messages send, and should the features that trigger them be built?

- **The gap.** [[FACT-AUTOMATIC-MESSAGES]] lists both as automatic, and SMS terms v2 list both texts ("A notice when HandyHub answers your question about an estimate", "A notice that your job is complete"). In the software:
  - #9 is triggered by `estimate_question.answer_released`, but no feature lets a customer ask a question about an estimate and staff release an answer; customers use Request Changes or a project message instead. Nothing emits the event.
  - #19 is triggered by `job.completion_authorized` ("authorized final completion only"), but no module emits that event: the Owner's quality review and the closeout record completion without it.
  - Neither message type supplies its template values (`supplied: []`), so even a released template would fail as `template_values_not_wired`.
- **Who answers:** the owner: which action is the "authorized final completion" (the passed quality review, or the Owner closing the job), and whether a customer question about an estimate is a feature of its own or a project message.
- **Until answered:** neither message is ever sent; nothing is shown to the customer or staff as sent. The SMS terms keep listing them (a promise of a text that does not come, not of one that comes unasked).
