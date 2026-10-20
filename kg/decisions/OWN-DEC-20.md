---
id: OWN-DEC-20
type: decision
title: AI features are a second wave; the AI module stays disabled
status: active
area: platform
links:
  related: ["[[HH-AUTO-03]]", "[[HH-AUTO-04]]"]
  constrained_by: ["[[RULE-AI-WAVE2]]"]
source: "vault-own-decisions.md OWN-DEC-20; owner message 2026-10-04 (HANDOFF section 2)"
---
Owner wording (project chat, 2026-10-04): "AI features are a second wave: keep the AI module disabled for now."

Effect:
- The product builds only the tested "AI disabled" state and deterministic, non-AI automation.
- No AI provider is integrated until the owner approves the AI governance plan (plan 33).
- AI used by the developers while building (translation checks, drafts, accessibility testing: [[OWN-DEC-79]], [[OWN-DEC-81]], [[OWN-DEC-84]], [[OWN-DEC-85]]) is not a runtime AI feature.

Reaffirmed by [[OWN-DEC-74]].
