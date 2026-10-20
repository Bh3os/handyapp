---
id: HH-AUD-03
type: requirement
title: Requirement-to-evidence gap tracking with baseline failures recorded separately
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-130]]"]
  related: ["[[HH-TEST-01]]", "[[ARCH-STACK]]"]
source: "guide 2.1; OWN-DEC-130"
---
- For each requirement the work keeps a concise gap record: requirement ID, current evidence, missing behaviour, affected modules or files, data impact, and the planned test. In the rebuild this lives in the graph: tasks link the requirements they implement, and [[HH-TEST-01]] keeps the traceability.
- Pre-existing test failures are recorded separately from new failures and are never hidden.
- The rebuild in `Bh3os/handyapp` replaces "extend the current stack" ([[OWN-DEC-130]]): the stack is chosen once in [[ARCH-STACK]]. Working features and proven solutions of the frozen old repository are reused as source material where they fit; a further stack change needs a concrete incompatibility and a recorded decision.
