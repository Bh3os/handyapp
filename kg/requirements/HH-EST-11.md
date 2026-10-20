---
id: HH-EST-11
type: requirement
title: "Write an Estimate or Upload an Estimate"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-102]]", "[[OWN-DEC-118]]", "[[OWN-DEC-146]]"]
  depends_on: ["[[HH-SEC-05]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-MONEY-CENTS]]"]
  uses: ["[[ENT-EstimateVersion]]", "[[ENT-Document]]", "[[INT-R2]]", "[[FACT-UPLOAD-LIMITS]]"]
  tested_by: ["[[T31]]", "[[T32]]"]
  part_of: ["[[S04]]"]
source: "OWN-DEC-102 (new behaviour; no guide id)"
---
Authorized employees create every estimate manually by one of two methods. An inactive or absent price book never blocks either.

**Write an Estimate:** the employee enters scope, line items, prices in cents, options, exclusions and any deposit directly in the staff app.

**Upload an Estimate:**
- The employee uploads a PDF or Word (.docx) document, previews it, and enters the total, currency, deposit if applicable and validity as structured fields.
- Estimate documents are a staff-only upload, separate from customer request photos (whose limits are unchanged). They have their own type validation, the 15 MB (15 MiB) per-file limit of [[FACT-UPLOAD-LIMITS]] ([[OWN-DEC-146]]), malware-safe handling and private storage ([[INT-R2]]).
- Amounts are never parsed or guessed from the document text.
- Before publishing, the employee must tick a confirmation that the document and the structured amounts agree; publishing without it is refused.
- A Word document is converted to a customer-viewable PDF inside the deployment, with no third-party conversion service. The original stays private to staff. If no faithful conversion is possible, publishing is blocked with the reason "PDF required" until a PDF is supplied; there is never a fake success.
- The customer reviews and approves the exact published document version and its structured total and options. Any change creates a new version needing a new approval.
