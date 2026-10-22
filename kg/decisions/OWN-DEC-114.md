---
id: OWN-DEC-114
type: decision
title: "Staff sign in with email and password; ZITADEL removed; MFA optional (MFA clause replaced by OWN-DEC-202: MFA mandatory)"
status: active
area: security
links:
  supersedes: ["[[OWN-DEC-27]]"]
  related: ["[[OWN-DEC-63]]", "[[OWN-DEC-73]]", "[[OWN-DEC-123]]", "[[ROLE-MATRIX]]", "[[HH-STAFF-01]]", "[[HH-STAFF-02]]", "[[HH-STAFF-03]]", "[[HH-SEC-02]]", "[[HH-SEC-06]]", "[[OWN-DEC-200]]", "[[OWN-DEC-202]]", "[[TSK-0154]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[INT-Resend]]", "[[ENT-StaffUser]]"]
source: "owner-answers-verbatim 2026-10-12T19:16:01.591Z [S0 Sign-in]; decision-briefs 2026-10-12T19:16:35"
---
Partly replaced by [[OWN-DEC-202]] (2026-10-22): the clause "MFA is optional, recommended for privileged accounts" (with its recommendation banner and RISK) is replaced; MFA is mandatory for every active staff account (Owner, Office/Dispatcher, Estimator, Worker). The rest of this decision stands. Built by [[TSK-0154]].

Partly replaced by [[OWN-DEC-200]] (2026-10-21): reactivating a disabled staff account needs a verified reset link and the Owner's permission review.

Owner, 2026-10-12, staff journey S0, signing in.

Question asked:
> Staff S0 - Signing in: staff open the staff website (staging stays behind the access gate), sign in through ZITADEL with email + password and a required second factor (authenticator app or passkey). Roles decide what each person sees: Owner, Office/Dispatcher, Estimator, Worker. Sessions end after inactivity; a lost phone is handled by the owner resetting the factor (which signs the person out everywhere). Leaving staff are offboarded by the owner: access removed immediately, their history kept. OK?

Owner wording:
> Replace ZITADEL with a direct email-and-password login on the staff website.
>
> - The owner creates or invites staff accounts and assigns Owner, Office/Dispatcher, Estimator, or Worker roles. No public staff registration.
> - Employees set their own passwords and sign in directly, without a ZITADEL redirect.
> - Add **“Forgot password?”** Send a short-lived, single-use reset link to the registered email. After resetting, revoke existing sessions and require sign-in again.
> - Use a maintained authentication library, securely hashed passwords, login/reset rate limits, and safe error messages. The owner must never be able to view passwords.
> - Do not require an authenticator or passkey for every worker by default. Support optional MFA, recommended for privileged accounts.
> - End sessions after configured inactivity and provide Sign Out.
> - The owner can disable an account immediately, revoke all sessions, and initiate password recovery while preserving work history.
> - Preserve existing staff IDs, roles, assignments, and audit records during migration.
>
> Keep the staging access gate separate from staff login. Implement, test login/reset/offboarding and role permissions, then deploy to private staging.

Effect:
- Replaces [[OWN-DEC-27]] (identity spike, managed identity provider, MFA required for every staff account): staff sign in directly on the staff website with email and password; no ZITADEL redirect, configuration or environment variables.
- The owner creates or invites accounts and assigns Owner, Office/Dispatcher, Estimator or Worker ([[ROLE-MATRIX]]); there is no public staff registration. Employees set their own password from the invite link.
- "Forgot password?" emails a short-lived, single-use reset link; the response never reveals whether the email exists; a reset revokes all sessions and requires a new sign-in. Invite and reset emails send automatically ([[FACT-AUTOMATIC-MESSAGES]], [[INT-Resend]]).
- A maintained authentication library, argon2id (or equivalent) password hashes, a length-based password policy, login and reset rate limits, generic errors, a new session ID at login, HttpOnly/Secure/SameSite cookies with CSRF protection. Nobody, the owner included, can view passwords.
- MFA is optional (TOTP; passkeys if simple), recommended for privileged accounts, with a recommendation banner for Owner and Office accounts without it. RISK: privileged accounts without MFA; recommendation: the owner enables MFA on the Owner account.
- Sessions end after a configured inactivity period ([[OQ-SESSION-EXPIRY]]); Sign Out is always available.
- The owner can disable an account at once, revoke all its sessions and start password recovery; the work history stays ([[OWN-DEC-123]]).
- Existing staff IDs, roles, assignments and audit records are kept. The first Owner account on a fresh deployment is created by a safe bootstrap (for example a one-time command that prints a single-use set-password link) with no secret in chat or files.
- The staging access gate stays separate from staff login ([[OWN-DEC-73]]); customer passwordless sign-in is unchanged ([[OWN-DEC-63]]).

Links: supersedes [[OWN-DEC-27]]; uses [[FACT-AUTOMATIC-MESSAGES]], [[INT-Resend]], [[ENT-StaffUser]].
