---
id: ENT-Question
type: entity
title: "Staff question to the customer"
status: active
area: intake
links:
  decided_by: ["[[OWN-DEC-98]]", "[[OWN-DEC-101]]", "[[OWN-DEC-197]]"]
source: "OWN-DEC-98, OWN-DEC-101"
---
A structured follow-up item published in a project.

**Fields:** project; text; author; published time; notice delivery state and successful-send time; replies (text, photos, "I'm not sure"), authors and times; reminder drafts.

**States:** `draft → published (Waiting on you) → answered`; unanswered requests may close "Closed—no response" and reopen within [[FACT-REOPEN-PERIOD]].

**Invariants:** append-only history; reminders measured from the successful send and stopped by a reply; never asks a customer to inspect a hazardous area.

**Who may change:** Office, Estimator and Owner publish; the verified customer replies.

**Changed by [[OWN-DEC-197]] (2026-10-21), built by [[TSK-0148]]:** a question also records whether the customer may answer "I'm not sure" (set when publishing, any question; always for a measurement; never changed). A "Closed—no response" request may also be reopened by authorized staff with a reason.
