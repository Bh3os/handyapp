---
id: HH-ID-11
type: requirement
title: Customer account sessions, recovery and safe contact changes
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-117]]", "[[OWN-DEC-141]]", "[[OWN-DEC-151]]", "[[OWN-DEC-198]]"]
  depends_on: ["[[HH-ID-10]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-CustomerAccount]]", "[[ENT-Contact]]", "[[ENT-AuditEvent]]", "[[FACT-SESSION-TIMINGS]]"]
  tested_by: ["[[T22]]"]
  part_of: ["[[C06]]", "[[C11]]"]
source: "guide 8.3 HH-ID-11; OWN-DEC-96, OWN-DEC-117"
---
- Account sessions have Sign Out, server-side revocation, expiry after 30 minutes idle or 8 hours in total ([[FACT-SESSION-TIMINGS]]), and recovery through a verified contact.
- A sensitive contact change sends a notice to the old contact value. An email change verifies both the new contact and authority over the old account, or uses a documented, audited recovery process.
- After a contact change or recovery, sessions are renewed or revoked as designed, and the old contact keeps no unintended access.

**Changed by [[OWN-DEC-151]], [[OWN-DEC-198]] (2026-10-21):** the email change notifies the old and the new verified address (MESSAGE 21); security events can revoke every session; phone recovery only when texting is available.

**Built by [[TSK-0149]] (2026-10-24):** Sign out everywhere ends every session of an account at once (the customer on the account page; the Owner with a written reason; the start of a staff-assisted recovery). A code goes by text only while texting is available (live texts on after A2P 10DLC and a released text wording); otherwise every phone gets the same refusal and the page offers asking HandyHub for help. The documented, audited recovery process is the Owner's staff-assisted recovery after identity verification: a new sign-in email that the customer proves with a code at sign-in, every session ended, the old and the new email told. Details PROPOSED in [[OQ-ACCOUNT-SECURITY-DETAILS]].
