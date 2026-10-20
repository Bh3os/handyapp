---
id: HH-BASE-06
type: requirement
title: Store approved versions and evidence; never silently rewrite them
status: active
priority: P0
area: records
links:
  decided_by: ["[[OWN-DEC-123]]", "[[OWN-DEC-105]]", "[[OWN-DEC-118]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-EstimateVersion]]", "[[ENT-Approval]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T32]]", "[[T35]]", "[[T47]]", "[[T63]]"]
source: "guide 1.4"
---
- Approved versions are stored as immutable snapshots with their evidence: accepted estimate revisions with options, total and terms version, change orders, approvals, financial records, safety acknowledgments, walkthrough records, incident and case history, SOP and packet versions.
- No edit, recalculation, migration or cleanup silently rewrites acceptance, scope, financial records, safety acknowledgments or incident history. A correction is a new, linked, audited record (a new revision, a credit, a void, a correcting entry); the original stays readable. Editing a published estimate creates a new version ([[OWN-DEC-118]]).
- Audit entries cannot be edited through the app; corrections are new entries ([[OWN-DEC-123]]).
- Details: [[HH-DATA-03]] (immutable versions), [[HH-SEC-06]] (audit coverage).
