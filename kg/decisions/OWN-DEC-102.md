---
id: OWN-DEC-102
type: decision
title: Estimates written or uploaded by staff; no price book, no minimum charge
status: active
area: estimates
links:
  supersedes: ["[[OWN-DEC-06]]"]
  related: ["[[OWN-DEC-31]]", "[[OWN-DEC-32]]", "[[OWN-DEC-34]]", "[[OWN-DEC-118]]", "[[HH-EST-01]]", "[[HH-EST-02]]", "[[HH-EST-03]]", "[[HH-EST-04]]", "[[HH-EST-05]]", "[[HH-BASE-02]]"]
  uses: ["[[FACT-ESTIMATE-VALIDITY]]", "[[FACT-TAX-NO-LINE]]", "[[FACT-NO-MINIMUM]]", "[[FACT-NO-SURCHARGE]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-PAYMENT-DUE]]", "[[ENT-Estimate]]", "[[ENT-EstimateVersion]]"]
source: "owner-answers-verbatim 2026-10-12T18:53:23.426Z [5.1 Estimate]; decision-briefs 2026-10-12T18:53:59"
---
Owner, 2026-10-12, journey Step 5.1, estimate delivery.

Question asked:
> Step 5.1 - Estimate delivery: staff build the estimate (each job priced individually, line items in cents, no tax line, half-up rounding per line). Before sending, a readiness check blocks the send if anything is missing (price book active, terms approved, validity set). Sending is a staff action; the customer gets an automatic notice 'Your HandyHub estimate is ready', with no amounts in the email or text. In the project they see each line, options and exclusions, the total, the valid-until date (14 days from sending) and the deposit if one applies. OK?

Owner wording:
> Remove the price-book requirement. Authorized employees create each estimate manually using either:
>
> - **Write an Estimate:** Enter the scope, line items, prices, options, exclusions, and applicable deposit directly in the staff website.
> - **Upload an Estimate:** Upload a PDF or Word document, preview it, and enter the total, currency, deposit if applicable, and validity in structured fields.
>
> The upload restriction on customer request photos remains unchanged; estimate documents are a separate staff-only upload feature.
>
> Before publishing, require the employee to confirm that the document and structured amounts agree. Do not guess prices or totals from uploaded text. Convert Word documents to a customer-viewable PDF while retaining the original privately.
>
> Customers review and approve the exact published document/version or written estimate, including selected options and total. Preserve prior revisions; edits require a new version and approval.
>
> Keep 14-day validity, exact money calculations, no tax line, no minimum charge, and no card surcharge. Publishing sends the automatic estimate-ready notice.
>
> Implement both methods, test them, and publish on private staging.

Effect:
- The price-book requirement is removed: an inactive or absent price book never blocks estimate readiness or publishing. Each estimate is created manually by an authorized employee ([[OWN-DEC-118]]).
- "Write an Estimate": scope, line items, prices, options, exclusions and any deposit entered in the staff website, in integer cents ([[RULE-MONEY-CENTS]]).
- "Upload an Estimate": a PDF or Word document is uploaded and previewed, and the total, currency, deposit (if any) and validity are entered as structured fields. Amounts are never parsed or guessed from the document text. Before publishing the employee confirms that document and structured amounts agree; publishing is blocked without that confirmation.
- Word documents are converted to a customer-viewable PDF and the original is kept private (staff only). If no faithful converter exists in the deployment, publishing stays blocked until a PDF is supplied; never a fake success.
- Estimate documents are a staff-only upload with their own validation and private storage; the customer request-photo limits ([[OWN-DEC-91]]) are unchanged.
- Customers approve the exact published document version or written estimate with the selected options and total ([[OWN-DEC-103]]). Prior revisions are kept; any edit is a new version needing a new approval.
- Kept rules: [[FACT-ESTIMATE-VALIDITY]] (14 days), exact money arithmetic, [[FACT-TAX-NO-LINE]], [[FACT-NO-MINIMUM]] (supersedes the $150 minimum of [[OWN-DEC-06]], as [[OWN-DEC-31]] already did), [[FACT-NO-SURCHARGE]].
- Publishing sends the automatic "Your HandyHub estimate is ready" notice with no amounts in the email or text ([[FACT-AUTOMATIC-MESSAGES]]).
- The estimate also discloses the payment term "Payment due on receipt" for new projects ([[FACT-PAYMENT-DUE]], [[OWN-DEC-110]]).

Links: supersedes [[OWN-DEC-06]]; uses [[FACT-ESTIMATE-VALIDITY]], [[FACT-TAX-NO-LINE]], [[FACT-NO-MINIMUM]], [[FACT-NO-SURCHARGE]], [[FACT-AUTOMATIC-MESSAGES]], [[FACT-PAYMENT-DUE]], [[ENT-Estimate]], [[ENT-EstimateVersion]].
