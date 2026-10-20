---
id: HH-AUTO-01
type: requirement
title: Deterministic automations with declared trigger, identity, inputs, idempotency, retry, exception owner and audit
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-95]]", "[[OWN-DEC-101]]", "[[OWN-DEC-105]]", "[[OWN-DEC-107]]", "[[OWN-DEC-112]]", "[[OWN-DEC-113]]", "[[OWN-DEC-122]]"]
  depends_on: ["[[HH-ARC-08]]", "[[HH-ARC-09]]"]
  constrained_by: ["[[RULE-DECIDED-VALUES-ACTIVE]]", "[[RULE-AI-WAVE2]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-REMINDER-CADENCES]]", "[[FACT-HOURS]]"]
  tested_by: ["[[T65]]", "[[T34]]", "[[T67]]"]
source: "guide 21.3; OWN-DEC ids as linked"
---
Automations are deterministic rules, no AI. Each one is registered with: trigger, the authorized identity it acts as, inputs and their versions, an idempotency key, the effect it is allowed to have, retry and timeout, the staff exception owner, and audit.

Launch automations:
- estimate acceptance → one job and one scheduling task (same transaction, [[OWN-DEC-105]]);
- confirmed visit → appointment reminder draft ([[HH-COM-11]]);
- blocking readiness → owner queue item;
- completion submission → quality-review queue;
- recorded payment → allocation and reconciliation; balance at $0.00 → invoice paid and receipt;
- reminder drafts on the owner's cadences ([[FACT-REMINDER-CADENCES]]): unanswered questions, estimates, appointments, unpaid invoices, satisfaction check, customer-agreed repeat service;
- the automatic messages of the one list in [[FACT-AUTOMATIC-MESSAGES]] ([[HH-COM-06]]).

Every other customer message is a draft that staff release ([[OWN-DEC-65]]). Before any send, the current state, suppressions and permissions are rechecked; released reminders follow the contact-hours rule of [[HH-COM-09]]. Decided cadences and lists are active configuration with no activation step ([[OWN-DEC-122]]).
