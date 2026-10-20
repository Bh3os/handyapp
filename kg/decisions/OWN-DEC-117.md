---
id: OWN-DEC-117
type: decision
title: Customer and property records; reviewed merges and relinks
status: active
area: records
links:
  related: ["[[OWN-DEC-116]]", "[[HH-CRM-01]]", "[[HH-CRM-02]]", "[[HH-CRM-03]]", "[[HH-CRM-04]]", "[[HH-ID-01]]", "[[HH-ID-11]]", "[[HH-STAFF-05]]", "[[HH-SEC-06]]"]
  uses: ["[[ENT-Customer]]", "[[ENT-Property]]"]
source: "owner-answers-verbatim 2026-10-12T19:16:01.591Z [S3 Records]; decision-briefs 2026-10-12T19:16:59"
---
Owner, 2026-10-12, staff journey S3, customer and property records.

Question asked:
> Staff S3 - Customer and property records: each customer has contact details (with separate verified flags and channel permissions), language, marketing permission, properties (address, access notes, pets, parking), projects, documents, payments and a timeline of every message and action. Merging duplicate customers, and fixing a request linked to the wrong customer, are office actions with a reason, fully audited, and reversible by the owner. OK?

Owner wording:
> Yes, with these refinements:
>
> - Customer records contain contact details, separate email/phone verification, channel permissions, marketing permission, authorized properties, projects, documents, payments, and activity history.
> - Customer-facing content stays English. Staff can view the records through the English/Spanish interface.
> - Property records include the full address, access instructions, pets, parking, and when changeable details were last confirmed. Keep access codes separately protected and out of ordinary messages.
> - Office staff may propose or perform permitted duplicate merges and correct mistaken request links, with a required reason and audit record.
> - Before a merge, show both records and affected projects, documents, and payments. Do not automatically merge by matching email, phone, name, or address.
> - Preserve original IDs, history, approvals, and financial evidence. Let the owner reverse record-link changes without erasing subsequent legitimate activity.
> - Recheck customer access when records are merged or relinked. A mistaken link must not expose another customer’s history; revoke affected access when corrected.
> - Show only role-authorized records and timeline events. Internal notes and restricted incidents remain private.
>
> Implement, test, and publish on private staging.

Effect:
- Customer: contact details, separate email/phone verification, channel permissions, marketing permission, authorized properties, projects, documents, payments and activity history. Customer-facing content English; staff interface English/Spanish.
- Property: full address, access instructions, pets, parking, and when changeable details were last confirmed. Access codes live in a separately protected, role-limited, read-audited store and never appear in ordinary messages or exports.
- Office staff may propose or perform permitted merges and correct mistaken request links, with a required reason and an audit record. Before a merge both records and the affected projects, documents and payments are shown. Nothing is merged automatically by email, phone, name or address.
- Merging links to a survivor and keeps original IDs, history, approvals and financial evidence. The owner can reverse a link change without erasing later legitimate activity.
- Customer access is rechecked on every merge or relink; correcting a mistaken link revokes the affected sessions, guest links and account links so no other customer's history is exposed.
- When a property address changes, historic records keep the old address with an old-address notice ([[HH-ID-11]]).
- Only role-authorized records and timeline events show; internal notes and restricted incidents stay private.

Links: uses [[ENT-Customer]], [[ENT-Property]].
