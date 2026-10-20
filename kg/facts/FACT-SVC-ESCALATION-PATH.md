---
id: FACT-SVC-ESCALATION-PATH
type: fact
title: "Escalation path for every HandyHub service"
status: active
area: safety
links:
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  decided_by: ["[[OWN-DEC-80]]", "[[OWN-DEC-149]]"]
  related: ["[[FACT-SVC-STOP-WORK-RULE]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop-picture-hanging.md section 19 (same text in all 26 SOPs); owner-answers-verbatim.md 2026-10-05T18:03:06Z and 18:17:56Z"
---
The escalation steps as written in section 19 of all 26 vault SOPs (PROPOSED wording, pending qualified review):

> 1. Stop the affected work and keep yourself, occupants and pets away from the hazard; do not try to fix, move or disturb it (source: spec START-011; risk-triage playbook L7).
> 2. Emergency (fire, gas odor, injury, electrical contact, structural movement): call emergency services first, then `<owner decision: emergency contact>` (source: spec BRF-013).
> 3. Only if policy allows and it is safe, take the minimum action needed to prevent immediate injury or property damage, and record why and what you did (source: spec JOB-006).
> 4. Report in the app with Stop Work / Report Hazard: type, photos and severity (source: spec JOB-004, UXE-004). Before the job has started, record No Start / Blocked instead of starting (source: spec SCH-008, AT-030).
> 5. Escalate with one tap to `<owner decision: escalation order>`; the item enters the owner/supervisor queue (source: spec UXE-002, JOB-012).
> 6. Wait for release by the role named in the hold, with evidence recorded. Critical holds clear only with a recorded qualified assessment (source: owner facts 2026-10-02; 27 Roles and permissions section 6.3).
> 7. Tell the customer only what the approved "work blocked" message says; never send incident details or access codes by text or email (source: spec NTF-007, COM-002).
> 8. Resume only after the briefing is updated and re-acknowledged, with a change order if scope or price changes (source: spec START-002, FIN-008, JOB-005).

Owner answers of 2026-10-05 that fill parts of this path:
- "If a worker reports a hazard, injury or stop-work and cannot reach you, who is the backup? (Work stays stopped; 911 always first for emergencies.)" = "My field worker".
- "How should urgent field alerts (hazard, injury, stop-work) and system alerts reach you?" = "Text + app alert (Recommended)".
- Lone work: no interval check-ins; a worker alone records only Arrived and Finished ([[OWN-DEC-149]]).
- "After a non-critical stop clearly ends (storm passed, dog secured), who decides to resume?" = "Lead worker on site". Critical holds clear only with a recorded qualified assessment ([[RULE-SAFETY-GATES]]).
