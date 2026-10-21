---
id: OQ-ACCESS-RECOVERY
type: question
title: Limits and wording of asking for a new project-access link
status: superseded
area: identity
links:
  related: ["[[HH-ID-09]]", "[[HH-ID-06]]", "[[HH-INT-11]]", "[[ENT-ProjectAccessGrant]]", "[[OWN-DEC-97]]", "[[OQ-ACCESS-LINK-WORDING]]", "[[TSK-0035]]"]
  superseded_by: ["[[OWN-DEC-192]]", "[[OWN-DEC-198]]"]
source: "TSK-0035 (2026-10-21): OWN-DEC-97 says expired links offer a safe way to request new access; HH-ID-09 asks for anti-enumeration wording and rate limits, without numbers or text"
---
**Answered by [[OWN-DEC-192]], [[OWN-DEC-198]] (2026-10-21).**

**Question:** how often may one project be sent a new secure link on request, should a link that staff revoked come back on the customer's request, and which words should the recovery page use?

- **Who answers:** the owner.
- **Known:** [[OWN-DEC-97]]: "Expired links offer a safe way to request new access." [[HH-ID-09]]: a neutral recovery page with no project information; reissue wording never reveals whether a contact, project or account exists, and reissue is rate-limited; a reissued grant is limited to that project. [[ENT-ProjectAccessGrant]]: the customer requests reissue; staff and the Owner revoke.
- **Until answered (TSK-0035), all PROPOSED:**
  - Configuration key `access.recovery` = `maxReissuesPerProjectPerDay: 3` (`proposed = true`, migration 0034), and 10 reissue requests per client network per hour (route limit).
  - A project whose newest grant was revoked by staff, or for an account deletion, is not sent a new link on request (the same neutral answer); staff restore access.
  - The visitor gives the email or mobile phone on the request, plus the request reference when the browser no longer holds the old link; the new link goes only to the contact on file.
  - Recovery page wording (customer catalog `access.recover.*`, `access.ended.*`): "Ask for a new secure link"; "Enter the email or mobile phone on your request. If it matches a HandyHub request, we'll send a new secure link to the contact details on that request."; "Thanks. If these details match a HandyHub request, a new secure link is on its way to the contact details on that request. It opens your project only after a one-time code."; "That code can't be used anymore" / "It may have expired, or there were too many tries. Ask for a new code. No project information is shown here."
  - While the access message itself has no released wording ([[OQ-ACCESS-LINK-WORDING]]), asking for a new link answers "A new link can't be requested here right now. Your request is saved." for every visitor alike: nothing claims a link is on its way that cannot be sent.
