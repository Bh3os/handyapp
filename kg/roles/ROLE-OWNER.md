---
id: ROLE-OWNER
type: role
title: "Owner"
status: active
area: staff
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-28]]", "[[OWN-DEC-38]]", "[[OWN-DEC-64]]", "[[OWN-DEC-76]]", "[[OWN-DEC-77]]", "[[OWN-DEC-118]]", "[[OWN-DEC-123]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-SERVER-AUTHZ]]"]
  part_of: ["[[ROLE-MATRIX]]"]
source: "guide 10.2 Owner/admin; vault 27 ROLE-009; OWN-DEC-28, 38, 64, 76, 77, 114, 118, 123"
---
The business owner and the only administrator. At launch the Owner also holds the office, estimating and finance functions and may do field work (then works under the same gates as any worker).

- Signs in with email and password; MFA is optional but recommended for this account (RISK: a privileged account without MFA). Sensitive actions need a fresh sign-in (password re-entry, or TOTP when enrolled) and a reason.
- Owner-only decisions: deposit waivers, refunds, credits, write-offs, voids and payment corrections, reopening a closed job, approving administrative Start Work exceptions, the quality review of every job, timestamp corrections, deletion decisions and the Delete action, customer account deletion, cancellation and financial review of accepted, scheduled or paid work, "Overdue—owner decision", professional referrals for cases, approving care instructions, terms wording and service content, staff and role management, publishing-permission policy, business details and payment instructions, the full audit log, the Owner Dashboard, bulk and accounting exports.
- Limits that apply even to the Owner: no bypass of the Start Work gate, critical holds or stop-work rights; never releases a safety hold they raised; never edits audit events; protected records are archived or voided, never deleted.

Full permissions: [[ROLE-MATRIX]].
