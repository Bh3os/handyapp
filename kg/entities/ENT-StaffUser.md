---
id: ENT-StaffUser
type: entity
title: "Staff user (staff membership)"
status: active
area: staff
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-123]]", "[[OWN-DEC-05]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
source: "guide 22.1 StaffMembership; OWN-DEC-114, OWN-DEC-123; vault 05 section 5.1"
---
A named staff member's account and field profile. One person may hold several role grants ([[ENT-RoleGrant]]).

**Fields:** stable ID; name and first name shown to customers; login email; password hash (argon2id or equivalent; never returned by any API, never visible to the Owner); optional MFA factor (TOTP); staff locale (en, es); working language for safety content; working days and hours and approved time off (feed capacity); status; invited, activated and disabled times; sessions with inactivity expiry.

**States:** `invited → active → disabled`; `disabled → active` only by the Owner with a fresh sign-in. Password states: not set, set, reset pending (single-use, short-lived link).

**Invariants:**
- No public registration; accounts exist only by Owner invitation. Existing IDs, roles, assignments and audit records survive the sign-in migration.
- Disabling blocks every new server operation at once, revokes all sessions and flags upcoming assignments for reassignment; job history is kept.
- A password reset revokes all sessions. Responses never reveal whether an email exists.
- Availability changes flag affected visits; they never cancel them.

**Who may change:** the Owner invites, assigns roles, sets hours, disables, revokes sessions and starts recovery; each user edits only their own name, locale, password and MFA factor.
