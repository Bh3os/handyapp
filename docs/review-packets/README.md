# Review packets for the outside professionals

Built by TSK-0143 from OWN-DEC-186: the owner has an attorney (Kentucky and Indiana), a CPA, an insurance broker and a safety reviewer ready, and asked for one packet per professional with the exact questions, the materials to review and what each answer unblocks.

| Packet | For | Open nodes it carries | Questions |
| --- | --- | --- | --- |
| [attorney.md](attorney.md) | Attorney licensed in Kentucky and/or Indiana | OQ-ATTORNEY-PRIVACY, OQ-ATTORNEY-TERMS, OQ-LEGAL-ENTITY-NAME, OQ-INDIANA-REGISTRATION, OQ-PERMITS-LICENSING, OQ-RETENTION-REVIEW, OQ-SUBCONTRACTOR-POLICY, OQ-BIRD-10DLC; OWN-DEC-161, 164, 175, 176, 177, 183, 190, 154, 201 | 18 |
| [cpa.md](cpa.md) | The owner's CPA | OQ-TAX-CPA, OQ-RETENTION-REVIEW, OQ-SUBCONTRACTOR-POLICY; OWN-DEC-161, 177, 183, 188, 189, 201 | 10 |
| [insurance.md](insurance.md) | The owner's insurance broker | OQ-INSURANCE-EVIDENCE, OQ-SUBCONTRACTOR-POLICY; OWN-DEC-04, 33, 124, 135 | 10 |
| [safety.md](safety.md) | A qualified safety professional, with an experienced tradesperson (OWN-DEC-17) | OQ-SAFETY-REVIEW, OQ-PERMITS-LICENSING; OWN-DEC-17, 38, 51, 68, 79, 80, 108, 137, 149, 172, 180; TSK-0103 | 14 |

## Rules every packet follows
- Content comes only from the knowledge graph (`kg/`, query with `node tools/kg.mjs show <id>`) and the code it cites. Nothing here is a legal, tax, insurance or safety conclusion: every item that needs a professional is written as a question (RULE-HUMAN-REVIEW, RULE-NO-INVENTED-FACTS).
- No private values: no EIN, street address, phone number or personal data. The owner enters those in the app's secure settings or in the provider's own fields (OWN-DEC-183, OWN-DEC-190, OWN-DEC-172). Staging access (link and tester sign-in) is sent by the owner separately.
- Labels: FACT, DECISION (owner-approved, `OWN-DEC-*`), PROPOSED, OPEN QUESTION, RISK, RECOMMENDATION.
- Launch gate of each item, from the graph: **PRODUCTION** blocks Phase 2 (invited customers with real data) and later (OWN-DEC-191, OQ-GO-DECISION); **FEATURE** lets production start but keeps the named feature off, on hold or NOT CONFIGURED until answered; **NONE STATED** means the graph names no gate (a timing RECOMMENDATION may follow).

## How an answer comes back
1. The reviewer fills the sign-off table of the packet (Approved as written / Changed, with the new wording / Not my area), with name and date, and returns it to the owner.
2. Each answer becomes a new owner decision node (`OWN-DEC-<n>`) in the same pull request that changes the affected requirement nodes; the question node is marked superseded with a link to it (CLAUDE.md "How work is done").
3. Changed legal wording becomes a new document version with its own content hash; the "Draft - not reviewed by an attorney" banner goes only when a version marked attorney-reviewed is published (docs/legal-review-checklist.md section 6).
4. A safety sign-off is recorded by the owner in the staff app on the exact SOP version reviewed (reviewer name, qualification, what was reviewed); the record is never changed afterwards (migration 0050).

Related: [docs/legal-review-checklist.md](../legal-review-checklist.md) (the attorney checklist for the three public documents, reused by the attorney packet), [docs/data-inventory.md](../data-inventory.md) (tables mapped to retention categories).
