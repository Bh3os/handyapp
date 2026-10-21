---
id: OWN-DEC-85
type: decision
title: Accessibility testing and fixes by AI with the available tools; screen-reader and device checks recorded as unverified
status: active
area: a11y
links:
  related: ["[[HH-A11Y-01]]", "[[HH-A11Y-02]]", "[[HH-A11Y-03]]", "[[OWN-DEC-181]]"]
  tested_by: ["[[T69]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
source: "vault-own-decisions.md OWN-DEC-85; owner-answers-verbatim.md 2026-10-12T16:57"
---
Partly replaced by [[OWN-DEC-181]] (2026-10-21): nobody performs the manual screen-reader and device test before launch; it stays UNVERIFIED; Lighthouse joins the automated checks.

Owner wording (project chat, 2026-10-12, answering who does the manual accessibility check): "Have the AI complete accessibility testing and fixes before launch using automated scans and available browser tools. Test keyboard navigation, focus, forms/errors, dialogs, mobile layouts, large text, contrast, and accessible names across customer and staff workflows. Fix issues, rerun checks, and record actual results. Do not mark keyboard/browser testing as screen-reader testing unless a real screen reader was used. Complete every check the available tools support. Record unsupported screen-reader or physical-device checks as unverified, with the remaining limitation clearly stated. Do not claim full accessibility conformance from automated checks alone."

Effect:
- Before launch, automated scans and browser tools test keyboard navigation, focus, forms and errors, dialogs, mobile layouts, large text, contrast and accessible names across the customer and staff workflows.
- Issues are fixed, checks rerun, and the actual results recorded.
- Keyboard or browser testing is never reported as screen-reader testing unless a real screen reader was used.
- Screen-reader and physical-device checks the tools cannot do are recorded as unverified, with the limitation stated.
- No claim of full accessibility conformance is made from automated checks alone.
- RISK: screen-reader and physical-device behaviour stays unverified until a person tests it.

Open:
- A person's screen-reader and physical-device test: [[OQ-A11Y-MANUAL-TEST]].
