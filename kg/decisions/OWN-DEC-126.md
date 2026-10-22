---
id: OWN-DEC-126
type: decision
title: Business name "Handyhub LLC"; no mailing address; placeholders for payment details and contact
status: active
area: business
links:
  related: ["[[OWN-DEC-43]]", "[[OWN-DEC-46]]", "[[OWN-DEC-47]]", "[[OWN-DEC-48]]", "[[OWN-DEC-49]]", "[[OWN-DEC-110]]", "[[OQ-LEGAL-ENTITY-NAME]]", "[[OQ-MAILING-ADDRESS]]", "[[OQ-PAYMENT-HANDLES]]", "[[OQ-PUBLIC-CONTACT]]", "[[HH-FIN-04]]", "[[HH-FIN-10]]", "[[HH-CUS-05]]", "[[OWN-DEC-183]]", "[[OWN-DEC-182]]"]
  uses: ["[[FACT-BUSINESS-NAME]]", "[[FACT-BUSINESS-ADDRESS]]", "[[FACT-PAYMENT-INSTRUCTIONS]]", "[[FACT-PUBLIC-CONTACT]]"]
source: "owner-answers-verbatim 2026-10-12T19:53:27.289Z [Issuer] [Pay info] [Contact]; decision-briefs 2026-10-12T19:53:38"
---
Partly replaced by [[OWN-DEC-183]], [[OWN-DEC-182]] (2026-10-21): the mailing address is given and entered in Business settings; payment handles are still not ready.

Owner, 2026-10-12, missing facts 1-3 (issuer, payment instructions, public contact).

Question asked:
> Missing fact 1 - Invoice issuer: what exact business name and mailing address should appear on real invoices and estimates? (Type it in Other. Until then, staging uses labeled TEST details.)

Owner wording:
> Use **Handyhub LLC** as the business name on estimates and invoices.
>
> I have not provided a business mailing address. Leave it blank; do not invent one or use a customer’s address.
>
> Keep the full workflow usable on private staging with documents clearly marked **TEST — not a real invoice or estimate**. Do not block unrelated features. If a mailing address is essential for issuing real documents, report that specific requirement separately.

Question asked:
> Missing fact 2 - Payment instructions: what should customers see for Zelle, Cash App and Chime (the handle, phone or email to pay to), and who checks are made out to? (Type them in Other.)

Owner wording:
> Leave editable placeholders for now:
>
> - Zelle: **[Payment email or phone]**
> - Cash App: **[$Cashtag]**
> - Chime: **[Payment handle or details]**
> - Checks payable to: **[Payee name]**
>
> I will provide the final values later. Keep the workflows functional on private staging, clearly label these as placeholders, and never present them as usable payment destinations.

Question asked:
> Missing fact 3 - Public phone number and email for the website, receipts and invoices: these are placeholders today (your earlier choice). Keep them as placeholders, or give the real ones (type them in Other)?

Owner wording:
> Keep placeholders

Effect:
- Estimates and invoices show the business name exactly "Handyhub LLC" ([[FACT-BUSINESS-NAME]]). The website brand stays "HandyHub" ([[OWN-DEC-46]]); the relation to the registered entity is open ([[OQ-LEGAL-ENTITY-NAME]]).
- The mailing address is not provided: the address line is omitted, never invented and never taken from a customer ([[FACT-BUSINESS-ADDRESS]]). Whether real documents legally need one is reported as a specific open requirement ([[OQ-MAILING-ADDRESS]]) and blocks nothing else.
- Staging documents (estimates, approval receipts, invoices, receipts) carry the mark "TEST — not a real invoice or estimate" on the PDF and in the portal view; the full workflow stays usable on staging.
- Payment instructions are the four editable placeholders of [[FACT-PAYMENT-INSTRUCTIONS]], labelled as placeholders (for example a "Placeholder — not a payment destination" badge, no copy button) and never presented as usable destinations; the owner edits them later in the business-details form ([[OQ-PAYMENT-HANDLES]]).
- The public phone number and email stay placeholders ([[FACT-PUBLIC-CONTACT]], [[OWN-DEC-43]], [[OWN-DEC-47]]; [[OQ-PUBLIC-CONTACT]]).

Links: uses [[FACT-BUSINESS-NAME]], [[FACT-BUSINESS-ADDRESS]], [[FACT-PAYMENT-INSTRUCTIONS]], [[FACT-PUBLIC-CONTACT]].
