---
id: HH-STAFF-01
type: requirement
title: Invite-only staff accounts with direct email-and-password sign-in and optional MFA
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-123]]", "[[OWN-DEC-73]]"]
  depends_on: ["[[HH-SEC-02]]", "[[HH-INT-11]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SYNTHETIC-DATA]]"]
  uses: ["[[ENT-StaffUser]]", "[[ENT-RoleGrant]]", "[[ENT-AuditEvent]]", "[[INT-Resend]]", "[[INT-Render]]"]
  tested_by: ["[[T26]]", "[[T74]]"]
  part_of: ["[[S00]]", "[[S09]]"]
source: "guide 10.1 HH-STAFF-01; OWN-DEC-114 (supersedes OWN-DEC-27: ZITADEL and required MFA), OWN-DEC-123"
---
Accounts:
- Every staff member has an individual account; there are no shared passwords. A staff account is distinct from any customer account and is never created through customer registration.
- Only the owner creates or invites staff and assigns roles: **Owner, Office/Dispatcher, Estimator, Worker** (mapped onto the role matrix, [[ROLE-MATRIX]]). There is no public staff registration route.
- An invited employee sets their own password through the invite link and signs in directly on the staff website, with no external identity-provider redirect.

Passwords and sign-in:
- A maintained authentication library is used. Passwords are hashed with argon2id or an equivalent maintained algorithm; the password policy is length-based per NIST 800-63B (an optional breached-password check runs offline only). The owner can never view a password, and no API returns a hash.
- Sign-in and reset are rate-limited, use generic error messages and constant-time comparison, and issue a new session ID on sign-in. Cookies are HttpOnly, Secure and SameSite, with CSRF protection.
- **"Forgot password?"** sends a short-lived, single-use reset link to the registered email; the response never reveals whether the email exists. After a reset all existing sessions are revoked and the person must sign in again. Invite and reset emails send automatically ([[HH-COM-06]]).
- Sessions end after the configured inactivity period; **Sign Out** is always available.

MFA:
- MFA is optional, not required by default. Optional TOTP (authenticator app) is supported, passkeys if a maintained library makes it simple. It is recommended for privileged accounts, and Owner and Office/Dispatcher accounts without MFA see a recommendation banner.
- Sensitive actions that need fresh authentication ([[HH-STAFF-03]]) use password re-entry, or TOTP when enrolled.
- RISK: privileged accounts may run without MFA; recorded in the risk register with the recommendation that the owner enables MFA.

Owner controls and migration:
- The owner can disable an account immediately, revoke all its sessions and start password recovery; work history is kept ([[HH-STAFF-02]]).
- Existing staff IDs, roles, assignments and audit records are kept; migrated accounts have "password not set" and use an owner-sent invite or reset link.
- The first Owner account on a fresh deployment is created through a safe bootstrap with no secrets in chat or files (for example a one-time command in the host shell that prints a single-use, short-lived set-password link, or an owner-set bootstrap email variable that sends one invite only while no Owner exists). Secrets and tokens are never logged.
- The staging access gate stays separate from staff sign-in and unchanged. Customer passwordless sign-in is unaffected.
- Sign-in, failed sign-in, reset, disable and role changes are audited ([[HH-STAFF-08]]).
