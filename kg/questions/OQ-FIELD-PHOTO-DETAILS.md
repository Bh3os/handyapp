---
id: OQ-FIELD-PHOTO-DETAILS
type: question
title: Field photo, customer sharing and photo publication details no decision gives
status: open
area: privacy
links:
  related: ["[[HH-QA-05]]", "[[HH-PORT-11]]", "[[HH-PRIV-02]]", "[[HH-DATA-07]]", "[[HH-STAFF-05]]", "[[HH-SEC-05]]", "[[ENT-Photo]]", "[[ENT-ConsentPreference]]", "[[ENT-CareInstruction]]", "[[OWN-DEC-50]]", "[[OWN-DEC-106]]", "[[OWN-DEC-109]]", "[[OQ-START-GATE-DETAILS]]", "[[RULE-HUMAN-REVIEW]]", "[[TSK-0076]]", "[[TSK-0083]]", "[[TSK-0132]]"]
source: "TSK-0076 (2026-10-22): HH-QA-05, HH-PORT-11 and HH-PRIV-02 state the rules; the details below are PROPOSED, NOT CONFIGURED or wait for later tasks"
---
**Question:** does the owner approve, or change, these PROPOSED details of field photos, sharing with the customer and photo publication permissions?

- **Who answers:** the owner; the publication notice wording also with the attorney ([[RULE-HUMAN-REVIEW]]).
- **Decided, in use:** job photos are internal by default; only an audited share action by an authorized staff member makes one customer-visible; internal photos are refused by URL and ID, not merely hidden ([[OWN-DEC-106]], [[HH-DATA-07]]); customer sharing never grants marketing use, which is a separate permission per asset, purpose, channel and notice version with the customer's evidenced consent ([[HH-PRIV-02]], [[OWN-DEC-109]]); originals are kept unchanged; only the Owner marks media marketing-eligible ([[ROLE-MATRIX]]); "Latest projects" uses only real job photos with the customer's permission ([[OWN-DEC-50]]).
- **PROPOSED, in use on private staging:**
  - The before photos of the Start Work gate and the after photos are one record (field photo) per work package and visit, phase before or after. An after photo needs its uploader's own Start Work on the visit; it may name the before photo of the same work package it pairs with; the worker may add an area or task label (staff only, never shown to the customer).
  - Field photos are quarantined until the stored original is checked again (as request photos); only ready photos are served, shared or published; a rejected before photo does not count for the gate.
  - Owner and Office share (Office's cell is PROPOSED in [[ROLE-MATRIX]]); sharing is possible at any time, not only at handoff (the handoff step itself is [[TSK-0083]]); a restricted photo is never shared. Staff may stop sharing a photo: it returns to internal and the customer loses it at once (a link already issued expires within 5 minutes).
  - The customer's Photos tab lists their own uploads and the shared photos grouped by service (the service's catalog name), before and after side by side where staff paired them and both are shared. Signed links last 5 minutes and renew with the page refresh; a photo also opens by its ID through the project.
  - Publication permission: purpose "marketing", channel "website" only (the one decided use, [[OWN-DEC-50]]); evidence is how the customer gave it (signed form, email, text message) and a staff reference to where it is kept; only the Owner records a grant or a withdrawal; the latest record per photo, purpose and channel is current; a grant never shares the photo.
  - Staff wording EN and ES (`photos.*`, `myday.openPhotos`) and customer wording (`portal.photos.*`): "Photos you sent", "Before and after photos from HandyHub", "HandyHub shares these photos with you. Sharing them here does not publish them.", "Before", "After", "{service}: before/after", "Your photo {n} is being checked." / "could not be used.", "This photo cannot be shown right now.", "Photo links work for a few minutes and renew when this page refreshes.", "When HandyHub asks you for photos, you can add them to your reply to the question."
- **NOT CONFIGURED:** the photo publication notice (`media.publication_notice`, migration 0080): its wording is legal text no node gives, so no publication permission can be recorded until the owner supplies the attorney-reviewed version; the staff page says so. No feature publishes photos yet (the "Latest projects" section and its public derivatives come later), so a withdrawal has no published copy to review; the review of published copies that [[HH-PRIV-02]] requires opens with that feature. Customer self-service consent to publication waits for the notice too.
- **Later tasks:** the care-note half of [[HH-QA-05]] and [[T57]] (approved care instructions on the completed job, the line without product guidance flagged to staff) needs a completed job and the completion summary: [[TSK-0083]] and [[TSK-0132]]. The minimum photos per work package for quality checks come from configuration in [[TSK-0083]].
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
