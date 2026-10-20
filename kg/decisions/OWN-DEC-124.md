---
id: OWN-DEC-124
type: decision
title: Cases for complaints, damage, injury and disputes
status: active
area: quality
links:
  related: ["[[OWN-DEC-80]]", "[[OWN-DEC-113]]", "[[HH-QA-06]]", "[[HH-QA-07]]", "[[HH-INC-01]]", "[[HH-INC-02]]", "[[HH-PRIV-03]]"]
  uses: ["[[ENT-Case]]", "[[ENT-Hold]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]"]
source: "owner-answers-verbatim 2026-10-12T19:44:11.908Z [S10 Cases]; decision-briefs 2026-10-12T19:46:08"
---
Owner, 2026-10-12, staff journey S10, complaints, damage and injury.

Question asked:
> Staff S10 - Complaints, damage and injury: a customer complaint (from the walkthrough, a message or a call) opens a case with a severity, assigned person and due date. Property damage, injury or a dispute is flagged for the Owner and the right professional reviewer (insurer, attorney) and the system never decides fault or offers compensation by itself. While a case is open: review requests and satisfaction checks pause, and deletion requests are held. OK?

Owner wording:
> Yes, with these adjustments:
>
> - Record complaints from walkthroughs, messages, or calls in a case linked to the project, with severity, assigned person, due date, notes, and supporting photos. Avoid duplicate cases for the same issue.
> - Notify the Owner promptly about damage, injury, or disputes. The Owner handles any insurer, attorney, or other professional referral; the system never decides fault, admits liability, or promises compensation.
> - Workers can report an incident quickly from the job. Safety issues trigger the agreed stop-work process; ordinary complaints do not automatically stop unrelated work.
> - Restrict sensitive incident details to authorized staff. Customers see an appropriate acknowledgment, progress updates, and the next step.
> - Pause review invitations and satisfaction checks for the affected project until the case is resolved.
> - Preserve records relevant to the case. Do not block every deletion request: delete unrelated eligible data and explain which records must remain.
> - Track corrective work through assigned follow-up items. Closing the case requires a recorded resolution and any necessary re-check; preserve its history.
>
> Implement, test, and publish on private staging using the decisions already provided, without another setup or activation process.

Effect:
- A complaint from a walkthrough, message or call becomes a case linked to the project with severity, assignee, due date, notes and photos; an open case of the same category on the project is offered instead of a duplicate.
- The owner is notified promptly about damage, injury or disputes (queue item plus staff notification) and handles any insurer, attorney or other professional referral, recorded as an owner action ([[RULE-HUMAN-REVIEW]]). The software never decides fault, admits liability or promises compensation; customer acknowledgements use neutral wording.
- Workers report an incident quickly from the job; safety issues use the stop-work and critical-hold path ([[RULE-SAFETY-GATES]]); ordinary complaints do not stop unrelated work.
- Sensitive incident details are restricted to authorized staff; customers see an acknowledgement, progress updates and the next step.
- Review invitations and satisfaction checks pause for the project until the case is resolved ([[OWN-DEC-113]]).
- Records relevant to the case are kept under a hold; deletion requests are not blanket-blocked: unrelated eligible data is deleted and the customer is told which records remain and why ([[HH-PRIV-03]]).
- Corrective work is tracked as assigned follow-up items; closing a case needs a recorded resolution and any necessary re-check, and its history is kept.

Links: uses [[ENT-Case]], [[ENT-Hold]]; constrained by [[RULE-HUMAN-REVIEW]], [[RULE-SAFETY-GATES]].
