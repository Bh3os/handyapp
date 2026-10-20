---
id: HH-SVC-02
type: requirement
title: Publication is separate from operational readiness; inquiry-only services never auto-schedule
status: active
priority: P0
area: site
links:
  decided_by: ["[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-82]]", "[[OWN-DEC-122]]"]
  depends_on: ["[[HH-SVC-01]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SAFETY-GATES]]", "[[RULE-DECIDED-VALUES-ACTIVE]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-ServiceDefinition]]", "[[ENT-Hold]]"]
  tested_by: ["[[T40]]"]
  part_of: ["[[C01]]", "[[S08]]"]
source: "guide 6.1 HH-SVC-02; OWN-DEC-33, OWN-DEC-84, OWN-DEC-82, OWN-DEC-122"
---
- A service's public page state (draft, published to staging, owner-approved for production; [[HH-CUS-02]]) is stored separately from whether its work can be scheduled and started.
- All 26 services are in the launch set and can receive requests. Being in the launch set or having a published page never by itself makes work bookable or startable.
- Readiness to confirm and start a job is decided per job: the job-level Hold / Ready control with a note for unresolved requirements, the critical and blocking holds, and the Start Job gate. Legal or safety conditions still need resolution before affected work starts.
- An inquiry-only presentation is allowed only if the owner approved it, and it never auto-schedules as fully qualified work.
- No separate settings-activation workflow gates a service ([[RULE-DECIDED-VALUES-ACTIVE]]).
