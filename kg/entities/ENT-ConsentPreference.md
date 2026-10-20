---
id: ENT-ConsentPreference
type: entity
title: "Consent and communication preference"
status: active
area: privacy
links:
  decided_by: ["[[OWN-DEC-93]]", "[[OWN-DEC-113]]", "[[OWN-DEC-109]]", "[[OWN-DEC-147]]"]
source: "guide 22.1 ConsentPreference"
---
Append-only records of a contact's permissions per purpose and channel.

**Fields:** subject; purpose (service communication, transactional texts (SMS opt-in), marketing, photo publication per asset); channel; phone number for SMS; notice or disclosure version; source (for example the request form); evidence; time; withdrawal.

**Invariants:** service communication, marketing and photo publication are separate; having a phone number is not texting consent; the latest record is the current state; texts need a current SMS opt-in ([[HH-INT-22]], [[OWN-DEC-147]]); STOP on SMS withdraws it and START records a new one; checked at send time.

**Who may change:** the customer; Office and Owner record a customer's instruction with evidence.
