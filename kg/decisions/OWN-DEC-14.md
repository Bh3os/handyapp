---
id: OWN-DEC-14
type: decision
title: Action contract for skill outputs
status: active
area: platform
links:
  related: ["[[HH-AUTO-03]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-AI-WAVE2]]"]
source: "vault-own-decisions.md OWN-DEC-14; owner facts L16 (2026-10-02)"
---
Owner wording (owner facts, 2026-10-02): "Return status (draft/proposed/verified/blocked), record IDs, source/version, as-of time/timezone, facts, assumptions, missing inputs, output, proposed actions, reviewer and next step. Never invent IDs or successful actions."

Effect:
- Every output of an AI skill or agent carries: a status (draft, proposed, verified or blocked), record IDs, source and version, as-of time and time zone, facts, assumptions, missing inputs, the output, proposed actions, the reviewer and the next step.
- IDs and successful actions are never invented; a failed or skipped action is reported as such.
