---
id: OQ-PACKET-ACKNOWLEDGMENT
type: question
title: The packet acknowledgment details no decision gives
status: open
area: field
links:
  related: ["[[HH-DATA-08]]", "[[HH-WORK-10]]", "[[HH-PKT-02]]", "[[HH-CHG-03]]", "[[HH-STAFF-02]]", "[[HH-OFF-06]]", "[[ENT-Acknowledgment]]", "[[OWN-DEC-121]]", "[[OWN-DEC-123]]", "[[OQ-PACKET-DETAILS]]", "[[OQ-SAFETY-REVIEW]]", "[[TSK-0070]]", "[[TSK-0071]]", "[[TSK-0072]]", "[[TSK-0073]]", "[[TSK-0080]]", "[[TSK-0094]]", "[[TSK-0100]]", "[[OWN-DEC-196]]", "[[TSK-0147]]"]
source: "TSK-0072 (2026-10-21): HH-DATA-08 and HH-WORK-10 state the rules; the details below are PROPOSED or wait for later tasks"
---
**Question:** does the owner approve, or change, these PROPOSED details of the personal packet acknowledgment?

- **Who answers:** the owner; the wording of what a worker affirms when acknowledging (and its Spanish text) with the competent safety review ([[OQ-SAFETY-REVIEW]]), because it is a safety acknowledgment.
- **Decided, in use:** a worker acknowledges the packet personally; nobody acknowledges for another person and nobody inherits another worker's acknowledgment; a critical change (scope, approved change order, hazard or hold, SOP version, site access, assignment) ends the affected workers' acknowledgments until they review the new version; a newly assigned worker always reviews personally; a removed worker loses the packet and the access codes on the next request ([[HH-DATA-08]], [[HH-WORK-10]], [[OWN-DEC-121]]). An acknowledgment never releases a hold and is not the Start Job gate by itself ([[RULE-SAFETY-GATES]]).
- **PROPOSED, in use on private staging:**
  - Who may acknowledge: anyone with "View job packet" who is personally assigned to the job right now (an active confirmed reservation on a live visit, inside its access window). The role matrix has no acknowledgment row; the Owner, Office and Estimator see each assigned worker's state but cannot acknowledge unless they are assigned themselves.
  - What is acknowledged: the whole packet version (one kind, `packet`), recorded with the exact content digest, the scope version and the SOP versions it covered. Only the latest version can be acknowledged, and only with the digest the worker read; a version that changed meanwhile is refused ("review the new version"). Acknowledging also records the view of that version. Acknowledging the standing version again adds nothing.
  - Who a critical change affects: every worker assigned to the job, for every critical change (nothing is narrowed to one visit or task). A non-critical change (a moved window, an occupant detail, photos, equipment, job or deposit state) keeps the acknowledgment and is listed as "changed since you acknowledged it".
  - When a removal ends an acknowledgment: when the worker's last active confirmed reservation on a live visit of the job ends (reassignment, cancellation, release), checked at commit; a reschedule that re-creates the same worker's reservation in the same transaction keeps it. Assigned again later, the worker reviews again.
  - A disabled account (offboarding, [[HH-STAFF-02]]) ends every acknowledgment of that person in the disabling transaction; a re-enabled account reviews again.
  - Every end is recorded once (critical change, assignment removed, account disabled), by the database in the same transaction as its cause; acknowledgments and their ends are append-only (retention: job records and safety records).
  - A loadout task block raised or ended ([[TSK-0071]]) is a hold change, so a critical change: it ends every assigned worker's acknowledgment. My Day lists the worker's own acknowledgment as missing or ended among the readiness items ([[TSK-0070]]); On my way, Arrived and Finished never depend on it and never restore it. In a privacy request the acknowledgments and their ends are retained job records ([[TSK-0100]]).
  - The worker ticks "I reviewed this packet myself: the open tasks, hazards and holds, approved changes, tools and equipment, prior photos and this version" before the Acknowledge button works (wording PROPOSED, English and a plain Spanish translation).
- **Not built here, waiting for later tasks:** the Start Job gate reading the acknowledgment inside the start transaction ([[TSK-0073]], through `packetAcknowledgment()`); offline sync, reconnect revalidation and quarantine of a revoked worker's pending evidence ([[TSK-0080]]); resuming after an incident with renewed checks ([[TSK-0094]]); unresolved checklist tasks and prior field evidence in the review list once those records exist. No message tells a worker that their acknowledgment ended (no approved wording): they see it in the packet and on My Day.
- **Until answered:** the PROPOSED details above are used; each is a small code change.
- **Since 2026-10-21:** [[OWN-DEC-196]] D1 makes any new or materially changed hazard, SOP, authorization restriction, site-access requirement or scope a critical revision that workers acknowledge before continuing the affected work; the triggers beyond those built here are [[TSK-0147]], the check before continuing is [[TSK-0073]].

**Updated by [[TSK-0094]] (2026-10-25):** resuming after an incident reads the acknowledgment like a start: the hold's release makes a new packet version, so each worker views and acknowledges it again before resuming. Details in [[OQ-RETURN-WORK-DETAILS]].
