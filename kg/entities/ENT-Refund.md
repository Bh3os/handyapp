---
id: ENT-Refund
type: entity
title: "Refund, credit and write-off"
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-67]]", "[[OWN-DEC-118]]", "[[OWN-DEC-134]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-CANCELLATION-RULES]]"]
source: "guide 22.1 Credit/Refund; 23 (Refund)"
---
Money paid back, a reduction of what is owed, or an uncollectible balance.

**Fields:** type; original payment or invoice link; amount in cents; reason; requested by; approved by; Square refund confirmation; state.

**States (refund):** `requested → approved → processing → succeeded / failed / needs_review`; credits `issued → applied / voided`.

**Invariants:** Owner-only approval with a fresh sign-in and reason ([[OWN-DEC-138]]); complete only after recorded confirmation; write-offs never automatic; a cancellation refund or the $50.00 late-cancellation amount follows [[FACT-CANCELLATION-RULES]].

**Who may change:** staff may request; only the Owner approves and records.
