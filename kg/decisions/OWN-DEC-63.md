---
id: OWN-DEC-63
type: decision
title: Optional customer accounts sign in with a one-time code, no password
status: active
area: identity
links:
  related: ["[[HH-ID-02]]", "[[HH-ID-03]]", "[[HH-ID-10]]", "[[HH-ID-11]]", "[[ROLE-CUSTOMER]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  part_of: ["[[C03]]", "[[C06]]"]
source: "vault-own-decisions.md OWN-DEC-63; project chat 2026-10-12"
---
Owner wording (project chat, 2026-10-12): asked how account customers should sign in, the owner chose "One-time code, no password".

Effect:
- Customer accounts are optional. Account customers sign in without a password, with a one-time code sent to a verified email or phone.
- The codes reuse the hashed, expiring one-time-code mechanism used for estimate approval.
- An account links only verified, authorized records; a matching email or phone alone never links or reveals records.
- Passkeys stay a later (P1) option. No identity provider is used for customers.
- Sign-in depends on email or text delivery being available.

Partly replaced by [[OWN-DEC-114]]: staff no longer sign in through ZITADEL but with email and password. [[OWN-DEC-129]]: texts go through Bird, not Telnyx.
