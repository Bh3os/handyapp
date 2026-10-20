---
id: ENT-Question
type: entity
title: "Staff question to the customer"
status: active
area: intake
links:
  decided_by: ["[[OWN-DEC-98]]", "[[OWN-DEC-101]]"]
source: "OWN-DEC-98, OWN-DEC-101"
---
A structured follow-up item published in a project.

**Fields:** project; text; author; published time; notice delivery state and successful-send time; replies (text, photos, "I'm not sure"), authors and times; reminder drafts.

**States:** `draft → published (Waiting on you) → answered`; unanswered requests may close "Closed—no response" and reopen within [[FACT-REOPEN-PERIOD]].

**Invariants:** append-only history; reminders measured from the successful send and stopped by a reply; never asks a customer to inspect a hazardous area.

**Who may change:** Office, Estimator and Owner publish; the verified customer replies.
