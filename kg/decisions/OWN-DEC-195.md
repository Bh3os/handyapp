---
id: OWN-DEC-195
type: decision
title: "Rules Review C: who started a reschedule is required; arrival is not the start of contracted work; Office handles routine work-visit cancellations within policy"
status: active
area: scheduling
links:
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-SERVER-AUTHZ]]"]
  related: ["[[OWN-DEC-192]]", "[[OWN-DEC-161]]", "[[OWN-DEC-163]]", "[[FACT-CANCELLATION-RULES]]", "[[ROLE-MATRIX]]", "[[OQ-VISIT-CHANGE-DETAILS]]"]
source: "owner answers 2026-10-21 R12 (Rules Review)"
---
Owner answer (round 12, Rules Review), section verbatim:

> C — Rescheduling and Cancellation
> C2: Require the system to record whether the rescheduling was initiated by the customer or HandyHub and the reason.
> C4: Distinguish:
> * Worker arrived
> * Preparation started
> * Actual contracted work started
> * Work completed
> Arrival alone does not constitute commencement of contracted work.
> C6: Allow authorized Office staff to process routine customer-authorized work-visit cancellations that fall within an already approved policy, without requiring Owner approval for every ordinary cancellation.
> Require Owner approval for cancellation-fee waivers, refunds, disputed charges, exceptions to accepted terms, and significant contractual consequences.
> Maintain the previously approved cancellation rules:
> * Free estimate visits have no cancellation fee.
> * Work-visit late cancellation fee is capped at $50 where enforceable under accepted terms and applicable law.
> * A deposit smaller than $50 may be retained without invoicing the difference, subject to applicable rights.
> * Owner retains authority over refunds and waivers.
> Approve C1, C3, C5, C7, C8, and C9 as built.

Rules as built, as the owner reviewed them on the Rules Review page (2026-10-21):

- **C2** Who started a reschedule (the customer, or HandyHub because of weather, safety, a sick worker or other) is optional to record; for a cancellation it is required.
- **C4** "Work has started" means the job is past preparation or one of its work visits arrived or completed.
- **C6** Only the Owner cancels a work visit or confirms or declines a customer's cancellation of one; Office can cancel estimate visits.

Effect:
- C2: every reschedule records who initiated it (the customer or HandyHub) and the reason; it is no longer optional.
- C4: four separate markers: worker arrived, preparation started, actual contracted work started, work completed. Arrival alone is never the start of contracted work, so it never triggers the "after work started" cancellation outcome ([[FACT-CANCELLATION-RULES]]).
- C6: authorized Office staff process routine, customer-authorized cancellations of work visits that fall inside an already approved policy, without an owner approval each time. The Owner approves cancellation-fee waivers, refunds, disputed charges, exceptions to accepted terms and significant contractual consequences. The cancellation rules stay: estimate visits free of any fee ([[OWN-DEC-163]]); the work-visit late fee capped at $50.00 where enforceable; a deposit under $50.00 kept without invoicing the difference ([[OWN-DEC-161]]); refunds and waivers the Owner's. The matrix cell of work-visit cancellation changes with the policy data ([[ROLE-MATRIX]], [[TSK-0140]]).
- Built by [[TSK-0140]].
