---
id: HH-STAFF-01
type: requirement
title: "Invite-only staff accounts with direct email-and-password sign-in and optional MFA (MFA mandatory since OWN-DEC-202)"
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-123]]", "[[OWN-DEC-73]]", "[[OWN-DEC-133]]", "[[OWN-DEC-141]]", "[[OWN-DEC-202]]"]
  depends_on: ["[[HH-SEC-02]]", "[[HH-INT-11]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SYNTHETIC-DATA]]"]
  uses: ["[[ENT-StaffUser]]", "[[ENT-RoleGrant]]", "[[ENT-AuditEvent]]", "[[INT-Resend]]", "[[INT-Render]]", "[[FACT-SESSION-TIMINGS]]"]
  tested_by: ["[[T26]]", "[[T74]]"]
  part_of: ["[[S00]]", "[[S09]]"]
source: "guide 10.1 HH-STAFF-01; OWN-DEC-114, OWN-DEC-123, OWN-DEC-141"
---
Accounts:
- Every staff member has an individual account; there are no shared passwords. A staff account is distinct from any customer account and is never created through customer registration.
- Only the owner creates or invites staff and assigns roles: **Owner, Office/Dispatcher, Estimator, Worker** (mapped onto the role matrix, [[ROLE-MATRIX]]). There is no public staff registration route.
- An invited employee sets their own password through the invite link (single-use, valid 24 hours, [[FACT-SESSION-TIMINGS]]) and signs in directly on the staff app at `staff.handyhub247.com` ([[FACT-DOMAIN]]), with no external identity-provider redirect.

Passwords and sign-in:
- A maintained authentication library is used. Passwords are hashed with argon2id or an equivalent maintained algorithm; the password policy is length-based per NIST 800-63B (an optional breached-password check runs offline only). The owner can never view a password, and no API returns a hash.
- Sign-in and reset are rate-limited, use generic error messages and constant-time comparison, and issue a new session ID on sign-in. Cookies are HttpOnly, Secure and SameSite, with CSRF protection.
- **"Forgot password?"** sends a single-use reset link valid for 24 hours to the registered email; the response never reveals whether the email exists. After a reset all existing sessions are revoked and the person must sign in again. Invite and reset emails send automatically ([[HH-COM-06]]).
- Sessions end after 30 minutes idle ([[FACT-SESSION-TIMINGS]]); **Sign Out** is always available.

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

**Changed by [[OWN-DEC-202]] (2026-10-22):** the MFA section above is replaced. MFA is mandatory for every active staff account (Owner, Office/Dispatcher, Estimator, Worker): an account without a factor enrols TOTP at its next sign-in, before any staff screen; no staff route or operation is served without completed MFA, whatever the role, flag or configuration; the recommendation banner and the RISK about accounts without MFA no longer apply. A lost factor is reset by the Owner (sessions revoked, new enrollment). Offboarding clears the password and removes the factor; reactivation uses a secure single-use link, the Owner's permission review and a new enrollment. Fresh authentication uses password re-entry plus TOTP. Built by [[TSK-0154]].

**As built by [[TSK-0154]] (2026-10-22, migration 0070):** the password never completes a staff sign-in. An account with a confirmed authenticator gets a session waiting for its code (or one single-use recovery code); an account without one (new, migrated, reset by the Owner, or re-enabled after offboarding) gets an enrolment session and enrols TOTP before any staff screen (setup key shown once, a confirming code, ten recovery codes shown once). Both pre-MFA sessions reach only enrolment, the challenge, sign-out and the guest sign-in routes; every other staff route and API operation answers UNAUTHENTICATED with the code MFA_REQUIRED, checked on the server before validation for every route of the staff surface (route contract `beforeSecondFactor`, a test iterates every staff route for each of the four roles), and the database refuses a complete session without a confirmed authenticator. The self-service "remove the authenticator" route and the recommendation banner are gone. Without MFA_ENCRYPTION_KEY staff sign-in is refused in every environment (fail closed, NOT_CONFIGURED, operator error MFA_NOT_CONFIGURED in the log). A lost authenticator: the Owner resets it (`staff.reset_mfa`: fresh sign-in, a reason, never oneself; sessions revoked, recovery codes removed, audited). PROPOSED: the Owner's own lost authenticator is recovered with a recovery code or, with none left, the host-shell command `staff-access reset-mfa <email> <reason>` (Owner accounts only, audited), never by switching MFA off. PROPOSED reading: fresh authentication inside an MFA-completed session keeps the password re-entry or the current authenticator code (as built by [[TSK-0015]]); requiring both is a stricter option for the Owner.
