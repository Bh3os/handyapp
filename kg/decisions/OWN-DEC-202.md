---
id: OWN-DEC-202
type: decision
title: "Staff authentication final: the app's own email and password with MFA mandatory for every active staff account; immediate offboarding; controlled reactivation; no ZITADEL"
status: active
area: security
links:
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-StaffUser]]", "[[ENT-AuthIdentity]]", "[[ENT-RoleGrant]]"]
  related: ["[[OWN-DEC-114]]", "[[OWN-DEC-200]]", "[[OWN-DEC-27]]", "[[OQ-READINGS-2026-10-21]]", "[[TSK-0154]]", "[[TSK-0151]]", "[[TSK-0015]]"]
source: "owner answers 2026-10-22 R14 item 1; R13-Q1 correction 7"
---
Final confirmation of reading 1 of [[OQ-READINGS-2026-10-21]] (H1 staff sign-in, [[OWN-DEC-200]]).

Owner answer (round 13, question 1), correction 7, verbatim:
> 7. Maintain the existing internal staff authentication with secure password hashing, MFA, immediate offboarding, and controlled reactivation.

Owner answer (round 14, 2026-10-22), verbatim:
> Confirm all 13 readings, subject to the following final amendments.
> Item 1 — Staff authentication
> Keep HandyHub's existing internal email/password and two-factor authentication system.
> MFA must be mandatory for every active staff account, including Owner, Office, Estimator, and Worker. Do not change it to optional.
> Maintain immediate session revocation on offboarding, invalidation of previous credentials, secure reactivation links, and Owner permission review before access is restored.
> Do not reintroduce ZITADEL.

Effect:
- Staff keep signing in with the app's own email and password ([[OWN-DEC-114]]): maintained authentication library, argon2id (or equivalent) hashes, rate limits, generic errors. There is no external identity provider and ZITADEL is not reintroduced.
- MFA is mandatory for every active staff account: Owner, Office/Dispatcher, Estimator and Worker. It is never optional, never switched off by a role, a flag or a configuration value, and no staff route or staff API operation is served to a session that has not completed the second factor. The factor is the TOTP authenticator already built ([[TSK-0015]]), with its single-use recovery codes.
- Replaces the "MFA optional, recommended for privileged accounts" clause of [[OWN-DEC-114]] (and the recommendation banner and the RISK about privileged accounts without MFA). The rest of [[OWN-DEC-114]] stands.
- Offboarding revokes every session at once and invalidates previous credentials (the password is cleared; the MFA factor and recovery codes are removed). Reactivation goes through a secure, single-use reactivation link and the Owner's permission review before any access is restored; earlier roles are not restored automatically ([[OWN-DEC-200]] H1, H3).
- Existing active accounts without a factor enrol at their next sign-in before reaching any staff screen. A lost authenticator is handled through the Owner (factor reset, which signs the person out everywhere and requires a new enrolment). PROPOSED: the Owner's own lost factor is recovered with the Owner's recovery codes or the safe one-time bootstrap path of [[OWN-DEC-114]], never by turning MFA off.
- Confirms the H1 reading of [[OWN-DEC-200]] with this amendment. Built by [[TSK-0154]].
