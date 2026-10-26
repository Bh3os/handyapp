---
id: HH-DATA-03
type: requirement
title: Accepted versions and issued financial evidence immutable; safe data migration
status: active
priority: P0
area: records
links:
  decided_by: ["[[OWN-DEC-31]]", "[[OWN-DEC-45]]", "[[OWN-DEC-130]]"]
  depends_on: ["[[HH-DATA-01]]"]
  uses: ["[[ENT-EstimateVersion]]", "[[ENT-Approval]]", "[[ENT-ChangeOrder]]", "[[ENT-Invoice]]", "[[ENT-Payment]]"]
  tested_by: ["[[T32]]", "[[T35]]", "[[T03]]", "[[T72]]"]
source: "guide 22.2, 29.1"
---
- Accepted estimate revisions, approved change-order revisions, approval evidence and issued financial records (invoices, receipts, recorded payments, credits, refunds) are immutable. A correction is a new superseding record that links to the original and is audited.
- Rate, catalog or policy updates never rewrite history: an accepted estimate keeps its prices after a catalog change, and a material scope change needs a new approval (T35).

Migrating data into the rebuilt app (for example from the old staging database, [[OWN-DEC-130]]), guide 29.1:
- back up and inspect the source schema and data first; rehearse the restore with synthetic or authorized restored data;
- map old service, status, locale and price-policy fields to the new meaning; keep stable IDs, accepted snapshots, invoice and payment totals and media links;
- carry no minimum calculation into new estimates and retire any obsolete minimum configuration, keeping historical evidence; templates, APIs, calculators, seeds, fixtures, reports and validation must all agree;
- keep localization staff-only; old Spanish customer routes redirect to English ([[OWN-DEC-45]]) without corrupting historical documents or staff safety translations;
- backfill links and grants cautiously: matching contact values never justify account-wide access; unresolved ownership stays pending review;
- use expand, backfill, validate, contract where compatibility needs it; backfills are restartable and report counts and errors;
- compare before and after: customer, project, job, invoice and payment counts, relationship integrity, totals, accepted hashes and versions, and attachment availability.

**Limitation (owner decision; reviewer: Owner):** No import of records from the previous system was decided or built ([[OWN-DEC-130]]): safe data migration is proven on this repository's own migrations and stored records, not on historical data.
