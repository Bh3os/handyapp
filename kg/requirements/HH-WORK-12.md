---
id: HH-WORK-12
type: requirement
title: "Worker sequence from Arrived to Awaiting quality review"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-109]]", "[[OWN-DEC-68]]", "[[OWN-DEC-75]]", "[[OWN-DEC-121]]", "[[OWN-DEC-149]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Job]]", "[[ENT-Photo]]", "[[ENT-TimeStamp]]", "[[ENT-Walkthrough]]", "[[ENT-QAInspection]]"]
  tested_by: ["[[T55]]", "[[T47]]", "[[T46]]"]
  part_of: ["[[C08]]", "[[C09]]", "[[S07]]"]
source: "OWN-DEC-109 (new behaviour; no guide id)"
---
The sequence is enforced on the server and in the offline app:
1. **Arrived:** the worker's arrival timestamp ([[HH-WORK-06]]). Between Arrived and Finished there are no interval check-ins, even for a worker alone ([[OWN-DEC-149]]).
2. **Safety checks:** site conditions, hazards, PPE, tools and materials. An unresolved critical hold blocks work.
3. **Before photos:** work areas and existing damage, labelled by area or task. Only the upload-failure exception ([[HH-WORK-03]]) lets captured photos stay pending.
4. **Start Work:** once the checks and before-photo requirements pass, the job checklist unlocks ([[HH-WORK-11]]).
5. **Perform the work:** ordered SOP steps, each saved with its required evidence.
6. **After photos:** the same areas, paired with the before photos where possible.
7. **Walkthrough:** "Everything looks good", "Accepted with follow-up items", "I have a concern" or "Customer unavailable", with comments and the identity of the customer or authorized representative ([[HH-QA-03]]). Absence or silence is never acceptance.
8. **Finished:** the finish timestamp; the job moves to `ready_for_qa`, shown as "Awaiting quality review", never automatically complete. It cannot be submitted while required evidence is still pending upload.
9. **Owner quality review** ([[HH-QA-02]]).
10. **Customer handoff:** selected before/after photos and approved, job-specific care notes are shared in the workspace ([[HH-QA-05]]); the satisfaction-check draft follows [[HH-QA-10]].

Original photos and checklist history are kept unchanged. Sharing with the customer never grants marketing permission.
