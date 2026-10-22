---
id: OQ-CONFIRMATION-PRECONDITIONS
type: question
title: The confirmation-precondition details no decision gives
status: superseded
area: scheduling
links:
  related: ["[[HH-SCH-06]]", "[[HH-SCH-05]]", "[[ENT-Hold]]", "[[HH-LEAD-04]]", "[[HH-CRM-02]]", "[[HH-WORK-02]]", "[[OWN-DEC-82]]", "[[OWN-DEC-137]]", "[[TSK-0064]]", "[[TSK-0074]]", "[[TSK-0077]]"]
  superseded_by: ["[[OWN-DEC-192]]", "[[OWN-DEC-193]]", "[[OWN-DEC-167]]"]
source: "TSK-0064 (2026-10-21): HH-SCH-06 lists the preconditions; the details below are PROPOSED or not yet recorded anywhere"
---
**Answered by [[OWN-DEC-192]], [[OWN-DEC-193]], [[OWN-DEC-167]] (2026-10-21).**

**Question:** does the owner approve, or change, these PROPOSED details of the confirmation check, and how are the three site preconditions below recorded?

- **Who answers:** the owner.
- **Decided, in use ([[HH-SCH-06]]):** a staff confirmation, the customer's selection of an offered window and the reschedule of a confirmed visit each check, on the server inside their own transaction, the approval and accepted scope of a work visit, the deposit gate ([[HH-FIN-02]]), the capacity of the team within the visit hours, the expected duration and that no blocking hold is open; a refusal names every unmet item at once. An unresolved critical safety hold and a job-level Hold block confirmation; ordinary notes do not. The database refuses a confirmation while a blocking hold is open (migration 0057), so no role, flag or AI can bypass it ([[RULE-SAFETY-GATES]]).
- **PROPOSED, in use on private staging:**
  - An intake review hold ([[HH-LEAD-04]]) counts as blocking while it is open or under review, whatever its category (hazardous material, licensed trade, structural, permit or licensing, other), because the hazard or requirement it names is unresolved. It blocks every visit of its project, estimate visits included. Task blocks for critical shortages never block confirmation ([[HH-PKT-06]]).
  - The job-level Hold / Ready control and critical safety holds are written by [[TSK-0074]] and [[TSK-0077]]; the check already counts both kinds.
  - Offering windows also needs the approval and no blocking hold, so a customer is never offered times that cannot be confirmed. Planning or moving a tentative visit is planning, not a booking: holds never block it.
  - A work visit's approval is active while its project is approved (or completed, for follow-up and return work); a project under cancellation review, canceled or closed blocks confirmation.
  - The customer is told only that the time cannot be confirmed yet ("This time can't be confirmed yet, so nothing is booked. HandyHub needs to finish reviewing your project first."), or, when the deposit is due, "This time can't be confirmed until your deposit is received, so nothing is booked yet." followed by the [[HH-FIN-02]] deposit sentence. No hold, category or staff detail is shown.
  - Staff see each tentative visit's unmet items under "Not ready to confirm"; Confirm is offered only when nothing stops it.
- **Not checked yet (no record defines them):** "verified property address", "an authorized site contact" and "coverage accepted by staff". The property record keeps a last-confirmed date per detail and a free-text site contact ([[HH-CRM-02]]), but nothing records the contact's authority, and no staff act records that coverage was accepted (the ZIP checker never decides). Until the owner says which staff act satisfies each, confirmation does not wait for them.
- **Until answered:** the PROPOSED details above are used; each is a small code or catalog change.
