---
id: HH-INC-02
type: requirement
title: "Incident details restricted; customer communication reviewed"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-124]]", "[[OWN-DEC-108]]"]
  depends_on: ["[[HH-STAFF-05]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Case]]", "[[ENT-Photo]]", "[[ENT-Message]]"]
  tested_by: ["[[T54]]", "[[T24]]"]
  part_of: ["[[S10]]"]
source: "guide 18.2 HH-INC-02; OWN-DEC-124"
---
- Detailed incident records and attachments are in the `restricted_incident` class: readable only by the Owner and the reporting worker for their own report (PROPOSED from plan 27), enforced on the server for lists, search, files and exports.
- An incident attachment never joins the shared project gallery or any worker-wide feed.
- Customers see only an appropriate acknowledgment, progress updates and the next step; for a safety pause, "Work is paused for safety review." Customer messages about an incident are staff-released after review.
