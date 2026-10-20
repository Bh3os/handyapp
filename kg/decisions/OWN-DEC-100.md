---
id: OWN-DEC-100
type: decision
title: "Not a fit" decisions by staff with a reason category
status: active
area: intake
links:
  related: ["[[OWN-DEC-88]]", "[[OWN-DEC-51]]", "[[HH-LEAD-02]]", "[[HH-LEAD-04]]", "[[HH-CUS-03]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-RETENTION-SCHEDULE]]"]
source: "owner-answers-verbatim 2026-10-12T18:47:59.773Z [4.3 Decline]; decision-briefs 2026-10-12T18:48:55"
---
Owner, 2026-10-12, journey Step 4.3, out-of-area or declined work.

Question asked:
> Step 4.3 - Out-of-area or declined work: if the address is outside the service area, or the work is outside HandyHub's scope (e.g. licensed gas, electrical or plumbing, structural, asbestos/lead/mold), staff mark it 'Not a fit' with a reason. The customer sees a polite message: 'We're not able to take on this project', with the reason category and no referral to named companies. The project closes but stays visible to the customer. OK?

Owner wording:
> Yes, with these safeguards:
>
> - Staff—not the ZIP checker—decide whether an outside-area request can be accepted.
> - Assess the actual work before declining. Do not automatically reject an entire service category; some repairs may fit HandyHub’s approved scope while more complex work does not.
> - Use “Not a fit” with a reason category: coverage, work outside our scope, specialist assessment needed, or another documented reason. Keep internal risk notes private.
> - Show: “Thank you for considering HandyHub. We’re unable to take on this project because [plain-language reason].” Do not recommend named companies.
> - Closing the request keeps its summary, decision, and shared history visible through authorized customer access. Apply the retention schedule; do not delete it automatically.
> - If work was already accepted, an appointment exists, or money was received, route it to the owner for cancellation and financial review instead of simply closing everything.
> - Staff publish the decision; a brief automatic notice directs the customer to the project.
>
> Implement, test, and publish this on private staging.

Effect:
- Staff, never the ZIP checker, decide whether an outside-area request is accepted ([[OWN-DEC-88]]).
- Staff assess the actual work before declining; a whole service category is never rejected automatically. Licensed-trade and hazardous work stays out of scope ([[RULE-HUMAN-REVIEW]]).
- Reason categories: coverage, work outside our scope, specialist assessment needed, or another documented reason (free text required). Internal risk notes stay staff-only.
- Customer text: "Thank you for considering HandyHub. We're unable to take on this project because [plain-language reason]." Named companies are never recommended.
- Closing keeps the summary, decision and shared history visible through authorized customer access; [[FACT-RETENTION-SCHEDULE]] applies and nothing is deleted automatically.
- If work was accepted, an appointment exists or money was received, the request is routed to the owner for cancellation and financial review instead of closing.
- Staff publish the decision; a brief automatic notice points the customer to the project ([[FACT-AUTOMATIC-MESSAGES]]).

Links: uses [[FACT-AUTOMATIC-MESSAGES]], [[FACT-RETENTION-SCHEDULE]].
