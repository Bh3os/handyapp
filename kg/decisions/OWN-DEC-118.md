---
id: OWN-DEC-118
type: decision
title: Estimators and the owner publish estimates directly
status: active
area: estimates
links:
  related: ["[[OWN-DEC-102]]", "[[HH-EST-01]]", "[[HH-EST-04]]", "[[HH-FIN-03]]", "[[HH-STAFF-03]]"]
  uses: ["[[FACT-ESTIMATE-VALIDITY]]", "[[FACT-DEPOSIT-RULE]]", "[[ROLE-ESTIMATOR]]", "[[ROLE-OWNER]]"]
source: "owner-answers-verbatim 2026-10-12T19:31:46.613Z [S4 Publish]; decision-briefs 2026-10-12T19:32:02"
---
Owner, 2026-10-12, staff journey S4, who publishes an estimate.

Question asked:
> Staff S4 - Who can publish an estimate: an Estimator or the Owner writes or uploads it. Should every estimate need the Owner's internal approval before it is published to the customer, or can Estimators publish on their own (the Owner can still see and revise everything)?

Owner wording:
> Estimators and the owner may write or upload estimates and publish them directly. Do not require owner approval for every estimate.
>
> Before publishing, validate the scope, prices, total, options, exclusions, terms, 14-day validity, and applicable deposit. Uploaded documents must match the structured amounts.
>
> The owner can view all estimates, change publishing permissions, and revise estimates through a new version. Never silently edit a published or accepted estimate.
>
> Keep deposit waivers, refunds, and other owner-only decisions restricted to the owner. Log who created, revised, and published each version.
>
> Implement, test, and publish on private staging.

Effect:
- Estimators and the Owner write or upload estimates ([[OWN-DEC-102]]) and publish them without a per-estimate owner approval.
- Pre-publish validation: scope, prices, total, options, exclusions, terms, 14-day validity ([[FACT-ESTIMATE-VALIDITY]]) and any deposit ([[FACT-DEPOSIT-RULE]]); uploaded documents must match the structured amounts.
- Publishing permission is a policy setting the owner can change (default: Estimator and Owner); a role without it is refused on the server.
- The owner sees all estimates and revises through a new version; a published or accepted estimate is never edited silently.
- Deposit waivers, refunds and other owner-only decisions stay owner-only.
- The creator, reviser and publisher of each version are logged and shown in the version history.

Links: uses [[FACT-ESTIMATE-VALIDITY]], [[FACT-DEPOSIT-RULE]], [[ROLE-ESTIMATOR]], [[ROLE-OWNER]].
