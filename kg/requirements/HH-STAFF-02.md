---
id: HH-STAFF-02
type: requirement
title: Audited role changes and immediate offboarding that keeps work history
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-123]]", "[[OWN-DEC-200]]", "[[OWN-DEC-202]]"]
  depends_on: ["[[HH-STAFF-01]]", "[[HH-OPS-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-StaffUser]]", "[[ENT-RoleGrant]]", "[[ENT-Visit]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T27]]"]
  part_of: ["[[S09]]"]
source: "guide 10.1 HH-STAFF-02; OWN-DEC-114, OWN-DEC-123"
---
- Role assignment, role change, password recovery and offboarding are audited with actor, time and change.
- Disabling an account immediately blocks every new server operation and revokes all active sessions and tokens. A stale browser session cannot write after offboarding, including queued offline field writes.
- The employee's job history and evidence are kept.
- Their upcoming assignments are flagged for reassignment as queue items ([[HH-OPS-01]]); they are never silently cancelled. The person is removed from future capacity.

**Changed by [[OWN-DEC-200]] (2026-10-21):** reactivation needs a verified reset link and the Owner's permission review; earlier roles are not restored automatically.

**Changed by [[OWN-DEC-202]] (2026-10-22):** offboarding also invalidates previous credentials (password cleared, MFA factor and recovery codes removed); reactivation uses a secure single-use link, the Owner's permission review and a new MFA enrollment before access is restored ([[TSK-0154]]).

**As built by [[TSK-0154]] (2026-10-22, migration 0071):** disabling an account also removes its authenticator and recovery codes (accounts disabled earlier lost theirs in migration 0071), so a re-enabled account sets a new password through the single-use link and enrols a new authenticator before any access; the Owner's reset of a lost authenticator (`POST /staff/members/:id/mfa-reset`) is audited with actor, reason, sessions revoked and codes removed. The permission review on reactivation (earlier roles confirmed again by the Owner) stays with [[TSK-0151]].
