---
id: OWN-DEC-58
type: decision
title: The estimate request form open on staging for the owner's testing
status: superseded
area: ops
links:
  superseded_by: ["[[OWN-DEC-73]]"]
  related: ["[[HH-INT-01]]"]
source: "vault-own-decisions.md OWN-DEC-58; project chat 2026-10-12"
---
Owner wording (project chat, 2026-10-12): "the request form is not working"; asked whether to open the form on staging for testing, the owner chose "Open it on staging now". Told that the open staging form accepts personal data while the privacy notice is not attorney-approved, the owner chose "Keep it open on staging".

Recorded approach (2026-10-12): both intake switches were opened on the public staging service; staging kept noindex and the preview notice; requests landed in the staging database; production stayed closed until the go decision.

Superseded by [[OWN-DEC-73]]: the whole staging environment is behind an access gate for the owner and authorized testers, and the forms stay enabled behind it. That replaces the public, ungated form of this decision.
