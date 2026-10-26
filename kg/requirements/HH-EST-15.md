---
id: HH-EST-15
type: requirement
title: "Discount requested at submission, verified by staff, applied once"
status: active
priority: P1
area: estimates
links:
  decided_by: ["[[OWN-DEC-165]]"]
  depends_on: ["[[HH-EST-03]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[FACT-PRICING-DISCOUNTS]]", "[[FACT-DEPOSIT-RULE]]", "[[ENT-Request]]", "[[ENT-EstimateVersion]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T31]]"]
  part_of: ["[[C02]]", "[[S04]]"]
source: "OWN-DEC-165 (new behaviour; no guide id)"
---
- The request form lets the customer request one discount (military, senior or returning customer) with its eligibility requirements shown; the request is marked pending verification. Only one discount per job.
- Military and senior discounts are never approved from the checkbox: authorized staff record the category, the verification result, the verifier and the time, and nothing else (no document image, ID number, Social Security number or full date of birth). Returning-customer eligibility is computed from securely matched completed, non-voided jobs in the last 12 months. The Owner reviews cases that cannot be verified.
- The discount is the separate discount row of the estimate totals ([[FACT-PRICING-DISCOUNTS]]), applied once to eligible labor and service charges; a provisional discount whose verification fails leads to a revised estimate the customer approves; an approved price is never raised silently; the deposit is computed on the approved discounted total.
- Every application, verification and owner override is audited; no verification detail appears in any message.

**Built by [[TSK-0125]] (2026-10-25):** migration 0105. The request form's contact step offers the discounts of `discount.rule` with their eligibility (`discount.eligibility_verification`); the choice is saved with the request (`estimating.discount_requests`) and shown as pending verification on the request, the estimate builder and the customer's estimate. Staff record each result in `estimating.discount_verifications` (category, result, verifier, time). An estimate may carry only the requested discount; it is published while pending (provisional) or verified, never once verification failed, and approved only once verified (server and database). A failed verification opens "Estimate to revise: discount not verified"; the revision drops the discount and the customer approves it. The Owner's review and overrides are in Owner Decisions. PROPOSED details: [[OQ-DISCOUNT-REQUEST-DETAILS]].
