---
id: HH-COM-13
type: requirement
title: "Owner-worded templates rendered from a validated variable registry"
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-151]]", "[[OWN-DEC-158]]", "[[OWN-DEC-209]]"]
  depends_on: ["[[HH-COM-04]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-Message]]", "[[ENT-PolicyVersion]]", "[[FACT-PUBLIC-CONTACT]]"]
  tested_by: ["[[T74]]"]
  part_of: ["[[S06]]"]
source: "OWN-DEC-151, OWN-DEC-158 (new behaviour; no guide id)"
---
- The 21 templates of [[OWN-DEC-151]] are released template versions with their template ID, subject, HTML body and plain-text body, English only. Earlier released wording ([[OWN-DEC-150]], [[OWN-DEC-98]], [[OWN-DEC-102]], [[OWN-DEC-110]]) stays released.
- One central registry declares every template variable: name, meaning, type, required or optional, the record it is read from, and whether it may appear in a subject. A template may use only registered variables; a release that names an unregistered or unavailable variable is refused.
- Before rendering, every required variable is resolved for the message's own project and recipient. A missing value never falls back to another record, a literal placeholder or invented text: the message is held as failed with the reason and shown to staff.
- Untrusted text is escaped for HTML; links must resolve and point only at permitted hosts; sensitive values never reach logs, previews or analytics.
- Content rules ([[OWN-DEC-158]]): the first name in the greeting ("Hi there," when missing) and non-sensitive reference numbers are allowed; amounts, property addresses, access codes, tokens and private details never appear.
- A branded, mobile-responsive layout with a plain-text alternative and the footer contact read from configuration ([[FACT-PUBLIC-CONTACT]]).
- Tests cover all 21 templates: subject, wording, substitutions, no unresolved placeholder, HTML and text rendering, links and fallbacks.

**Changed by [[OWN-DEC-209]] (2026-10-22):** the registry holds 28 templates (the 21 plus seven), all rendered through the same variable registry.
