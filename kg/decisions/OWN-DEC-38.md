---
id: OWN-DEC-38
type: decision
title: No second administrator yet; nobody releases a hold they raised
status: active
area: safety
links:
  related: ["[[HH-INC-03]]", "[[HH-WORK-09]]", "[[ROLE-OWNER]]", "[[OWN-DEC-137]]"]
  uses: ["[[ENT-Hold]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  part_of: ["[[S07]]"]
source: "vault-own-decisions.md OWN-DEC-38; project chat 2026-10-05"
---
Partly replaced by [[OWN-DEC-137]]: the self-release ban applies only to critical safety holds; the Owner can release any job-level Hold/Ready note.

Owner wording (project chat, 2026-10-05): the owner selected "Keep strict, add 2nd admin (Recommended)" in the hold-release question, then wrote "don't make a second admin yet".

Effect:
- No second administrator account is created for now.
- Nobody, of any role, releases a hold they raised. A hold is released only by an administrator with a fresh sign-in, a reason, the evidence and the qualified assessor's qualification.
- Relaxing the rule for a sole administrator is not an option: safety gates are never weakened.
- RISK: a hold the owner raises cannot be released until a second administrator exists, so that job stays blocked. Stop Work and Report Hazard stay available to everyone, and the owner can release a hold a worker raised.
- The remedy for a stuck owner-raised hold is a new owner decision creating a second administrator, never a weaker rule.
- Voiding a hold (entered in error only) needs, for a critical hold, a second person's confirmation where one exists.

Open:
- The qualified safety professional's review of the hold release and void rules: [[OQ-SAFETY-REVIEW]].
