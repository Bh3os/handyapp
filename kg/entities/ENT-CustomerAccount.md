---
id: ENT-CustomerAccount
type: entity
title: "Optional customer account"
status: active
area: identity
links:
  decided_by: ["[[OWN-DEC-63]]", "[[OWN-DEC-97]]", "[[OWN-DEC-71]]", "[[OWN-DEC-113]]"]
source: "guide 8.3; OWN-DEC-63, OWN-DEC-71"
---
An optional login for a customer contact, signed in with a one-time code to a verified email or phone (no password).

**Fields:** auth identity ([[ENT-AuthIdentity]]); linked customer and contact; preferences; sessions; created, closed times.

**States:** `active → closed` (login access closed; business records stay).

**Invariants:** registering links only verified, authorized records without duplicating them; account-wide history needs verified identity plus authorized links; closing the login is separate from record retention, revokes sessions and project links, and is never blocked by an unpaid balance.

**Who may change:** the customer (preferences, closure request); the Owner deletes the login account after review ([[HH-PRIV-03]]).
