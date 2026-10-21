---
id: OWN-DEC-198
type: decision
title: "Rules Review F: customer accounts keep passwordless sign-in, add security-triggered global sign-out, and safe recovery at limits"
status: active
area: identity
links:
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  related: ["[[OWN-DEC-192]]", "[[OWN-DEC-160]]", "[[OWN-DEC-63]]", "[[HH-ID-09]]", "[[HH-ID-11]]", "[[OQ-CUSTOMER-ACCOUNT-DEFAULTS]]", "[[OQ-ACCESS-RECOVERY]]", "[[OQ-PORTAL-REFRESH-INTERVAL]]"]
source: "owner answers 2026-10-21 R12 (Rules Review)"
---
Owner answer (round 12, Rules Review), section verbatim:

> F — Customer Accounts
> F1: Keep passwordless authentication, guest access, and verified-contact requirements.
> Never link existing projects to a new account solely from an unverified contact match. Require appropriate project-claiming verification.
> F2: Keep ordinary device sessions independent, but support security-triggered global session revocation.
> F3: Require recent authentication and verification of the new email address. Notify the old verified email address and revoke or revalidate other active sessions after the change.
> F4: Recovery through a phone number is allowed only when that phone is verified and the approved authentication channel is available.
> Do not bypass SMS consent, registration, rate limits, or account-recovery security requirements.
> Provide a secure alternative when phone-based recovery is unavailable.
> F5: Keep the current 24-hour project-link validity. Apply reasonable rate limits while providing a secure recovery path for legitimate customers who reach request limits.
> Do not permit unauthorized restoration of staff-revoked access.
> F6: Prevent account and project enumeration. Issue links only to previously verified, authorized contact methods.
> Approve F7.
> Registered customers must continue to have secure access to their active and historical projects according to the established retention policy.

Rules as built, as the owner reviewed them on the Rules Review page (2026-10-21):

- **F1** Customers sign in with a one-time code by email or text (no password). An account is always created from a contact already verified on the request receipt.
- **F2** A new sign-in replaces this browser's session and leaves other devices signed in. Sign Out ends this session only.
- **F3** Changing the sign-in email needs a sign-in within the last 15 minutes plus a code to the new email. Afterwards other sessions end and the old email gets a notice.
- **F4** If a customer loses their email, they can recover the account by signing in with the account's other verified contact (their phone).
- **F5** A new access link can be requested up to 3 times per project per day, and 10 requests per network per hour. A link staff revoked is not reissued on request; staff restore access.
- **F6** To ask for a new link, the visitor gives the email or phone on the request (plus the request reference when needed). The link only goes to the contact on file.
- **F7** An open project page refreshes itself every 30 seconds (paused while the tab is hidden), and also when the customer presses Refresh.

Effect:
- F1: passwordless sign-in, guest access and verified contacts stay; existing projects never join a new account on an unverified contact match; project claiming needs its own verification ([[OWN-DEC-160]]).
- F2: ordinary device sessions stay independent; a security event can revoke every session of the account at once.
- F3: changing the sign-in email needs recent authentication and a verified new address; the old verified address is notified (MESSAGE 21, [[OWN-DEC-151]]) and the other sessions are revoked or revalidated.
- F4: recovery through the phone only when that phone is verified and the approved channel (texts) is available, never bypassing SMS consent, registration, rate limits or recovery security; a secure alternative exists when it is not.
- F5: project links stay valid 24 hours ([[OWN-DEC-160]]); the rate limits stay with a secure recovery path for legitimate customers who hit them; staff-revoked access is never restored on request.
- F6: no account or project enumeration; links go only to previously verified, authorized contacts.
- F7 approved as built (30-second refresh). Registered customers keep secure access to their active and historical projects under the retention policy.
- Built by [[TSK-0149]]; the old-email notice by [[TSK-0120]]; the dashboard by [[TSK-0124]].
