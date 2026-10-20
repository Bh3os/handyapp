---
id: OWN-DEC-98
type: decision
title: Staff questions: publishing releases an automatic notice
status: active
area: intake
links:
  related: ["[[OWN-DEC-95]]", "[[OWN-DEC-101]]", "[[HH-LEAD-03]]", "[[HH-COM-01]]", "[[HH-COM-02]]", "[[HH-COM-04]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]"]
source: "owner-answers-verbatim 2026-10-12T18:47:59.773Z [4.1 Questions]; decision-briefs 2026-10-12T18:48:55"
---
Owner, 2026-10-12, journey Step 4.1, staff questions.

Question asked:
> Step 4.1 - Staff questions to the customer: if a staff member needs more details (e.g. 'How tall is the ceiling?' or 'Please send a photo of the water damage'), they write a question in the project. The customer gets an automatic notice ('HandyHub has a question about your request', no private details in the email or text) and answers in the project workspace with text and photos. The question shows as 'Waiting on you' until answered. The notice sends automatically, like an access link. OK?

Owner wording:
> Yes, with these refinements:
>
> - Staff write and publish questions inside the correct project. Publishing is the staff release action; the notification then sends automatically without a second approval.
> - Send a brief notice through the customer’s permitted, preferred channel: “HandyHub has a question about your request. View and reply securely.” Keep private details out of email/text.
> - Link directly to the question through verified project access.
> - Show “Waiting on you” with a clear Reply action. Allow text, optional photos, and “I’m not sure” for measurements. Never ask customers to inspect hazardous areas.
> - Preserve reply drafts and successful photos if an upload fails.
> - After submission, show “Reply received—HandyHub will review it” and notify the assigned staff member. Other unanswered questions remain open.
> - Keep the question, replies, attachments, authors, and timestamps in project history.
> - Prevent duplicate notices on retries. Delivery failures appear in the staff queue without losing the question.
>
> Add published-question notices to the automatic-message exceptions. Other follow-ups remain staff-released drafts.
>
> Implement, test, and publish this on private staging using approved test destinations.

Effect:
- Staff write a question inside the correct project; publishing is the release, and the notice then sends automatically with no second approval. The published-question notice joins [[FACT-AUTOMATIC-MESSAGES]].
- The notice uses the customer's permitted, preferred channel with the exact text "HandyHub has a question about your request. View and reply securely." and no private details; it links straight to the question through verified project access.
- The customer sees "Waiting on you" with Reply; replies take text, optional photos and "I'm not sure" for measurements. Staff are warned in the composer never to ask customers to inspect hazardous areas.
- Reply drafts and successful photos survive a failed upload. After sending the customer sees "Reply received—HandyHub will review it" and the assigned staff member is notified; other open questions stay open.
- Questions, replies, attachments, authors and timestamps are kept in append-only project history.
- Retries never send duplicate notices; delivery failures appear in the staff queue without losing the question. Unanswered questions follow [[OWN-DEC-101]].

Links: uses [[FACT-AUTOMATIC-MESSAGES]].
