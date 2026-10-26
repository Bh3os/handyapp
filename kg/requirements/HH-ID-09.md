---
id: HH-ID-09
type: requirement
title: Neutral recovery for revoked or expired access, with anti-enumeration reissue
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-97]]", "[[OWN-DEC-198]]"]
  depends_on: ["[[HH-ID-04]]", "[[HH-INT-11]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-ProjectAccessGrant]]"]
  tested_by: ["[[T18]]", "[[T19]]"]
  part_of: ["[[C03]]", "[[C06]]"]
source: "guide 8.2 HH-ID-09; OWN-DEC-97"
---
- A revoked or expired grant, or exhausted verification attempts, show a neutral recovery page with no project information.
- The page offers a safe way to request new access. Reissue wording never reveals whether a contact, project or account exists, and reissue is rate-limited.
- A reissued grant is limited to that project, even when other projects share the customer or email.

**Changed by [[OWN-DEC-198]] (2026-10-21):** a secure recovery path exists for legitimate customers who reach the reissue limits; staff-revoked access is never restored on request.

**Built by [[TSK-0149]] (2026-10-24):** the reissue limits are kept; after asking for a new link every visitor sees the same offer to ask HandyHub for help, whose answer is also one for all. The Owner verifies identity and sends a new link to the project's contact on file only (this is how staff restore a link staff revoked; a customer's request never does). Details PROPOSED in [[OQ-ACCOUNT-SECURITY-DETAILS]].
