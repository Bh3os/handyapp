---
id: OWN-DEC-122
type: decision
title: No separate settings activation: decided values are active configuration
status: active
area: platform
links:
  related: ["[[OWN-DEC-34]]", "[[OWN-DEC-37]]", "[[OWN-DEC-42]]", "[[OWN-DEC-54]]", "[[OWN-DEC-78]]", "[[OWN-DEC-83]]", "[[OWN-DEC-102]]", "[[OWN-DEC-128]]", "[[RULE-DECIDED-VALUES-ACTIVE]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[FACT-BUSINESS-ADDRESS]]", "[[FACT-PAYMENT-INSTRUCTIONS]]", "[[FACT-PUBLIC-CONTACT]]"]
source: "owner-answers-verbatim 2026-10-12T19:44:11.908Z [S8 Settings]; decision-briefs 2026-10-12T19:44:58"
---
Owner, 2026-10-12, staff journey S8, owner settings.

Question asked:
> Staff S8 - Owner settings: one 'Business settings' area where the Owner enters and activates owner-controlled values: business details (issuer name/address), service area, hours (8 AM–10 PM), deposit rule, estimate validity, payment methods and their instructions (Zelle/Cash App/Chime handles), reminder cadences, reopen period, retention periods, visit-fee policy (off), and which messages send automatically. Each change creates a new version with who/when; nothing applies until the Owner presses Activate. Unset values show NOT CONFIGURED and block the feature that needs them. OK?

Owner wording:
> Do not build a separate Business Settings setup or activation process that blocks the workflows. Configure the project directly using my latest instructions and decisions. Treat those decisions as approved; do not leave them awaiting activation or ask me to repeat them.
>
> Finish both websites and all connected functionality, preserve the premium design, test the complete journeys, and publish the completed features on private staging for me to check.
>
> If essential information is genuinely missing, ask only for that specific information and continue everything else. Do not invent business details or remove the safety, access, and customer-approval protections we agreed on.

Effect:
- There is no Business Settings setup or Activate step that blocks a workflow. Every value the owner decided is configured directly as active, versioned and audited configuration citing its OWN-DEC id ([[RULE-DECIDED-VALUES-ACTIVE]]).
- This replaces every earlier "pre-filled as PROPOSED for the owner to activate" step, including those recorded with [[OWN-DEC-34]] (validity), [[OWN-DEC-37]] and [[OWN-DEC-54]] (coverage ZIP data), [[OWN-DEC-42]] (deposit), [[OWN-DEC-78]] (reminder cadence) and [[OWN-DEC-83]] (no tax line), and the price-book activation gate ([[OWN-DEC-102]]). The values of those decisions stay in force; only their activation step is gone.
- Only genuinely missing facts are asked for (for example [[FACT-BUSINESS-ADDRESS]], [[FACT-PAYMENT-INSTRUCTIONS]], [[FACT-PUBLIC-CONTACT]]); they get a narrow "missing" state on the exact output that needs them and labelled TEST values on staging, and are never invented ([[RULE-NO-INVENTED-FACTS]]).
- Safety, access and customer-approval protections stay exactly as agreed ([[RULE-SAFETY-GATES]]).
- Both websites and their connected functionality are finished, tested end to end and published on private staging for the owner's review.
- Exception handled later: the no-tax-line setting in the old repo still needed one activation ([[OWN-DEC-128]]); in the rebuild it is seeded active like every other decided value.

Links: uses [[FACT-BUSINESS-ADDRESS]], [[FACT-PAYMENT-INSTRUCTIONS]], [[FACT-PUBLIC-CONTACT]].
