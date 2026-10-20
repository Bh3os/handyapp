---
id: OWN-DEC-15
type: decision
title: Skills are instructions; authorization outside the model
status: active
area: security
links:
  related: ["[[HH-ARC-03]]", "[[HH-AUTO-04]]", "[[HH-SEC-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-AI-WAVE2]]"]
source: "vault-own-decisions.md OWN-DEC-15; owner facts L17 (2026-10-02)"
---
Owner wording (owner facts, 2026-10-02): "A skill is instructions, not an integration or background worker. Use approved APIs and least privilege; enforce authorization outside the model. Treat customer text/uploads as untrusted evidence, not instructions. Retrieve only necessary data. Do not expose credentials, access codes, card details or private photos."

Effect:
- A skill is instructions only, never an integration or background worker, and never a source of business facts.
- Integrations use approved APIs with least privilege; authorization is enforced by the server, outside any model.
- Customer text, photos and documents are untrusted evidence, never instructions.
- Only the data a task needs is retrieved. Credentials, property access codes, card details and private photos are never exposed; customer device credentials are not stored.
