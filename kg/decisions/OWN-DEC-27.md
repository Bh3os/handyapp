---
id: OWN-DEC-27
type: decision
title: "Staff sign-in: identity spike, then a managed identity provider; MFA for every staff account"
status: superseded
area: identity
links:
  superseded_by: ["[[OWN-DEC-114]]"]
  related: ["[[HH-STAFF-01]]", "[[HH-SEC-02]]"]
  part_of: ["[[S00]]"]
source: "vault-own-decisions.md OWN-DEC-27; owner start-decision brief item 5 (2026-10-04)"
---
Owner wording (project chat, 2026-10-04): "spike first, then use a managed identity provider. Do not build production authentication from scratch. MFA is required for all staff accounts."

Recorded approach (2026-10-04): an identity spike, then a managed identity provider for staff (ZITADEL was later chosen); production authentication not built from scratch; MFA required for every staff account.

Superseded by [[OWN-DEC-114]] (2026-10-12): ZITADEL is replaced by direct email-and-password staff sign-in on a maintained authentication library, owner-invited accounts, and MFA optional (recommended for privileged accounts). The rule "do not build production authentication from scratch" survives as "use a maintained authentication library".
