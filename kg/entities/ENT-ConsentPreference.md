---
id: ENT-ConsentPreference
type: entity
title: "Consent and communication preference"
status: active
area: privacy
links:
  decided_by: ["[[OWN-DEC-93]]", "[[OWN-DEC-113]]", "[[OWN-DEC-109]]"]
source: "guide 22.1 ConsentPreference"
---
Append-only records of a contact's permissions per purpose and channel.

**Fields:** subject; purpose (service communication, marketing, photo publication per asset); channel; notice version; evidence; time; withdrawal.

**Invariants:** service communication, marketing and photo publication are separate; having a phone number is not texting consent; the latest record is the current state; STOP on SMS withdraws that channel; checked at send time.

**Who may change:** the customer; Office and Owner record a customer's instruction with evidence.
