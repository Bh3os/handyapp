---
id: HH-STAFF-03
type: requirement
title: Explicit capabilities per role grant; fresh authentication and owner-only decisions
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-118]]", "[[OWN-DEC-76]]", "[[OWN-DEC-77]]", "[[OWN-DEC-28]]"]
  depends_on: ["[[HH-STAFF-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-RoleGrant]]", "[[ENT-StaffUser]]"]
  tested_by: ["[[T26]]", "[[T64]]"]
  part_of: ["[[S00]]", "[[S09]]"]
source: "guide 10.1 HH-STAFF-03, 10.2; OWN-DEC-114, OWN-DEC-118, OWN-DEC-76, OWN-DEC-77"
---
- One person may hold several role grants (at launch the owner holds the office roles and does field work), but each capability stays explicit in [[ROLE-MATRIX]]. "Any signed-in staff member can do everything" is never implemented.
- Fresh authentication (password re-entry, or TOTP when enrolled) is required for privilege changes, refunds, bulk exports and high-consequence configuration changes.
- Owner-only decisions stay owner-only for every other role: deposit waivers, reopening a closed job, refunds, deletion approvals, cancellation and financial review routed from Not a Fit, and approval of Start Work administrative exceptions.
- Estimators and the Owner may publish estimates directly; the Owner can change which roles may publish.
- No role or flag can bypass the Start Job gate, stop-work rights or critical holds.

**Built by [[TSK-0151]] (2026-10-24, migration 0098):** the collect capability is an explicit Owner grant that records the worker's training ([[OWN-DEC-200]] H4); the Owner may dismiss a working-hours or equipment flag with a reason, and a server check (`@handyhub/domain` overrides, backed by the database) refuses any override of a mandatory safety, legal, licensing, qualification or employee-protection restriction (H7); the Start Work gate, stop-work rights and critical holds stay non-overridable. PROPOSED details: [[OQ-STAFF-AMENDMENT-DETAILS]].
