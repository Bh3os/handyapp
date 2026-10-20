---
id: HH-ARC-02
type: requirement
title: Shared application and domain layer in one modular application
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-130]]", "[[OWN-DEC-120]]", "[[OWN-DEC-123]]", "[[OWN-DEC-124]]"]
  depends_on: ["[[HH-ARC-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-AI-WAVE2]]"]
  tested_by: ["[[T23]]"]
  related: ["[[ARCH-STACK]]"]
source: "guide 3.1; OWN-DEC-130"
---
- Both websites call one shared application/domain layer. Business rules live there once; neither frontend re-implements them.
- Modules: identity (staff email-and-password sign-in, customer one-time-code access), catalog/content (service registry, coverage, site content), requests/CRM, estimates, appointments/scheduling, jobs (packet, gates, execution, offline sync), quality (QA, punch items, walkthrough), cases (complaints, damage, injury, disputes, [[OWN-DEC-124]]), finance, communication (outbox, notifications, unified inbox with real inbound channels, [[OWN-DEC-120]]), media, records lifecycle (retention and deletion review, [[OWN-DEC-70]]), staff management and audit ([[OWN-DEC-123]]), and reporting.
- One modular application (modular monolith), not microservices. Microservices need a separate justification and decision.
- Each module registers its routes with the policy metadata the policy enforcement point needs ([[RULE-SERVER-AUTHZ]]), so every route has an authorization rule.
- Media handling is one module shared by intake, field and portal uploads, not separate copies per feature.
- The AI module exists only in its tested "AI disabled" state ([[RULE-AI-WAVE2]]).
- The concrete framework and layout are in [[ARCH-STACK]].
