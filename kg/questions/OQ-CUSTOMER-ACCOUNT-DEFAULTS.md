---
id: OQ-CUSTOMER-ACCOUNT-DEFAULTS
type: question
title: Customer account wording, limits and session behaviour proposed by TSK-0036
status: superseded
area: identity
links:
  related: ["[[HH-ID-10]]", "[[HH-ID-11]]", "[[HH-INT-01]]", "[[HH-INT-14]]", "[[OWN-DEC-63]]", "[[OWN-DEC-87]]", "[[ENT-CustomerAccount]]", "[[TSK-0036]]"]
  superseded_by: ["[[OWN-DEC-192]]", "[[OWN-DEC-198]]"]
source: "TSK-0036 (2026-10-21): OWN-DEC-63 and OWN-DEC-87 decide that accounts exist, are optional and sign in with a one-time code; they do not give the account pages' wording, limits or the session behaviour after a change"
---
**Answered by [[OWN-DEC-192]], [[OWN-DEC-198]] (2026-10-21).**

**Question:** does the owner accept the account behaviour and wording below, which TSK-0036 built as PROPOSED?

- **Who answers:** the owner.
- **Known:** [[OWN-DEC-63]] (one-time code, no password; only verified, authorized records link), [[OWN-DEC-87]] (the entry choice and its exact labels), [[OWN-DEC-141]] (codes 10 minutes; customer sessions 30 minutes idle, 8 hours in total), [[OWN-DEC-150]] (the code message wording), [[OWN-DEC-71]] (account deletion separate from business records).
- **PROPOSED behaviour (built):**
  - Sign-in codes reuse the approved code message `contact.verification_code` ([[OWN-DEC-150]], FACT-AUTOMATIC-MESSAGES #2); no new message is needed to sign in.
  - Create an Account in the entry choice opens the same request form and adds one line saying the account is created on the receipt after verifying the email or phone; an account always starts from a request's verified contact. Sign in opens `/account`; the unfinished draft stays in the browser.
  - Enrollment sends a new code to a value the receipt (or the project's guest link) already verified, and the account is created only when it is entered. The account signs in with that value, plus the contact's other verified value when no other account has it (so it can be recovered through it). Enrolling again, or a second request with the same email, joins the same account and links each project once.
  - Later enrollment is offered on the project page opened through its guest link.
  - Sign-in: one answer for every well-formed request; phone sign-in only by text with a current SMS permission. A new sign-in replaces this browser's session and leaves other devices signed in. Sign Out ends this session only.
  - Sign-in email change: needs a sign-in within the fresh window (`verification.limits.freshVerificationMinutes`, 15 minutes, itself PROPOSED in HH-ID-07), then a code to the new email. Afterwards every other session of the account ends and this one is renewed; the project contact records and their guest links (business records) are not changed. Signing in through the verified phone is the documented recovery path when the email is lost, recorded as `other_contact`. A phone change is not offered (see [[OQ-PHONE-VERIFY-SMS-OPT-IN]]).
  - Closing a login account (the Owner's reviewed deletion, TSK-0100) also revokes the guest links of its linked projects (reason `account_deleted`, which [[OQ-ACCESS-RECOVERY]] does not reissue on request).
  - Route limits per client network and hour: 20 sign-in code requests, 60 sign-in attempts, 30 enrollment codes, 60 enrollment attempts, 20 email-change codes, 60 email-change attempts.
- **PROPOSED wording (customer catalog `account.*`, `request.continue.accountNext`):** "Your HandyHub account"; "Sign in"; "Enter the email or mobile phone of your account. We'll send you a one-time code; there is no password."; "If these details belong to a HandyHub account, we sent a code to them. It expires in {minutes} minutes."; "No account yet? Send an estimate request, then create your account on the receipt."; "Choose where we send your one-time code. Your account is created only after you enter it."; "Create my account"; "Your account is ready, and this project is in it."; "Go to your account"; "Your projects"; "View {reference}"; "Sign Out"; "You're signed out."; "Change your sign-in email"; "We'll send a code to the new address. After the change we'll let your current email know, and you'll be signed out on your other devices."; "For your security, sign in again with a new code before you change your email."; "Your sign-in email is changed. You're signed out on your other devices."; "That email is already used by another HandyHub account. Sign in with it instead."; "Changing your sign-in email isn't available here yet."; "Send your request first. On the receipt, verify your email or phone, then create your account with a one-time code."
