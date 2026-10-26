---
id: HH-CRM-02
type: requirement
title: Property record with access details, last-confirmed dates and address history
status: active
priority: P0
area: records
links:
  decided_by: ["[[OWN-DEC-117]]", "[[OWN-DEC-92]]", "[[OWN-DEC-40]]", "[[OWN-DEC-139]]"]
  depends_on: ["[[HH-CRM-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Property]]", "[[ENT-Customer]]", "[[FACT-PROPERTY-TYPES]]"]
  tested_by: ["[[T28]]", "[[T43]]"]
  part_of: ["[[S03]]"]
source: "guide 12.1 HH-CRM-02; OWN-DEC-117, OWN-DEC-92, OWN-DEC-40"
---
- A property record holds the full service address with unit, the property type ([[FACT-PROPERTY-TYPES]]), a separately scoped billing address if needed, the site contact and their authority, access windows and access instructions, parking and loading, occupants and pets, restricted areas, relevant power and water access, customer preparation, photos and known site flags.
- Each changeable detail records its source and the date it was last confirmed; staff see when it was last confirmed.
- Access codes are not stored here but in the protected store of [[HH-CRM-03]].
- When a property address changes, historic requests, estimates, jobs and invoices keep the address they were made with, and the record shows the old address as a former address.
- Field workers see a job's service address from visit confirmation through the service day; afterwards it is hidden from them.

**Built by [[TSK-0126]] (2026-10-25):** the site contact and their authority are recorded per project for visit confirmation: the customer (from their contact record) or a person they named, with name, role, a phone or email, how they were named, and what staff confirmed they may do (give access to the property, coordinate the visit; never money or contract changes). Each change is a new version, kept with who recorded it and when. PROPOSED details: [[OQ-SITE-CHECK-DETAILS]].
