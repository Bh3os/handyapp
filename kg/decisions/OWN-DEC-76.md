---
id: OWN-DEC-76
type: decision
title: Only the owner may waive a required deposit
status: active
area: payments
links:
  related: ["[[HH-FIN-02]]", "[[HH-FIN-03]]", "[[ROLE-OWNER]]"]
  uses: ["[[FACT-DEPOSIT-RULE]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T36]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  part_of: ["[[C05]]"]
source: "vault-own-decisions.md OWN-DEC-76; owner-answers-verbatim.md 2026-10-12T16:41"
---
Owner wording (in-chat question, 2026-10-12: "Who may waive a required deposit on a job (for example, a returning customer you trust)?"): "Only me, the owner (Recommended)".

Effect:
- Only the owner may waive a required deposit, with a fresh sign-in and a written reason; every waiver is audited.
- Every other role, including any other administrator, is refused by the server. The owner is identified as a designation another administrator cannot grant themselves.
- Otherwise the deposit keeps blocking.

Detailed by [[OWN-DEC-104]]: a waiver is job-specific, never marks the deposit paid and never reduces the agreed price.
