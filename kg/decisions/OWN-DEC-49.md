---
id: OWN-DEC-49
type: decision
title: "The business email is on the owner's domain: info@handyhub247.com"
status: active
area: site
links:
  supersedes: ["[[OWN-DEC-43]]"]
  related: ["[[HH-CUS-05]]", "[[OWN-DEC-131]]"]
  uses: ["[[FACT-PUBLIC-CONTACT]]", "[[FACT-DOMAIN]]", "[[INT-Resend]]"]
  part_of: ["[[C01]]"]
source: "vault-own-decisions.md OWN-DEC-49; project chat 2026-10-06"
---
Partly replaced by [[OWN-DEC-131]]: the public email stays a placeholder.

Owner wording (project chat, 2026-10-06): "i,m gonna use handyhub247.com so write appropiate email for that domain". The address `info@handyhub247.com` was chosen by Claude at the owner's direction; the owner may choose another.

Effect:
- The public business email is `info@handyhub247.com`, shown in the footer, on About, Accessibility and Privacy, and in the structured data.
- Creating the mailbox and its DNS records (MX, SPF, DKIM, DMARC) is an owner step; mail to the address bounces until then.

Partly replaced by [[OWN-DEC-126]]: asked about the public phone and email, the owner answered "Keep placeholders".

Open:
- Whether the website shows `info@handyhub247.com` or a placeholder ([[OWN-DEC-126]] treated both as placeholders), and the domain ownership proof: [[OQ-PUBLIC-CONTACT]], [[OQ-DOMAIN-OWNERSHIP]].
