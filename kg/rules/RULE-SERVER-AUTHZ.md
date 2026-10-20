---
id: RULE-SERVER-AUTHZ
type: rule
title: Server-side authorization and append-only audit
status: active
area: security
source: "vault CLAUDE.md rule 8; 27 roles"
---
- Every route is authorized on the server through one policy enforcement point, using the role matrix ([[ROLE-MATRIX]]).
- Customers reach only records linked to their verified identity or their single-project guest link.
- Important actions are written to an append-only audit log. Corrections create new entries.
- Logs never contain passwords, tokens, access codes or sensitive message contents.
