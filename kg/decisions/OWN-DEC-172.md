---
id: OWN-DEC-172
type: decision
title: "Escalation: owner first, 911 immediately for emergencies; Call Owner and Call 911 in every job packet"
status: active
area: safety
links:
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-SVC-ESCALATION-PATH]]"]
  related: ["[[OWN-DEC-80]]", "[[OWN-DEC-149]]", "[[HH-WORK-13]]", "[[HH-PKT-09]]"]
source: "owner answers 2026-10-21 R6-Q3"
---
Owner answer (round 6, question 3), option chosen "Other: Owner-First Escalation with Emergency Exception". The owner's phone number given with the answer is personal data: it is entered by the Owner in their own staff profile and is not stored in the repository.

> Implement this as HandyHub's standard incident and emergency escalation procedure across all employee job packets.
>
> **1. Owner-first policy**
> For all non-life-threatening problems, employees must stop the affected work, make the area safe if they can do so without risk, and contact the Owner first.
>
> The Owner will assess the situation and determine the appropriate next steps, including whether to contact emergency services, arrange specialist assistance, pause the job, or authorize a safe resolution.
>
> **2. Immediate emergency exception**
> Employees must call 911 immediately without waiting for Owner approval if there is an actual or reasonably suspected immediate threat to life or serious injury, including serious medical emergencies, fire, dangerous gas leaks, or other imminent hazards.
>
> Employees must never delay emergency assistance to obtain permission.
>
> Notify the Owner as soon as it is safe.
>
> **3. Owner decision authority**
> For non-emergency incidents, only the Owner may authorize significant operational decisions, including:
> - Resuming work after applicable safety holds.
> - Approving changes to project scope or pricing.
> - Determining next steps following property damage.
> - Approving customer-facing incident communications.
> - Arranging outside specialists or additional assistance.
>
> Owner decisions cannot override mandatory legal requirements, emergency procedures, employee safety protections, or worker qualification restrictions.
>
> **4. Owner unavailable**
> If the Owner cannot be reached and the issue is not an emergency, employees must keep affected work paused, secure the area if safe, and document the problem.
>
> If conditions become dangerous or emergency assistance is warranted, call 911 immediately.
>
> **5. Job packet**
> Display two prominent actions:
> - **Call Owner — Report a Problem**
> - **Call 911 — Immediate Emergency**
>
> Retrieve the Owner's phone number securely from the authorized staff profile.
>
> **6. Spanish employee instructions**
> Provide the following clear instructions in the Spanish staff portal:
>
> "Si ocurre un problema, detén el trabajo afectado y llama primero al propietario para recibir instrucciones. Si hay una emergencia médica grave, un incendio, una fuga peligrosa de gas o cualquier peligro inmediato para la vida, llama al 911 sin esperar autorización. Avisa al propietario cuando sea seguro hacerlo."
>
> **7. Audit and testing**
> Record incident reports, escalation actions, Owner decisions, and required authorizations.
>
> Test emergency and non-emergency scenarios, Owner unavailability, safety holds, and Spanish mobile instructions.
>
> Implement and verify this workflow in private staging.

Effect:
- Standard procedure in every job packet. A problem that is not life-threatening: stop the affected work, make the area safe only if that is possible without risk, and contact the Owner first; the Owner decides the next steps.
- Emergency exception: call 911 immediately, without waiting for approval, for an actual or reasonably suspected immediate threat to life or serious injury (serious medical emergency, fire, dangerous gas leak, other imminent hazard); emergency help is never delayed for permission; the Owner is told as soon as it is safe ([[HH-WORK-13]]).
- For non-emergencies only the Owner authorizes resuming after safety holds, scope or price changes, next steps after property damage, customer-facing incident communications and outside specialists. No owner decision overrides legal requirements, emergency procedures, worker safety protections or qualification limits; critical holds still clear only with a recorded qualified assessment ([[RULE-SAFETY-GATES]]).
- Owner unreachable and no emergency: the affected work stays paused, the area is secured if safe and the problem is documented; if it becomes dangerous, call 911. Reading: the 2026-10-05 backup answer ("My field worker", [[FACT-SVC-ESCALATION-PATH]]) is not part of this procedure.
- The packet shows two prominent actions, "Call Owner — Report a Problem" and "Call 911 — Immediate Emergency". The Owner's number is read securely from the Owner's staff profile.
- The Spanish staff portal shows the owner's Spanish instruction exactly as given (item 6).
- Incident reports, escalation actions, owner decisions and authorizations are recorded; tests cover emergency and non-emergency cases, an unreachable Owner, safety holds and the Spanish mobile text.
- Fills `<owner decision: emergency contact>` and `<owner decision: escalation order>` of [[FACT-SVC-ESCALATION-PATH]] ([[OQ-PACKET-DETAILS]]). The SOP wording itself stays pending competent safety review ([[OQ-SAFETY-REVIEW]]).
- Built by [[TSK-0129]]; the Stop Work guidance with [[TSK-0077]].
