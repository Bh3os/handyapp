---
id: HH-FIN-04
type: requirement
title: "Invoice contents, issuer details and the invoice-ready notice"
status: active
priority: P0
area: invoicing
links:
  decided_by: ["[[OWN-DEC-110]]", "[[OWN-DEC-126]]", "[[OWN-DEC-83]]", "[[OWN-DEC-89]]", "[[OWN-DEC-131]]", "[[OWN-DEC-135]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-LANGUAGES]]", "[[FACT-TAX-NO-LINE]]"]
  uses: ["[[ENT-Invoice]]", "[[ENT-PolicyVersion]]", "[[ENT-Message]]", "[[FACT-BUSINESS-NAME]]", "[[FACT-BUSINESS-ADDRESS]]", "[[FACT-PAYMENT-DUE]]", "[[FACT-PAYMENT-INSTRUCTIONS]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-PUBLIC-CONTACT]]", "[[FACT-WARRANTY]]"]
  tested_by: ["[[T58]]"]
  part_of: ["[[C10]]"]
source: "guide 20.2 HH-FIN-04; OWN-DEC-110, OWN-DEC-126"
---
- An invoice holds: a unique never-reused number; issuer; customer; billing and service addresses as needed; job and approved-scope links; issue date and due term; lines; approved fees; credits; allocated deposit and payments; outstanding balance; status; delivery state; payment instructions ([[HH-FIN-10]]); the 90-day workmanship warranty ([[FACT-WARRANTY]]) in its attorney-reviewed wording. No tax line.
- The issuer name and address come from a Business details form the Owner fills in once, versioned ([[FACT-BUSINESS-NAME]]). The mailing-address line is omitted while [[FACT-BUSINESS-ADDRESS]] is missing; if a real invoice legally needs it, that is reported to the Owner as one specific requirement and blocks nothing else. The business phone and email on invoices and receipts come from [[FACT-PUBLIC-CONTACT]] and show as labelled placeholders until the owner provides real values.
- The due term is "Payment due on receipt" for new projects, or the term already agreed with an existing customer ([[FACT-PAYMENT-DUE]]). No late fees.
- Customer invoices are English; card payment may name Square.
- On staging every invoice and receipt carries "TEST — not a real invoice or estimate" and uses labeled test details and sandbox payments only.
- Issuing makes the invoice available in the workspace Documents and Payments tabs and sends "Your HandyHub invoice is ready" automatically ([[FACT-AUTOMATIC-MESSAGES]]), with no amounts in the email or text; the balance shows in the verified workspace. One notice per invoice.
