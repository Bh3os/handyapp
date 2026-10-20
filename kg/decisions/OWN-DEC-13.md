---
id: OWN-DEC-13
type: decision
title: Keep business records separate
status: active
area: records
links:
  related: ["[[HH-ARC-01]]", "[[HH-DATA-01]]", "[[HH-DATA-05]]"]
  uses: ["[[ENT-Customer]]", "[[ENT-Property]]", "[[ENT-Request]]", "[[ENT-EstimateVersion]]", "[[ENT-Visit]]", "[[ENT-Job]]", "[[ENT-Invoice]]", "[[ENT-Payment]]"]
source: "vault-own-decisions.md OWN-DEC-13; owner facts L14 (2026-10-02)"
---
Owner wording (owner facts, 2026-10-02): "Keep customer, property, request, accepted estimate version, appointment, job, invoice and payment separate."

Effect:
- Customer, property, request, accepted estimate version, appointment (visit), job, invoice and payment are separate records with their own states, linked to each other.
- A request is not a lead record merged into the customer; an appointment is its own visit record.
- An accepted estimate version is immutable; later changes create new versions or change orders.
