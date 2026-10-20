---
id: HH-AUTO-04
type: requirement
title: AI guardrails for untrusted input, authorization outside the model, bounded steps and manual fallback (wave 2, off)
status: open
priority: P1
area: security
links:
  decided_by: ["[[OWN-DEC-74]]", "[[OWN-DEC-15]]"]
  depends_on: ["[[HH-AUTO-03]]"]
  constrained_by: ["[[RULE-AI-WAVE2]]", "[[RULE-SERVER-AUTHZ]]"]
source: "guide 21.3; OWN-DEC-74"
---
Not built; designed when the owner approves plan 33 and a provider ([[OWN-DEC-74]]).

When AI is enabled:
- customer text, photos and documents are untrusted data, never instructions to the model;
- authorization and validated tool arguments live outside the model;
- model and tool steps, cost, retries, privacy destinations (what data may go to which provider) and allowed output actions are bounded;
- a deterministic or manual fallback exists for every AI-assisted step.
