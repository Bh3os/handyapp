---
id: OWN-DEC-189
type: decision
title: "Job costing: gross margin per job with an advisory flag below 30%"
status: active
area: payments
links:
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-MARGIN-TARGET]]"]
  related: ["[[HH-FIN-17]]", "[[HH-FIN-20]]", "[[OWN-DEC-125]]"]
source: "owner answers 2026-10-21 R10-Q4"
---
Owner answer (round 10, question 4), option chosen "Flag below 30%":

> Implement a configurable job-costing and profitability monitoring system for HandyHub.
>
> Requirements:
>
> 1. Set the initial target gross margin to 30%, configurable by the Owner.
> 2. Calculate job gross margin as `(Net Job Revenue - Direct Job Costs) / Net Job Revenue × 100`.
> 3. Track direct labor costs, employee burden where known, materials, subcontractors, equipment rentals, disposal, and directly attributable job expenses.
> 4. Account for approved discounts, change orders, credits, and refunds when calculating net job revenue.
> 5. Distinguish estimated costs from recorded actual costs.
> 6. Show estimated margin before publishing an estimate and actual margin as costs are recorded.
> 7. Flag jobs with margins below 30% on the Owner dashboard.
> 8. Treat the 30% threshold as an advisory warning, not an automatic prohibition on accepting or completing jobs.
> 9. Clearly identify incomplete cost data and avoid presenting provisional margins as finalized actual results.
> 10. Exclude deposits from revenue until they are appropriately recognized, and avoid double-counting payments.
> 11. Handle zero revenue, losses, and negative margins safely.
> 12. Display job price, direct costs, gross profit, gross margin, and variance from estimated margin.
> 13. Allow the Owner to review low-margin jobs and record reasons such as underpricing, material overruns, additional labor, or unexpected site conditions.
> 14. Keep overhead expenses and business net profitability separate from direct job gross margin.
> 15. Allow the CPA to review and refine accounting definitions and target margins later.
> 16. Test all calculations, discounts, change orders, partial payments, refunds, and cost adjustments in staging.
>
> The 30% threshold is a provisional business management target, not a guaranteed industry benchmark.
>
> Implement and test this functionality without requiring additional Owner approval for routine configuration.

Effect:
- Target gross margin 30%, configurable by the Owner ([[FACT-MARGIN-TARGET]]); margin = (net job revenue − direct job costs) / net job revenue × 100.
- Direct costs: direct labor, employee burden where known, materials, subcontractors ([[OWN-DEC-188]]), equipment rentals, disposal and directly attributable expenses. Net revenue accounts for approved discounts, change orders, credits and refunds. Labor cost needs a cost rate the Owner enters per worker; until one exists, labor cost and the margin show as incomplete, never as zero ([[HH-FIN-17]]).
- Estimated costs and recorded actual costs are kept apart: the estimated margin shows before an estimate is published (in the approval queue of [[OWN-DEC-173]]), the actual margin as costs are recorded; provisional margins are never shown as final.
- Jobs below 30% are flagged on the Owner Dashboard as an advisory warning, never a block; the Owner records reasons (underpricing, material overruns, extra labor, unexpected site conditions).
- Deposits count as revenue only once appropriately recognized, with no double counting (the recognition rule is the CPA's, [[OWN-DEC-186]]); zero revenue, losses and negative margins are handled safely; the view shows price, direct costs, gross profit, margin and variance from the estimate; overhead and business net profit stay separate.
- The 30% is a provisional management target, not an industry benchmark; the CPA may refine the definitions later; routine configuration needs no further owner approval.
- Answers [[OQ-MARGIN-BASIS]]. Built by [[TSK-0131]].
