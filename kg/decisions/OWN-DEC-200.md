---
id: OWN-DEC-200
type: decision
title: "Rules Review H: offboarding and reactivation with permission review; cash collection needs an explicit trained grant; owner overrides never waive mandatory restrictions"
status: active
area: staff
links:
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-SERVER-AUTHZ]]"]
  related: ["[[OWN-DEC-192]]", "[[OWN-DEC-114]]", "[[OWN-DEC-123]]", "[[OWN-DEC-138]]", "[[ROLE-MATRIX]]", "[[HH-STAFF-02]]", "[[TSK-0097]]", "[[TSK-0098]]", "[[OWN-DEC-202]]", "[[TSK-0154]]"]
source: "owner answers 2026-10-21 R12 (Rules Review)"
---
Owner answer (round 12, Rules Review), section verbatim:

> H — Staff Management and Audit
> H1: Use the existing authorized staff identity provider. Do not assume or introduce locally stored passwords when authentication is externally managed.
> Offboarding must revoke sessions and access immediately. Reactivation requires proper identity verification and permission review.
> H3: Disabled employees may retain historical role-assignment records, but reactivation must not automatically restore outdated access without authorization.
> H4: Cash-collection permission requires a properly authorized and trained Worker. The Worker role alone is not sufficient.
> Keep the previously established Owner-only financial controls.
> H7: The Owner may resolve or override discretionary operational issues with a recorded reason, where legally and safely permitted.
> Mandatory safety, legal, licensing, qualification, or employee-protection restrictions must never be waived through a general Owner override.
> Approve H2, H5, H6, H8, and H9.

Rules as built, as the owner reviewed them on the Rules Review page (2026-10-21):

- **H1** Disabling an account clears its password, so re-enabling always sends a new password link. Role grants are kept unchanged when someone is re-enabled.
- **H3** Every staff member keeps at least one role; to remove access, disable the account instead.
- **H4** Only someone with the Worker role can be given the cash-collection permission.
- **H7** The Owner may dismiss a working-hours or equipment flag and keep the appointment as it is, with a reason.

Effect:
- H1: offboarding revokes sessions and access at once; reactivation needs proper identity verification and a permission review. Conflict resolved by interpretation (PROPOSED, for the owner to confirm, [[OQ-READINGS-2026-10-21]]): HandyHub has no external staff identity provider; staff sign in with the app's own email and password plus optional MFA ([[OWN-DEC-114]] removed ZITADEL). "Use the existing authorized staff identity provider" therefore means keeping that sign-in as built (hashed passwords, MFA, session revocation on offboarding); disabling clears the password, so reactivation goes through a verified reset link plus the permission review.
- H3: a disabled employee's role-assignment history stays, but reactivation never restores outdated access by itself: each role is confirmed again by the Owner. Replaces "role grants are kept unchanged when someone is re-enabled".
- H4: cash collection needs an explicit, recorded authorization by the Owner for a Worker who is trained for it; the Worker role alone is not enough. The Owner-only financial controls stay ([[OWN-DEC-138]]).
- H7: the Owner may resolve or override discretionary operational issues (for example a working-hours or equipment flag) with a recorded reason where legally and safely permitted; no general owner override ever waives a mandatory safety, legal, licensing, qualification or employee-protection restriction ([[RULE-SAFETY-GATES]]).
- Built by [[TSK-0151]].

**Confirmed by [[OWN-DEC-202]] (2026-10-22):** the H1 reading is final, amended: the app's own email and password sign-in stays (no ZITADEL), with MFA mandatory for every active staff account instead of optional; immediate session revocation and invalidated credentials on offboarding; reactivation through secure links and the Owner's permission review.
