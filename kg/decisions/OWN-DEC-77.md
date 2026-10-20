---
id: OWN-DEC-77
type: decision
title: Only the owner may reopen a closed job
status: active
area: quality
links:
  related: ["[[HH-QA-08]]", "[[HH-QA-09]]", "[[HH-DATA-03]]", "[[ROLE-OWNER]]"]
  uses: ["[[ENT-Job]]", "[[ENT-AuditEvent]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
source: "vault-own-decisions.md OWN-DEC-77; owner-answers-verbatim.md 2026-10-12T16:41"
---
Owner wording (in-chat question, 2026-10-12: "Who may reopen a job that was already closed (to correct a mistake)?"): "Only me, the owner (Recommended)".

Effect:
- Reopening a closed job needs the owner, a fresh sign-in and a reason; any other administrator or role is refused.
- The original record is kept and the change is audited.
- Return work for a customer issue is a linked return visit or job, not a hidden reopening that overwrites evidence.
