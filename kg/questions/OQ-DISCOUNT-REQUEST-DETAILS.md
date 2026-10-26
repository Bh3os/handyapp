---
id: OQ-DISCOUNT-REQUEST-DETAILS
type: question
title: The discount request and verification details no decision gives
status: open
area: estimates
links:
  related: ["[[HH-EST-15]]", "[[OWN-DEC-165]]", "[[OWN-DEC-145]]", "[[FACT-PRICING-DISCOUNTS]]", "[[FACT-DEPOSIT-RULE]]", "[[HH-CRM-04]]", "[[ROLE-MATRIX]]", "[[TSK-0125]]"]
source: "TSK-0125 (2026-10-25): OWN-DEC-165 and HH-EST-15 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of discount requests and their verification?

- **Who answers:** the owner.
- **Decided, in use:** 10% for service members, veterans and military spouses, for seniors 60 or older, and for returning customers with a completed job in the preceding 12 months; one per job, chosen by the customer, never stacked; requested at submission and shown as pending verification; never approved from a checkbox alone; staff verify visually and record only the category, the result, the verifier and the time; no document is photographed, copied, uploaded or kept, and no ID number, Social Security number or full date of birth is collected; returning customers are found from matched completed jobs; the Owner reviews what the standard process cannot verify; the discount is the totals row on the subtotal ([[OWN-DEC-145]]); the deposit is computed on the discounted total; an approved price is never raised silently; applications, verifications and owner overrides are audited; no verification detail in any message ([[OWN-DEC-165]], [[HH-EST-15]]).
- **PROPOSED, in use on private staging:**
  - **Approval waits for verification.** Of the two ways [[OWN-DEC-165]] allows, the first is used: an estimate may be published with a requested discount that is still pending (marked "Pending verification" for the customer, a provisional discount), but the customer can approve it only once the discount is verified. So an approved price never rests on an unverified discount, and no approved price is ever changed by a later verification. Once any estimate version of the project is approved, nothing more is recorded on its discount.
  - **Failed verification.** "Not verified", or the Owner's decline, keeps the published estimate from being approved; the customer sees that an updated estimate follows. The staff queue gets "Estimate to revise: discount not verified" (Owner, Estimator). A revision leaves the discount out; publishing it resolves the item, and the customer approves the revised estimate.
  - **Only the requested discount.** An estimate version may carry only the discount the customer chose on the request form; publishing refuses another one (or one on a project whose customer asked for none). Staff cannot add a discount request later on the customer's behalf (for example a phone call); if the Owner wants that, it is a small addition.
  - **Who records.** The Owner, Office and Estimator record a verification result and send a case to owner review (`discount.verify`; Office and Estimator are PROPOSED cells of [[ROLE-MATRIX]]). The Owner alone approves or declines an owner review and may override any recorded result before approval (`discount.decide`). Workers do not record verifications.
  - **Recorded once.** A staff result (Verified, Not verified) is recorded once, while the discount is pending; changing it afterwards is the Owner's decision. Owner review is offered while the discount is pending or not verified, and opens "Discount owner review" in Owner Decisions.
  - **Returning customer check.** Staff press **Check job history**; the server records Verified when the customer, as staff linked the records ([[HH-CRM-04]]: merges and request relinks, never an automatic match), has another project whose job is operationally complete or closed and whose quality review passed on or after the same calendar date 12 months earlier (business time zone). A reopened job does not count; no job is "voided" in this build. With no match it records Not verified, and the check may be run again after records are linked. The staff member who ran the check is the verifier.
  - **Request form wording** (customer catalog; the share, the age and the months come from configuration):
    - "Discount (optional)"
    - "HandyHub offers a 10% discount for military members, seniors and returning customers. Only one 10% discount applies per job, so if you qualify for more than one, choose one."
    - Choices: "No discount"; "Military: service members, veterans and military spouses"; "Senior: 60 or older"; "Returning customer: a completed HandyHub job in the last 12 months".
    - "A discount you request is pending verification until we confirm it. For a military or senior discount, we look at your documentation or photo ID; we never photograph, copy or keep it, and we don't ask for ID numbers, Social Security numbers or your full date of birth. We check returning-customer eligibility from your HandyHub job history. If you don't have proof available, you can ask for an owner review."
    - Review row: "Discount requested: Senior (pending verification)".
  - **Portal wording:** "Pending verification" beside the discount row; "This discount is pending verification. We confirm eligibility before you approve this estimate. If you don't have proof available, contact us to ask for an owner review."; approval reasons "The discount on this estimate is pending verification. You can approve the estimate once it is confirmed." and "We could not confirm the discount on this estimate. We'll send you an updated estimate to review."
  - **The customer PDF** keeps the decided row "Discount (category) -10%" ([[OWN-DEC-145]]); the pending state is shown in the portal and on staff screens, not printed on the PDF.
  - **Queue bands.** Both discount items are in the "other" band.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
