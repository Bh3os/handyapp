---
id: HH-SEC-02
type: requirement
title: Transport, authentication, cookies, CSRF, session lifecycle and least privilege; MFA optional for staff
status: active
priority: P0
area: security
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-63]]", "[[OWN-DEC-73]]", "[[OWN-DEC-123]]", "[[OWN-DEC-133]]", "[[OWN-DEC-141]]"]
  depends_on: ["[[HH-ARC-06]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-StaffUser]]", "[[INT-Resend]]", "[[FACT-SESSION-TIMINGS]]"]
  tested_by: ["[[T22]]", "[[T27]]", "[[T64]]"]
  part_of: ["[[S00]]", "[[S09]]"]
source: "guide 25.1; OWN-DEC-114 (supersedes required MFA, OWN-DEC-27)"
---
General:
- TLS everywhere; maintained authentication and cryptography libraries, never home-made primitives.
- Session cookies are Secure, HttpOnly, host-only, with a suitable SameSite policy (Lax or Strict), and CSRF protection that fits the chosen credential design. The customer origin and the staff origin (`staff.handyhub247.com`) each have their own cookies; customer and staff sessions never share one ([[OWN-DEC-133]]).
- Sessions expire per [[FACT-SESSION-TIMINGS]] (staff after 30 minutes idle; customers after 30 minutes idle or 8 hours in total), rotate on sign-in (new session ID, no fixation), and can be revoked server-side. Sign Out is always available.
- Least privilege for every role; applicable OWASP ASVS requirements pinned by version (5.0.0 proposed). This is a target, not a claim of certification.

Staff sign-in ([[OWN-DEC-114]]; replaces ZITADEL and required MFA):
- Email and password on the staff website, no redirect. Accounts exist only by owner invitation with a role (Owner, Office/Dispatcher, Estimator, Worker); there is no public staff registration.
- Employees set their own password through the invite link. Passwords are hashed with a maintained memory-hard algorithm (argon2id or equivalent); a length-based policy following NIST SP 800-63B; any breached-password check runs offline only. Nobody, including the owner, can view a password, and no API returns a hash.
- Login and reset are rate limited, use constant-time comparison and generic error messages that never reveal whether an email exists.
- "Forgot password?" sends a single-use reset link, valid 24 hours, to the registered email (sent automatically through Resend). After a reset every existing session is revoked and the user signs in again.
- MFA is optional: TOTP (and passkeys if a maintained library makes it simple), recommended for privileged accounts; Owner and Office accounts without MFA see a recommendation banner. **RISK:** privileged accounts may run without MFA; recorded in the risk register.
- Sensitive actions (privilege changes, refunds, bulk exports, high-consequence configuration) require fresh authentication: password re-entry, or TOTP when enrolled.
- The owner can disable an account immediately, revoke all its sessions and start password recovery; work history is kept ([[OWN-DEC-123]]). A disabled user's existing browser session cannot perform any further operation.
- Migration keeps existing staff IDs, roles, assignments and audit records; migrated accounts start with "password not set" and use an owner-sent invite or reset link.
- The first Owner account on a fresh deployment is created through a safe one-time bootstrap (for example an operations command run in the Render shell that prints a single-use, short-lived set-password link, or a one-time invite sent only while no Owner exists). No secret is ever placed in chat or files.

Customers: account sign-in with a one-time code to a verified email or phone, no password ([[OWN-DEC-63]]); guest access through verified, project-scoped sessions; codes are hashed, expire after 10 minutes and are attempt-limited.

The staging access gate stays separate from staff and customer sign-in ([[OWN-DEC-73]]).
