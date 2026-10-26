---
id: HH-AUTO-03
type: requirement
title: AI assistance for classification and drafting, under review and scoped inputs (wave 2, off)
status: open
priority: P1
area: platform
links:
  decided_by: ["[[OWN-DEC-74]]", "[[OWN-DEC-20]]", "[[OWN-DEC-15]]"]
  constrained_by: ["[[RULE-AI-WAVE2]]", "[[RULE-SERVER-AUTHZ]]"]
source: "guide 21.3; OWN-DEC-74"
---
Not enabled. AI stays off until the owner approves plan 33 and a provider ([[OWN-DEC-74]]); the tested "AI disabled" state is the current behaviour ([[RULE-AI-WAVE2]]). Built in that disabled state only ([[TSK-0117]]): each use's staff route is refused by the guardrail gateway with the manual path, staff screens say AI suggestions are off, and the person's review step (accept, edit or reject; never applied by the server) exists for when a suggestion could; details in [[OQ-AI-GUARDRAILS-DETAILS]].

When approved, AI may classify requests, draft responses, estimates and job packets, suggest scheduling, point out missing evidence or summarize performance, under these rules:
- it uses only authorized, scoped inputs and labels its assumptions;
- every consequential output goes to a human for review before it takes effect;
- it never gains permissions because it generated text;
- skills are instructions, not live integrations or background workers ([[OWN-DEC-15]]).
