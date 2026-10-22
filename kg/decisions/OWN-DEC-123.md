---
id: OWN-DEC-123
type: decision
title: Staff management, availability and an immutable audit log
status: active
area: staff
links:
  related: ["[[OWN-DEC-70]]", "[[OWN-DEC-114]]", "[[OWN-DEC-119]]", "[[HH-STAFF-01]]", "[[HH-STAFF-02]]", "[[HH-SEC-06]]", "[[HH-SCH-03]]", "[[HH-AUD-05]]", "[[OWN-DEC-164]]"]
  uses: ["[[FACT-RETENTION-SCHEDULE]]", "[[ENT-StaffUser]]", "[[ENT-AuditEvent]]"]
source: "owner-answers-verbatim 2026-10-12T19:44:11.908Z [S9 Staff]; decision-briefs 2026-10-12T19:45:23"
---
Partly replaced by [[OWN-DEC-164]] (2026-10-21): audit entries stay append-only during retention; after 7 years the Owner may authorize deletion through the dedicated retention workflow.

Owner, 2026-10-12, staff journey S9, staff management and audit.

Question asked:
> Staff S9 - Staff management and audit: the Owner invites staff, sets roles, sets each worker's working days/hours (used for capacity), disables accounts, and sees an audit log of every important action (logins, approvals, payments, merges, setting changes, safety events) that can't be edited or deleted. Office staff see only their own actions in the audit log. OK?

Owner wording:
> Yes. Keep it simple and aligned with my instructions:
>
> - The Owner creates or invites staff accounts, assigns roles, sets working days/hours, and disables accounts.
> - Staff use **email and password**, with password reset. No ZITADEL.
> - Worker availability feeds scheduling capacity and prevents double-booking. Changes flag affected appointments for review without silently cancelling them.
> - Disabling an account immediately blocks access and revokes active sessions. Preserve the employee’s job history and flag upcoming assignments for reassignment.
> - Automatically record important actions, including sign-ins, approvals, payment entries and corrections, customer merges, role changes, and safety events. Record who, when, the affected record, and relevant changes.
> - Audit entries cannot be edited through the app. Corrections create new entries. Keep passwords, access codes, and sensitive message contents out of logs.
> - The Owner sees the full audit log; Office staff see their own audit actions while retaining the operational history their role needs.
> - Apply the agreed retention rules to audit records rather than keeping everything forever.
>
> Implement, test permissions and offboarding, and publish on private staging. Do not add another setup or activation process.

Effect:
- The owner creates or invites staff, assigns roles, sets working days/hours and disables accounts; sign-in is email and password with reset ([[OWN-DEC-114]]).
- Worker availability (working days/hours, time off) feeds scheduling capacity and prevents double-booking ([[OWN-DEC-119]]). Availability changes flag affected appointments for review and never cancel them silently.
- Disabling an account blocks access at once, revokes active sessions, keeps the employee's job history and flags upcoming assignments for reassignment in the action queue.
- Recorded automatically: sign-ins, approvals, payment entries and corrections, customer merges, role changes and safety events, each with who, when, the affected record and the relevant changes.
- Audit entries cannot be edited through the app; corrections create new entries. Passwords, tokens, access codes and sensitive message contents are redacted from logs and audit diffs.
- The owner sees the full audit log; office staff see their own audit actions while keeping the operational timeline their role needs.
- Audit records follow the retention schedule ([[FACT-RETENTION-SCHEDULE]], [[OWN-DEC-70]]) through the reviewed deletion queue, not keep-forever.

Links: uses [[FACT-RETENTION-SCHEDULE]], [[ENT-StaffUser]], [[ENT-AuditEvent]].
