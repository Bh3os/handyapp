---
id: HH-LANG-01
type: requirement
title: Customer routes, forms, portal, documents and messages in English only
status: active
priority: P0
area: i18n
links:
  decided_by: ["[[OWN-DEC-45]]", "[[OWN-DEC-59]]", "[[OWN-DEC-162]]"]
  constrained_by: ["[[RULE-LANGUAGES]]"]
  tested_by: ["[[T04]]"]
  part_of: ["[[C01]]", "[[C06]]"]
source: "guide 26.1; OWN-DEC-45"
---
- English for every customer surface: public routes, forms and their errors, the project workspace, estimates, invoices, receipts, appointment pages, and every transactional email and text template.
- No Spanish customer routes and no customer language switcher.
- Former Spanish public URLs (`/es/...`) answer with a 301 redirect to the matching English page ([[OWN-DEC-45]]). Historical records are never deleted or rewritten because of this.

**Changed by [[OWN-DEC-162]] (2026-10-21):** confirmed by the owner on 2026-10-21.
