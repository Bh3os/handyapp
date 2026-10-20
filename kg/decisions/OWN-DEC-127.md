---
id: OWN-DEC-127
type: decision
title: Estimate terms v1.0 drafted from agreed policies only
status: active
area: approval
links:
  related: ["[[OWN-DEC-72]]", "[[OWN-DEC-103]]", "[[OQ-ATTORNEY-TERMS]]", "[[OQ-TERMS-OWNER-APPROVAL]]", "[[HH-EST-06]]", "[[HH-PRIV-04]]"]
  uses: ["[[FACT-ESTIMATE-VALIDITY]]", "[[FACT-DEPOSIT-RULE]]", "[[FACT-PAYMENT-DUE]]", "[[FACT-PAYMENT-METHODS]]", "[[FACT-TAX-NO-LINE]]", "[[FACT-NO-MINIMUM]]", "[[FACT-NO-SURCHARGE]]", "[[FACT-REOPEN-PERIOD]]", "[[FACT-BUSINESS-NAME]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "owner-answers-verbatim 2026-10-12T19:53:27.289Z [Terms]; decision-briefs 2026-10-12T19:54:06"
---
Owner, 2026-10-12, missing fact 4 (estimate terms).

Question asked:
> Missing fact 4 - Estimate terms: real customers can approve only terms you supply (attorney wording or your own). Staging uses clearly labeled TEST terms. What should happen for real approvals?

Owner wording:
> Finalize the estimate terms using my latest instructions and agreed policies. Write the complete wording, implement it in the estimate and approval screens, and save the exact terms version with every approval.
>
> Do not add policies I haven’t requested or leave the drafting unfinished. Publish the completed flow on private staging so I can review the actual wording and test approval.
>
> Keep staging approvals clearly marked TEST. My approval of the final wording for real customer use is the only remaining owner decision for this task.

Effect:
- Terms version 1.0 is written in full from the owner's agreed policies only, numbered by section in plain English, and shown readably on the estimate and approval screens; every approval saves the exact terms version ID and a content hash ([[OWN-DEC-103]]). A terms PDF is rendered for the approval receipt.
- Policies it states, each matching the active data: 14-day validity, individual pricing, no tax line, no minimum, no surcharge, the 20% deposit over $1,000.00 credited to the invoice, scheduling after the deposit or an owner waiver, payment due on receipt, the payment methods, scope as the approved version and options, changes only by approved change order, appointments confirmed separately, reschedule/cancel requests confirmed by staff with no cancellation fee, safety pauses and excluded licensed/hazardous work, walkthrough and quality review, the 30-day reopen, automatic versus staff-released messages, photo sharing without marketing use, privacy by reference, the electronic approval record, and the name "Handyhub LLC" without an address.
- No policy the owner has not decided is added: no warranty or guarantee, limitation of liability, indemnity, arbitration or venue, late fees or interest, refund or forfeiture, cancellation fees, damage-claim procedure, or licensing or insurance claims (a negative-list test checks the text).
- Clauses removed from the earlier drafts (v0.2/v0.3) are listed for attorney review ([[OQ-ATTORNEY-TERMS]]); legal is a human-review boundary ([[RULE-HUMAN-REVIEW]]).
- Staging approvals are marked TEST with a "wording pending owner approval for real customer use" banner. The owner's approval of the final wording is the only remaining owner decision for real use ([[OQ-TERMS-OWNER-APPROVAL]]).

Links: uses [[FACT-ESTIMATE-VALIDITY]], [[FACT-DEPOSIT-RULE]], [[FACT-PAYMENT-DUE]], [[FACT-PAYMENT-METHODS]], [[FACT-TAX-NO-LINE]], [[FACT-NO-MINIMUM]], [[FACT-NO-SURCHARGE]], [[FACT-REOPEN-PERIOD]], [[FACT-BUSINESS-NAME]]; constrained by [[RULE-HUMAN-REVIEW]], [[RULE-NO-INVENTED-FACTS]].
