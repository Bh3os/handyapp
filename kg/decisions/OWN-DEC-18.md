---
id: OWN-DEC-18
type: decision
title: Check current primary sources; verify the municipality
status: active
area: safety
links:
  related: ["[[HH-EST-05]]", "[[HH-WORK-02]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault-own-decisions.md OWN-DEC-18; owner facts L21 (2026-10-02)"
---
Owner wording (owner facts, 2026-10-02, as recorded): "Check current primary sources for changing legal, safety, tax, product and provider claims; record source, date, jurisdiction and applicability." The line names the EPA RRP, EPA asbestos and OSHA sources and ends: "Verify the actual Kentucky/Indiana municipality; do not assume statewide trade permissions."

Effect:
- Changing legal, safety, tax, product and provider claims are checked against current primary sources, recording source, date, jurisdiction and applicability.
- The actual municipality of each job is verified; no statewide trade permission is assumed.
- Screening triggers (for example a pre-1978 or unknown build year) are conservative holds, not legal conclusions. An unknown permit or qualification status blocks Start Work.

Partly replaced by [[OWN-DEC-82]]: there is no license or permit tracking module; the owner checks requirements outside the software and uses the job-level Hold / Ready control.

Open:
- Licensed-trade and permit boundaries per municipality: [[OQ-PERMITS-LICENSING]].
