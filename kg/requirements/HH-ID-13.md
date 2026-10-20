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
