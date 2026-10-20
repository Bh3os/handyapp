---
id: OWN-DEC-106
type: decision
title: Customer project workspace with six tabs
status: active
area: portal
links:
  related: ["[[OWN-DEC-97]]", "[[OWN-DEC-107]]", "[[OWN-DEC-111]]", "[[HH-PORT-01]]", "[[HH-PORT-02]]", "[[HH-PORT-03]]", "[[HH-PORT-06]]", "[[HH-PORT-08]]", "[[HH-DATA-07]]", "[[HH-SEC-05]]"]
  uses: ["[[FACT-PAYMENT-METHODS]]", "[[INT-Square]]"]
source: "owner-answers-verbatim 2026-10-12T19:01:14.144Z [6 Workspace]; decision-briefs 2026-10-12T19:01:51"
---
Owner, 2026-10-12, journey Step 6, project workspace.

Question asked:
> Step 6 - The project workspace (customer side): one page per project with tabs: Overview (status in plain words, e.g. 'Estimate approved — pay your deposit', and the next action), Messages (two-way with HandyHub, attachments), Documents (estimate versions, approval receipt, invoices, care notes), Photos (theirs plus before/after photos staff choose to share; internal photos stay private), Appointments, and Payments. A guest sees only that project; a verified account sees all their linked projects. OK?

Owner wording:
> Yes. Make the project workspace the customer’s central place to manage their work:
>
> - **Overview:** Plain-language status, one clear next action, latest update, confirmed appointment, and payment summary.
> - **Messages:** Two-way project conversation, permitted attachments, send/upload status, and retry without losing drafts.
> - **Documents:** Estimate revisions, approved estimate and terms, approval receipt, change orders, invoices, receipts, and care notes. Clearly distinguish current, approved, expired, and superseded versions.
> - **Photos:** Customer uploads and staff-approved shared before/after photos. Internal photos remain inaccessible—not merely hidden.
> - **Appointments:** Estimate visits and work visits, date/window, preparation, and request-reschedule/cancel actions. Requests do not erase existing confirmed bookings.
> - **Payments:** Approved total, deposit status, recorded payments, credits, and remaining balance. Square payments are recorded manually by authorized staff; do not mark paid from a customer claim alone.
>
> Guests access only their verified project. Account customers can switch between authorized linked projects. Optional registration preserves existing records without duplicates.
>
> On phones, keep Overview first and use simple tab navigation. Show empty sections helpfully and preserve drafts when switching tabs. Keep customer content English.
>
> Implement, test, and publish the complete workspace on private staging.

Effect:
- One workspace per project with the six tabs above: Overview, Messages, Documents, Photos, Appointments, Payments.
- Overview: plain-language status, one clear next action, latest update, confirmed appointment and payment summary.
- Documents distinguish current, approved, expired and superseded versions.
- Internal photos are inaccessible on the server (URLs and IDs included), not merely hidden; tested by direct access.
- Appointments carry "Request to Reschedule" / "Request Cancellation" ([[OWN-DEC-107]]); a request never erases a confirmed booking.
- Payments: approved total, deposit status, recorded payments, credits, remaining balance. Square payments are recorded manually by authorized staff; nothing is marked paid from a customer claim (any "I paid" action only creates a staff task).
- Guests reach only their verified project; account customers switch between authorized linked projects; registering later keeps records without duplicates ([[OWN-DEC-97]]).
- On phones Overview comes first with simple tab navigation (accessible tabs pattern); empty sections are helpful and drafts survive tab switches. Customer content is English.

Links: uses [[FACT-PAYMENT-METHODS]], [[INT-Square]].
