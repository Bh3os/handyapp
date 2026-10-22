---
id: HH-COM-04
type: requirement
title: Versioned notification templates with full delivery metadata and no sensitive content
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-98]]", "[[OWN-DEC-102]]", "[[OWN-DEC-110]]", "[[OWN-DEC-158]]", "[[OWN-DEC-151]]"]
  depends_on: ["[[HH-ARC-08]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SYNTHETIC-DATA]]"]
  uses: ["[[ENT-Message]]", "[[ENT-OutboxEvent]]"]
  tested_by: ["[[T74]]", "[[T65]]"]
  part_of: ["[[S06]]"]
source: "guide 21.2 HH-COM-04 and event table; OWN-DEC-98, OWN-DEC-102, OWN-DEC-110"
---
- Each notification records its template version and audience, event ID, record reference, destination, channel permission, queued time, send attempts, provider message ID, delivery state and error summary.
- Ordinary email and texts never contain access codes, raw payment data, detailed incidents or unnecessary interior photos.
- Estimate-ready and invoice-ready notices contain no amounts; question notices contain no private details. They link to the project through verified access.
- Staging sends only to approved test destinations.

**Changed by [[OWN-DEC-158]], [[OWN-DEC-151]] (2026-10-21):** the first name and non-sensitive reference numbers may appear; amounts, property addresses, access codes, tokens and private details never; templates render through the registry of [[HH-COM-13]].
