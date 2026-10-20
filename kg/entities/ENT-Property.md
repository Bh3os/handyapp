---
id: ENT-Property
type: entity
title: "Property"
status: active
area: records
links:
  decided_by: ["[[OWN-DEC-117]]", "[[OWN-DEC-92]]", "[[OWN-DEC-40]]", "[[OWN-DEC-139]]"]
  uses: ["[[FACT-PROPERTY-TYPES]]"]
source: "guide 22.1 Property; HH-CRM-02"
---
A service location.

**Fields:** street, unit, city, state, ZIP; property type (one of [[FACT-PROPERTY-TYPES]]); IANA time zone; year built with provenance (for home-age limits); occupants and pets; parking and loading; restricted areas; utilities; non-secret access notes; last-confirmed date per changeable detail; address history; coverage result.

**Invariants:** the address is never public; old addresses stay on historic records; access codes live only in [[ENT-AccessInstructionSecret]]; details are reconfirmed per job.

**Who may change:** Office and Owner; workers add site observations but do not edit the profile; the customer confirms details.
