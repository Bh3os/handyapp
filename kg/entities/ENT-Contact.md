---
id: ENT-Contact
type: entity
title: "Contact"
status: active
area: records
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-61]]", "[[OWN-DEC-93]]"]
source: "guide 22.1 Contact; 23 (Contact verification)"
---
A person reached about the customer's work.

**Fields:** name; email; phone; separate email and phone verification states; preferred channel (email, call, text); channel permissions; relationship; authority flags.

**States (per contact value):** `unverified → pending → verified`; `pending → expired / failed`; a changed value starts a new verification.

**Invariants:** verifying email never marks phone verified, or the reverse; verification belongs to the exact value; a shared contact between customers goes to review.

**Who may change:** the customer (with re-verification); Office and Owner with a reason.
