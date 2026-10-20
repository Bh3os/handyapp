---
id: HH-SVC-01
type: requirement
title: Service registry with stable identities and versioned content
status: active
priority: P0
area: site
links:
  decided_by: ["[[OWN-DEC-33]]", "[[OWN-DEC-32]]", "[[OWN-DEC-102]]", "[[OWN-DEC-82]]", "[[OWN-DEC-84]]", "[[OWN-DEC-79]]", "[[OWN-DEC-108]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-LANGUAGES]]", "[[RULE-DECIDED-VALUES-ACTIVE]]"]
  uses: ["[[ENT-ServiceDefinition]]", "[[ENT-PolicyVersion]]"]
  tested_by: ["[[T05]]"]
  part_of: ["[[C01]]", "[[S08]]"]
source: "guide 6.1 HH-SVC-01, 6.2; OWN-DEC-33, OWN-DEC-32, OWN-DEC-102, OWN-DEC-82, OWN-DEC-84"
---
One registry holds the 26 services (`SVC-HI-01`..`SVC-HI-11`, `SVC-DW-01`..`SVC-DW-04`, `SVC-PT-01`..`SVC-PT-04`, `SVC-CL-01`..`SVC-CL-07`). Both websites, the request router and dispatch read it. Each service has:
- a stable ID and code that never changes (existing production identities kept; naming aliases reconciled), its category and its slug and aliases;
- the English public description and page content ([[HH-CUS-02]]) with version history;
- a bilingual staff label (English and Spanish);
- its public status, kept separate from operational readiness ([[HH-SVC-02]]);
- its request input schema: the service-specific questions with units and unknown options ([[HH-SVC-03]]);
- its estimating approach (remote or site visit) and preparation instructions;
- the mapping to its approved SOP version (`SOP-<code>`), hazards, quality checks, tools and materials, agreement and completion evidence. Job packets pin the exact versions.

Changed by later decisions:
- No price book or pricing-policy reference is required: each job is priced individually on its own written or uploaded estimate.
- No licence, certification or training-tracking fields are built. Unresolved requirements are handled by the job-level Hold / Ready control with a note.
- PT-04 (Wallpaper Removal & Surface Restoration) stays in the registry; its pricing, inventory, SOP, agreement and status are verified from the vault rather than dropped or assumed ready.
