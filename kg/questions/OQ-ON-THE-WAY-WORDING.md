---
id: OQ-ON-THE-WAY-WORDING
type: question
title: Wording of the automatic on-the-way notice
status: open
area: messaging
links:
  related: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[OWN-DEC-107]]", "[[HH-PORT-07]]", "[[HH-SCH-08]]", "[[HH-COM-06]]", "[[TSK-0070]]"]
source: "TSK-0070 (2026-10-21): FACT-AUTOMATIC-MESSAGES #12 and OWN-DEC-107 name when the notice sends and what it carries, not its text"
---
**Question:** which exact subject and body should the automatic on-the-way notice (#12, `visit.on_the_way`) use, by email and by text? The owner decided that it sends automatically with the assigned workers' first names and the confirmed arrival window, without an ETA or live tracking ([[OWN-DEC-107]]), but gave no wording.

- **Who answers:** the owner (approve a wording, as for the question notice of [[OWN-DEC-98]]).
- **Known:** it may use `{workerFirstNames}` (the first word of each assigned worker's display name, lead first; a worker without a display name is left out) and `{arrivalWindow}` (the confirmed date and arrival window in the property's zone, filled at send time). It carries no ETA, no location, no tracking link, no private detail and no amount ([[HH-PORT-07]], [[FACT-AUTOMATIC-MESSAGES]]). The secure project link is not supplied to it yet, as for the other automatic notices.
- **Until answered:** no template version of `visit.on_the_way` is released. The automation still runs once per visit that an assigned worker's accepted "On my way" moved on the way, and records each delivery as failed with `template_not_configured`; staff see the delivery issue with Retry. Nothing is shown as sent, and the visit stays on the way.
