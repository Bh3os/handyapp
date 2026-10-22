---
id: HH-SCH-06
type: requirement
title: "Confirmation preconditions, the deposit gate and blocking holds"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-119]]", "[[OWN-DEC-104]]", "[[OWN-DEC-76]]", "[[OWN-DEC-82]]", "[[OWN-DEC-99]]", "[[OWN-DEC-100]]", "[[OWN-DEC-167]]", "[[OWN-DEC-179]]", "[[OWN-DEC-193]]"]
  depends_on: ["[[HH-FIN-02]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Hold]]", "[[ENT-DepositRequirement]]", "[[ENT-Property]]", "[[FACT-DEPOSIT-RULE]]", "[[FACT-VISIT-FEE]]"]
  tested_by: ["[[T36]]", "[[T40]]"]
  part_of: ["[[S05]]", "[[C07]]"]
source: "guide 14.2 HH-SCH-06; OWN-DEC-82, OWN-DEC-104, OWN-DEC-119"
---
Confirming a visit requires, checked on the server at commit:
- verified property address and an authorized site contact;
- coverage accepted by staff (the ZIP checker never decides);
- for a work visit, the accepted scope on the job;
- available assigned workers and equipment for the whole window ([[HH-SCH-04]]), within business visit hours;
- an estimated duration;
- for a work visit only, the required deposit satisfied: verified and cleared money allocated to it, or an owner waiver ([[HH-FIN-02]]). A check that has not cleared does not satisfy it. Estimate visits are free and never wait for a deposit or show a visit fee ([[FACT-VISIT-FEE]]).

Only two kinds of hold block confirmation: an unresolved critical safety hold, and an explicit blocking job-level Hold (the Hold / Ready control with its note, [[ENT-Hold]]). Ordinary notes and non-blocking warnings never prevent scheduling.

Missing job-start materials or tools may still allow a planning appointment; they stay visible as readiness blockers with an assigned resolution owner ([[HH-PKT-06]]).

A refusal names every unmet precondition.

**Changed by [[OWN-DEC-167]], [[OWN-DEC-179]], [[OWN-DEC-193]] (2026-10-21):** the three site checks are recorded checkboxes; SERVED needs no owner approval, EDGE and OUTSIDE need an owner exception; estimate visits need no approved job; follow-up visits on completed jobs need a recorded authorization.
