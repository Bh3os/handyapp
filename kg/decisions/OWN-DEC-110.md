---
id: OWN-DEC-110
type: decision
title: Invoice drafted automatically, issued after quality review, notice automatic
status: active
area: invoicing
links:
  related: ["[[OWN-DEC-64]]", "[[OWN-DEC-109]]", "[[OWN-DEC-112]]", "[[OWN-DEC-126]]", "[[HH-FIN-04]]", "[[HH-FIN-05]]", "[[HH-FIN-07]]", "[[HH-FIN-10]]"]
  uses: ["[[FACT-PAYMENT-DUE]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-PAYMENT-INSTRUCTIONS]]", "[[FACT-BUSINESS-NAME]]", "[[FACT-BUSINESS-ADDRESS]]", "[[INT-Square]]", "[[ENT-Invoice]]"]
source: "owner-answers-verbatim 2026-10-12T19:09:51.058Z [10.1 Invoice]; decision-briefs 2026-10-12T19:10:30"
---
Owner, 2026-10-12, journey Step 10.1, invoice.

Question asked:
> Step 10.1 - Invoice: after the owner's quality review passes, staff create the invoice from the job: the approved estimate lines, approved change orders, the deposit shown as a credit, and the balance due. No tax line, no minimum, no surcharge. Staff issue it; the customer gets an automatic 'Your HandyHub invoice is ready' notice (no amounts in email/text) and sees it in Documents and Payments. Invoice issuer details (business name, address) stay NOT CONFIGURED until you enter them, which blocks issuing. Should the invoice notice send automatically?

Owner wording:
> Prepare the invoice draft automatically from approved estimate lines, approved changes, and recorded deposit credits. After the required owner quality review, staff can issue it immediately—even while the team is still onsite.
>
> Issuing sends the invoice-ready notice automatically and makes the invoice available in Documents and Payments. Show the balance clearly inside the verified project workspace.
>
> For new projects, use “Payment due on receipt,” disclosed before estimate approval. Preserve payment terms already agreed with existing customers. Do not invent late fees.
>
> Provide:
> - **Pay by Card:** Open the invoice-specific Square payment link entered by staff. No Square API integration is required.
> - Clear instructions for other activated payment methods.
> - Staff controls to record verified onsite payments and send receipts immediately. Pending checks must not appear cleared.
>
> Stop payment reminders when the balance is paid. Prepare overdue follow-up drafts after 24 hours and 3 days for staff release.
>
> Add a simple business-details form so I can enter the invoice issuer’s actual name and address once. Real invoices require those details; private staging uses clearly labeled test details and sandbox payments.
>
> Prevent duplicate invoices/notices and double-crediting deposits. Implement, test, and publish on private staging.

Effect:
- The invoice draft is built automatically from approved estimate lines, approved change orders and recorded deposit credits. Staff can issue it immediately after the owner quality review passes ([[OWN-DEC-109]]), even while the team is onsite; issuing before the review is blocked.
- Issuing sends the "Your HandyHub invoice is ready" notice automatically, with no amounts in email or text ([[FACT-AUTOMATIC-MESSAGES]]), and shows the invoice in Documents and Payments with the balance in the verified workspace.
- Payment term: [[FACT-PAYMENT-DUE]]; it is disclosed before estimate approval for new projects and existing customers' agreed terms are kept (stored per customer/project). No late fees.
- "Pay by Card" opens the invoice-specific Square payment link that staff enter on the invoice (validated https Square URL); no Square API integration ([[INT-Square]]).
- Other decided methods show clear instructions; the Zelle, Cash App, Chime and check details are the labelled placeholders of [[FACT-PAYMENT-INSTRUCTIONS]] until the owner supplies them.
- Staff controls record verified onsite payments and send the receipt immediately; pending checks never look cleared. Payment reminders stop when paid and follow [[OWN-DEC-112]].
- A simple business-details form lets the owner enter the issuer name and address once (versioned). The name is [[FACT-BUSINESS-NAME]]; the address is missing ([[FACT-BUSINESS-ADDRESS]]). Staging uses clearly labelled TEST details and sandbox payments ([[OWN-DEC-126]]).
- No duplicate invoices or notices and no double-crediting of the deposit (unique constraints, idempotency, concurrency test).

Links: uses [[FACT-PAYMENT-DUE]], [[FACT-AUTOMATIC-MESSAGES]], [[FACT-PAYMENT-INSTRUCTIONS]], [[FACT-BUSINESS-NAME]], [[FACT-BUSINESS-ADDRESS]], [[INT-Square]], [[ENT-Invoice]].
