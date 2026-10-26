---
id: HH-ID-13
type: requirement
title: Organization accounts with explicit memberships and scopes
status: active
priority: P2
area: identity
links:
  depends_on: ["[[HH-ID-10]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-CustomerAccount]]", "[[ENT-Property]]"]
  part_of: ["[[C11]]"]
source: "guide 8.3 HH-ID-13"
---
- Organization accounts support explicit membership, property scopes, approval and payment privileges, invitations, revocation and history.
- Sharing an email domain never grants anyone access.

**Built by [[TSK-0118]] (2026-10-26):** an account administers the organizations it sets up and shares only projects its own account is linked to; an invitation names one exact email and grants nothing until the account signed in with that address accepts it; each membership reaches only its scope, reads it, and approves or pays only with those privileges; withdrawing, removing, leaving, taking a project out of the scope or the administrator losing their own link ends access on the next request; the history is append-only. Details PROPOSED in [[OQ-ORGANIZATION-ACCOUNTS-DETAILS]].
