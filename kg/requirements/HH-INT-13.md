---
id: HH-INT-13
type: requirement
title: Contact verification by one-time code, email and phone tracked separately
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-61]]", "[[OWN-DEC-65]]", "[[OWN-DEC-95]]", "[[OWN-DEC-141]]"]
  depends_on: ["[[HH-ID-06]]", "[[HH-INT-11]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SYNTHETIC-DATA]]"]
  uses: ["[[ENT-Contact]]", "[[ENT-Request]]", "[[INT-Resend]]", "[[INT-Bird]]", "[[FACT-SESSION-TIMINGS]]"]
  tested_by: ["[[T16]]", "[[T18]]"]
  part_of: ["[[C03]]", "[[S02]]"]
source: "guide 7.3 HH-INT-13, 23 (contact verification states); OWN-DEC-96"
---
- The request is saved immediately and marked **"Contact unverified"**. Staff can review it while verification is pending.
- Guests verify with a one-time code sent to the submitted email or phone; no account is needed. Codes send automatically ([[HH-COM-06]]); on staging only to approved test destinations.
- Email and phone verification are tracked separately, per exact contact value. Verifying one never marks the other verified.
- The receipt shows the **masked destination**, code entry, **Resend** and **Change Contact**. A changed contact must itself be verified.
- Codes expire after 10 minutes ([[FACT-SESSION-TIMINGS]]); attempts and resends are limited ([[HH-ID-06]]). The request is kept if delivery fails or the customer leaves.
- States: `unverified → pending → verified`; `pending → expired` or `failed`. A sensitive contact change starts a new verification.
- Verified contact ownership is required before private project access and before any estimate or change-order approval. A reference number alone grants no access.
- A matching email or phone never reveals earlier projects or account status.
- Staff see separate email and phone verification badges on the request ([[HH-LEAD-01]]).
