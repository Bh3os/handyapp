---
id: OWN-DEC-03
type: decision
title: Service area Kentuckiana in Kentucky and Indiana
status: active
area: business
links:
  related: ["[[HH-CUS-03]]", "[[HH-LEAD-02]]"]
  uses: ["[[FACT-SERVICE-AREA]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  part_of: ["[[C01]]"]
source: "vault-own-decisions.md OWN-DEC-03; owner facts L4 (2026-10-02)"
---
Owner wording (owner facts, 2026-10-02): "Serve Kentuckiana in Kentucky and Indiana; exact ZIPs, local qualifications, licenses, permits and taxes require configured review."

Effect:
- HandyHub serves Kentuckiana, on both the Kentucky and the Indiana side.
- Jurisdiction-sensitive rules (licenses, permits, taxes, qualifications) are stored as configuration with source, date and jurisdiction. Kentucky and Indiana are assessed separately.
- No page, document or message states that HandyHub is compliant in either state.

Partly replaced by [[OWN-DEC-37]]: the area is defined as eleven whole counties. [[OWN-DEC-82]]: the owner checks licenses and permits outside the software. [[OWN-DEC-83]]: no tax line for now.

Open:
- Tax treatment in each state: [[OQ-TAX-CPA]].
- Licensed-trade and permit boundaries per municipality: [[OQ-PERMITS-LICENSING]].
