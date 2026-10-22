---
id: OWN-DEC-165
type: decision
title: "Discounts: 10% for service members, veterans and military spouses, seniors 60+ and returning customers; staff verify; one per job"
status: active
area: estimates
links:
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
  uses: ["[[FACT-PRICING-DISCOUNTS]]", "[[FACT-DEPOSIT-RULE]]"]
  related: ["[[OWN-DEC-66]]", "[[OWN-DEC-145]]", "[[HH-EST-15]]"]
source: "owner answers 2026-10-21 R4-Q4"
---
Owner answer (round 4, question 4), option chosen "Spouses yes, staff checks ID (Recommended)":

> Choose **Spouses yes, staff checks ID (Recommended)**, with the following implementation requirements.
>
> Implement HandyHub's discount policy:
>
> **1. Discount eligibility**
> - Military discount: 10% for eligible military service members, veterans, and military spouses.
> - Senior discount: 10% for customers aged 60 or older.
> - Returning customer discount: 10% for customers with at least one qualifying completed and non-voided HandyHub job within the preceding 12 months.
> - Only one 10% discount may be applied per job. Discounts cannot be stacked.
>
> **2. Customer request process**
> - Allow customers to request an eligible discount during estimate submission.
> - Clearly label requested discounts as pending verification.
> - Never automatically approve military or senior discounts based solely on a customer selecting a checkbox.
>
> **3. Verification**
> - Allow authorized staff to visually verify acceptable military, veteran, or spouse eligibility documentation.
> - Military spouses qualify when appropriate eligibility documentation is presented.
> - Verify senior eligibility through an acceptable government-issued photo ID or other reasonable age-verification method.
> - Do not photograph, scan, photocopy, upload, or retain military identification cards.
> - Do not collect Social Security numbers, military ID numbers, or full dates of birth solely for discounts.
> - Record only the discount category, verification result, authorized verifier, and timestamp.
> - Automatically determine returning-customer eligibility through securely matched completed job history.
> - Allow owner review when eligibility cannot be verified through the standard process.
>
> **4. Pricing and estimate workflow**
> - Show the discount as a separate line on the estimate.
> - Apply the discount once to eligible labor and service charges, excluding deposits, fees, and other explicitly excluded items according to the approved pricing policy.
> - Verify eligibility before the final discounted estimate is approved, or clearly mark the discount as provisional and require a revised estimate if verification changes the price.
> - Never silently increase a customer-approved price after an unsuccessful verification.
> - Require customer approval for any revised estimate that changes the total.
> - Calculate deposits from the approved discounted total where applicable.
> - Preserve a full audit trail of discount applications and owner-authorized overrides.
>
> **5. Customer experience**
> - Clearly display the available discounts and their eligibility requirements.
> - Let customers choose only one discount per job.
> - If they qualify for multiple discounts, explain that only one 10% discount applies.
> - Never expose military or age-verification details in customer emails.
> - Treat customers respectfully and offer an owner-review process when proof is unavailable.
>
> Implement and test these rules in private staging before enabling them in production.

Effect:
- Military 10%: eligible service members, veterans and military spouses. Senior 10%: 60 or older. Returning customer 10%: at least one qualifying completed, non-voided HandyHub job in the preceding 12 months. One discount per job, never stacked; all three are 10%, so the customer chooses one.
- The customer may request one when submitting; it shows as pending verification and is never approved from a checkbox alone (military or senior).
- Staff verify visually: military, veteran or spouse documentation; a government-issued photo ID or other reasonable age check for seniors. Military ID cards are never photographed, scanned, copied, uploaded or kept; no Social Security number, military ID number or full date of birth is collected for a discount. Only the category, the result, the verifier and the time are recorded. Returning-customer eligibility is found automatically from securely matched completed jobs. The Owner reviews cases the standard process cannot verify.
- Pricing: the discount is shown on its own, as the separate discount row of the totals ([[OWN-DEC-145]]; lines stay above $0.00), applied once to eligible labor and service charges, excluding deposits, fees and items the pricing policy excludes ([[FACT-PRICING-EXTRA-COSTS]]: no separate fee exists today). Eligibility is verified before the discounted estimate is approved, or the discount is marked provisional and a revised estimate is issued if verification changes the price; an approved price is never raised silently; a changed total needs the customer's approval; the deposit is computed on the approved discounted total ([[FACT-DEPOSIT-RULE]]); every application and owner override is audited.
- Customers see the available discounts and their requirements; verification details never appear in emails; customers without proof are offered owner review, respectfully.
- Answers [[OQ-DISCOUNT-ELIGIBILITY]]. Updates [[FACT-PRICING-DISCOUNTS]]. Built by [[TSK-0125]].
