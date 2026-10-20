---
id: ENT-RoleGrant
type: entity
title: "Role grant"
status: active
area: staff
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-118]]", "[[OWN-DEC-67]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
source: "guide 22.1 RoleGrant; OWN-DEC-114"
---
Grant of one role or named capability to a staff user ([[ENT-StaffUser]]), evaluated by the one policy point on the server ([[ROLE-MATRIX]]).

**Fields:** subject; role (Owner, Office/Dispatcher, Estimator, Worker) or capability (for example `collect`, `publish_estimate`); record scope; effective from and to; issuer; reason.

**Invariants:** least privilege; a grant is ended by a new fact, never edited; every grant and revocation is audited; nobody grants themselves a capability; the publish-estimate capability follows the Owner's publishing policy (default Estimator and Owner); the `collect` capability is granted per worker by the Owner.

**Who may change:** the Owner only, with a fresh sign-in for grants; revocation never waits for step-up.
