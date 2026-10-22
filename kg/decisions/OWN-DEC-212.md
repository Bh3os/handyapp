---
id: OWN-DEC-212
type: decision
title: "Round 14 delivery rules: coordinated parallel work, merge checks beyond CI, protected staging and Owner Acceptance Testing before inviting customers, no claimed professional reviews"
status: active
area: ops
links:
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SYNTHETIC-DATA]]"]
  related: ["[[OWN-DEC-191]]", "[[OWN-DEC-192]]", "[[OWN-DEC-186]]", "[[OWN-DEC-181]]", "[[OWN-DEC-209]]", "[[OWN-DEC-210]]", "[[OWN-DEC-211]]", "[[OWN-DEC-162]]", "[[HH-OPS-06]]", "[[TSK-0070]]", "[[TSK-0071]]", "[[TSK-0072]]", "[[TSK-0119]]", "[[TSK-0123]]", "[[TSK-0127]]", "[[TSK-0130]]", "[[TSK-0141]]", "[[TSK-0142]]", "[[TSK-0143]]", "[[TSK-0111]]"]
source: "owner answers 2026-10-22 R14 (closing parts)"
---
Owner answer (round 14, 2026-10-22), closing parts verbatim:

> Parallel development tasks
> Continue the existing work:
>
> * TSK-0070–0072: My Day, loadouts, job packet acknowledgment
> * TSK-0119: messaging core and 28 templates
> * TSK-0123: time zones
> * TSK-0127: ZIP coverage
> * TSK-0130: financial approval thresholds
> * TSK-0141: staging Reset Test Data
> * TSK-0143: legal, CPA, insurance, and safety review packets
>
> Coordinate the parallel changes carefully.
> Before merging each PR:
>
> * Require passing CI.
> * Review security and migration effects.
> * Test interactions with previously merged features.
> * Prevent duplicate messaging, conflicting rule versions, and incompatible database changes.
> * Confirm that the implementation reflects the final Owner decisions.
> * Run integration tests after merging related branches.
>
> Passing CI alone does not automatically establish production readiness.
> Final requirements
> Record the 13 decisions in the Business Rules Registry, incorporating the amendments above.
> Also retain my Round 13 decisions:
>
> * Seven additional professional HandyHub message templates
> * Automatic overdue-invoice reminders at 3 and 7 days, with payment, dispute, and payment-plan safeguards
> * Spanish internal notes from Workers routed to Owner/Office for English customer replies
> * English-only customer-facing content
> * Protected staging and Owner Acceptance Testing before inviting customers
>
> Complete and deploy the validated work to private staging.
> Provide a consolidated implementation report identifying successful tests, remaining deficiencies, and genuine production blockers.
> Do not invent professional certifications or claim that external attorney, CPA, insurer, safety, or manual security review has been completed unless it actually occurred.
> Treat this as my final approval of all 13 readings with these amendments. Continue implementation without additional routine approval questions.

Effect:
- The seven parallel tasks continue: [[TSK-0070]], [[TSK-0071]], [[TSK-0072]] (My Day, loadouts, packet acknowledgment), [[TSK-0119]] (messaging core, now 28 templates, [[OWN-DEC-209]]), [[TSK-0123]] (time zones), [[TSK-0127]] (ZIP coverage), [[TSK-0130]] (financial approval thresholds), [[TSK-0141]] (staging Reset Test Data) and [[TSK-0143]] (the attorney, CPA, insurance and safety review packets).
- Before each pull request is merged, in addition to the required CI checks: security and migration effects are reviewed; interactions with features already merged are tested; duplicate messaging, conflicting rule versions and incompatible database changes are prevented; the change is checked against the final owner decisions. Integration tests run again after related branches merge. Passing CI alone never establishes production readiness.
- The 13 readings are recorded in the Business Rules Registry with the amendments ([[OWN-DEC-202]] to [[OWN-DEC-208]]); the registry is the map `kg/maps/MAP-BUSINESS-RULES-REGISTRY.md`.
- Retained round 13 decisions: the seven templates ([[OWN-DEC-209]]); automatic overdue-invoice reminders ([[OWN-DEC-210]]); Spanish worker notes reviewed by Owner or Office ([[OWN-DEC-211]]); English-only customer-facing content ([[OWN-DEC-162]]); protected staging and Owner Acceptance Testing before any customer is invited (phase 1 of [[OWN-DEC-191]], [[HH-OPS-06]], [[TSK-0142]]), unchanged.
- Validated work is deployed to private staging; a consolidated implementation report lists the successful tests, the remaining deficiencies and the genuine production blockers ([[TSK-0111]]).
- No professional certification is invented, and no attorney, CPA, insurer, safety or manual security review is reported as done unless it actually happened ([[OWN-DEC-186]], [[RULE-HUMAN-REVIEW]]); manual accessibility tests stay UNVERIFIED ([[OWN-DEC-181]]).
