---
id: ENT-Refund
type: entity
title: "Refund, credit and write-off"
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-67]]", "[[OWN-DEC-118]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
source: "guide 22.1 Credit/Refund; 23 (Refund)"
---
Money paid back, a reduction of what is owed, or an uncollectible balance.

**Fields:** type; original payment or invoice link; amount in cents; reason; requested by; approved by; Square refund confirmation; state.

**States (refund):** `requested → approved → processing → succeeded / failed / needs_review`; credits `issued → applied / voided`.

**Invariants:** Owner-only approval with a fresh sign-in and reason; complete only after recorded confirmation; write-offs never automatic.

**Who may change:** staff may request; only the Owner approves and records.
