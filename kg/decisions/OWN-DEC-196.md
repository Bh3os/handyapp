---
id: OWN-DEC-196
type: decision
title: "Rules Review D: wider re-review triggers, acknowledgment before continuing, and print metadata on every packet copy"
status: active
area: field
links:
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-SERVER-AUTHZ]]"]
  related: ["[[OWN-DEC-192]]", "[[OWN-DEC-171]]", "[[HH-PKT-02]]", "[[HH-PKT-07]]", "[[OQ-PACKET-DETAILS]]"]
source: "owner answers 2026-10-21 R12 (Rules Review)"
---
Owner answer (round 12, Rules Review), section verbatim:

> D — Worker Job Packets
> D1: Any new or materially changed safety hazard, SOP, authorization restriction, site-access requirement, or scope must trigger mandatory worker re-review when relevant.
> Employees must acknowledge applicable critical revisions before continuing affected work.
> D2: Always generate packets from the latest authorized information.
> Printed and downloaded packets must include:
> * Packet revision
> * Generation timestamp
> * Job reference
> * Clear indication that printed copies may become outdated
> Require workers to check the latest packet before starting work.
> D3: Enforce existing staff permissions, rate limits, and customer privacy protections. Printed packets must not expose access codes or unnecessary private customer data.
> Maintain the existing worker-access policy: address and site-contact information available only during the authorized visit period or through a documented temporary exception.
> Approve D4, D5, and D6 with appropriate server-side access control.

Rules as built, as the owner reviewed them on the Rules Review page (2026-10-21):

- **D1** These count as critical changes, which require the worker to review the packet again: a new accepted scope, a raised or changed hold, a new SOP version, a worker added or removed, an address or property-type change, or a site-access or access-code change. Moved windows, photos, equipment and similar changes create a new version without forcing a re-review.
- **D2** The packet is brought up to date whenever it is opened, listed, printed or downloaded.
- **D3** Printing and the PDF use the "view job packet" permission, limited to 60 PDFs per staff member per hour. Prints leave out photos, access-code labels, prices and links.

Effect:
- D1: any new or materially changed safety hazard, SOP, authorization restriction, site-access requirement or scope is a critical change that requires the affected workers to review the packet again; they acknowledge applicable critical revisions before continuing the affected work ([[HH-DATA-08]]).
- D2: packets are always generated from the latest authorized information. Printed and downloaded copies carry the packet revision, the generation time, the job reference and a clear notice that printed copies may become outdated; workers check the latest packet before starting work.
- D3: staff permissions, rate limits and privacy protections stay; prints never show access codes or unnecessary private customer data; address and site-contact details only inside the authorized visit period or a documented temporary exception ([[OWN-DEC-171]]).
- Built by [[TSK-0147]]; acknowledgments with [[TSK-0072]], the check before start with [[TSK-0073]].
