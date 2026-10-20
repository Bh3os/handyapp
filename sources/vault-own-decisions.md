# OWN-DEC entries from the vault decision log (AI Development Plans/20-decision-log.md, main cc0821e)

#### OWN-DEC-01

**Newer explicit decisions take precedence over the owner facts**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Governance and planning
- Context: **FACT:** the file opens with "Version 1.0. Owner facts recorded 2026-10-02; newer explicit decisions and current authoritative records take precedence." (L2). It exists in 10 byte-identical copies in skill reference folders ([01](01-repository-inventory.md) section 8.1).
- Options considered: Not recorded; the owner stated the rule without alternatives.
- Selected approach: The owner facts apply until a newer explicit owner decision or a current authoritative record supersedes them.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. A fact changes only through an explicit recorded decision, so informal statements do not supersede it.
- Consequences: Basis of ranks 1 and 2 of the hierarchy ([01](01-repository-inventory.md) section 3.1 and conflict rule 5 in 3.3; D-00-10, D-01-02). A change to the facts updates all 10 copies in one logged change (D-01-06); if the copies ever differ, work stops and the owner is asked ([01](01-repository-inventory.md) section 3.3 rule 6).
- Review trigger: The owner records a decision in this log that supersedes an owner fact, or issues a new version of the facts file.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L2; [01](01-repository-inventory.md) Decisions

#### OWN-DEC-02

**Brand HandyHub and domain handyhub247.com**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Brand and business identity
- Context: **FACT:** "Brand HandyHub; domain handyhub247.com. Domain ownership/connection and 24/7 staffing are not established." (L3). The MOC title and the folder name spell "Handy Hub" ([01](01-repository-inventory.md) section 3.2).
- Options considered: Not recorded.
- Selected approach: The brand is HandyHub and the domain is handyhub247.com; ownership and connection of the domain and any 24/7 staffing are not established.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Because 24/7 staffing is not established, no 24/7, emergency or guaranteed-response promise is made ([00](00-project-charter.md) section 6.1 item 6; "24/7 positioning" is part of G-149).
- Consequences: Domain ownership is open as G-150 (Q-32-01), needed during Phase 2 for the sending domain ([19](19-product-roadmap.md) section 7.3); 24/7, emergency and guaranteed-response service is out of scope until staffing exists ([00](00-project-charter.md) section 6.1 item 6).
- Review trigger: Proof of domain ownership is recorded (G-150), or the owner establishes 24/7 staffing.
- Approver: Owner (recorded)
- Blocks: neither as recorded; the open domain ownership (G-150) is needed during Phase 2 ([19](19-product-roadmap.md) section 7.3)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L3
- Owner answer recorded: 2026-10-05; see [OWN-DEC-35](#OWN-DEC-35): the owner promises a reply in less than an hour; the website says only "We aim to reply within an hour, every day." until an attorney approves "guaranteed". This is a reply expectation, not 24/7, emergency or same-day service; 24/7 staffing is still not established.

#### OWN-DEC-03

**Service area Kentuckiana in Kentucky and Indiana**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Service area and compliance
- Context: **FACT:** "Serve Kentuckiana in Kentucky and Indiana; exact ZIPs, local qualifications, licenses, permits and taxes require configured review." (L4). No ZIP or county list exists (HND-002 open; [00](00-project-charter.md) section 1.3).
- Options considered: Not recorded.
- Selected approach: HandyHub serves Kentuckiana in Kentucky and Indiana; ZIP codes, local qualifications, licenses, permits and taxes are configured only after review.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Each state and municipality served needs its own legal, tax and permit assessment ([00](00-project-charter.md) section 5 row 5).
- Consequences: Jurisdiction-sensitive rules are configuration with source, date and jurisdiction; Kentucky and Indiana are assessed separately; no document states that HandyHub is compliant ([00](00-project-charter.md) section 5 row 5). Open parts: coverage and override authority (G-126), tax treatment (G-130), licensed-trade and permit boundaries (G-140).
- Review trigger: The owner configures coverage (G-126), or a new state or municipality is added.
- Approver: Owner (recorded); open parts need HUMAN REVIEW: attorney licensed in KY and/or IN, CPA, local licensing and permit authorities
- Blocks: neither as recorded; coverage (G-126) is needed at the start of the business-readiness track, tax and permit determinations at each service activation ([19](19-product-roadmap.md) section 7.3)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L4
- Owner answer recorded: 2026-10-05; see [OWN-DEC-37](#OWN-DEC-37): the service area is the Louisville metropolitan area in Kentucky and Southern Indiana (nine counties, plus the towns of Salem and Madison, Q-32-22). The ZIP list is [owner-service-area-zip-list.md](owner-service-area-zip-list.md), PROPOSED until the owner activates it (G-126 in part). The legal, tax and permit parts of this entry stay open.

#### OWN-DEC-04

**All 26 services are in scope**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Service catalog
- Context: **FACT:** "All 26 categories in cleaning, drywall, painting and home improvement are in scope. Reported capability is not documentary proof of insurance, qualifications or equipment." (L5). The 26 services are those of spec Appendix B.
- Options considered: Not recorded.
- Selected approach: All 26 services are in scope; reported capability is not accepted as proof of insurance, qualifications or equipment.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Being in scope is not being bookable: no SOP is approved, so no service can be offered yet ([04](04-service-registry.md) section 2.4).
- Consequences: The registry holds 26 records, all `proposed-active`, `hidden` and not bookable ([04](04-service-registry.md) Decisions); insurance is confirmed only from policy documents (activation item 7 of D-00-05; G-129). The launch service set is open (G-139; Q-00-02).
- Review trigger: The owner names the launch service set (Q-00-02), or adds, pauses or retires a service through registry change control (D-04-16).
- Approver: Owner (recorded); insurance evidence needs HUMAN REVIEW: licensed insurance broker
- Blocks: neither as recorded; the launch service set (G-139) starts the business-readiness track ([19](19-product-roadmap.md) section 7.3)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L5
- Owner answer recorded: 2026-10-05; see [OWN-DEC-33](#OWN-DEC-33): the launch service set is all 26 services (Q-00-02, G-139). Each service still becomes bookable only with its activation evidence.

#### OWN-DEC-05

**Two employees initially, subcontractors later**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Staffing and operating model
- Context: **FACT:** "Initially two employees; hire with demand, subcontractors later. Do not count the owner as an additional worker without confirmation." (L6). Spec BIZ-005 requires scaling to subcontractors without redesign.
- Options considered: Not recorded.
- Selected approach: Start with two employees, hire with demand and add subcontractors later; the owner is not counted as a worker unless the owner confirms it.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Separation of duties cannot be complete with two employees; compensating controls apply ([00](00-project-charter.md) section 5 row 6; [27](27-roles-and-permissions.md) section 9).
- Consequences: Capacity is planned in person-hours with no 24/7 or response-time promises ([00](00-project-charter.md) section 5 row 6); user account, worker, employee and subcontractor are separate entities (D-05-21); subcontractor features wait for a policy (NEAR-004; G-134). Open parts: role assignment and whether the owner works in the field (G-144), hiring trigger (G-151).
- Review trigger: The owner confirms field work or names role holders (G-144; Q-27-01), sets a hiring trigger (Q-00-01), or records a subcontractor policy (G-134).
- Approver: Owner (recorded); hiring and classification need HUMAN REVIEW: employment attorney or HR professional, payroll professional
- Blocks: neither as recorded; role holders (G-144) are needed by Phase 1 exit ([19](19-product-roadmap.md) section 7.3)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L6

#### OWN-DEC-06

**Minimum charge of \$150 USD**

- Status: SUPERSEDED
- Date: 2026-10-02
- Domain: Pricing (minimum charge)
- Context: **FACT:** "Minimum \$150 USD. Proposed default is once per separately quoted job/visit bundle before applicable tax; owner must confirm recurrence, callbacks and estimate-visit exceptions. Do not apply it to every line." (L7). Spec BIZ-003, FIN-001 and CX-001 carry the minimum; nine competing minimum constructs exist in the draft pricing files ([02](02-gap-analysis.md) section 4.7).
- Options considered: Not recorded. The application is itself a "proposed default", not a final rule.
- Selected approach: The minimum is \$150 USD. The proposed default applies it once per separately quoted job or visit bundle before applicable tax and never per line; recurrence, callbacks and estimate-visit exceptions await owner confirmation.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Until the open parts are confirmed, the unit of the minimum stays an open question (Q-05-02) and no draft minimum construct is used.
- Consequences: The minimum is disclosed in the public flow (LAUNCH-001); its application rule lives in [28](28-pricing-estimating-and-job-costing.md); the registry shows it per service without applying it ([04](04-service-registry.md) section 3). Open part: G-133 (recurring visits, callbacks, estimate visits, multi-service bundles, no stacking with service-specific minimums).
- Review trigger: The owner confirms the open parts (G-133; Q-05-02; Q-02-12).
- Approver: Owner (recorded)
- Blocks: neither as recorded; the minimum application (G-133) is needed during Phase 2 ([19](19-product-roadmap.md) section 7.3)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L7
- Decision record: 2026-10-05; superseded by [OWN-DEC-31](#OWN-DEC-31): there is no minimum job value in any stage; owner; none. Source: owner message in the project chat, 2026-10-05: "forget all the way the 150 usd min job don't consider it at all in all the stages".

#### OWN-DEC-07

**Service-specific estimating; no rates or targets supplied**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Pricing and estimating
- Context: **FACT:** "Use service-specific estimating; numeric rates, wages, production factors, tax rates and profit targets are not supplied." (L8). The 26 pricing drafts carry unsourced benchmarks and margins, and 6 contain SAR amounts ([00](00-project-charter.md) section 5 row 2).
- Options considered: Not recorded.
- Selected approach: Each service is estimated with its own basis; no rate, wage, production factor, tax rate or profit target is supplied or assumed.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Without cost data, prices could be approved that lose money unnoticed until job costing exists (R-00-14).
- Consequences: The price book is versioned configuration and nothing from the drafts is seeded as approved; section 7 targets of [00](00-project-charter.md) are placeholders ([00](00-project-charter.md) section 5 row 2). Open parts: pricing approval and margin basis (G-135), tax treatment (G-130).
- Review trigger: The owner approves price-book entries (G-135; Q-28-01) or sets financial targets (Q-00-01).
- Approver: Owner (recorded); the margin basis and tax need HUMAN REVIEW: CPA
- Blocks: neither as recorded; price-book entries and tax treatment are needed at each service activation ([19](19-product-roadmap.md) section 7.3)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L8
- Owner answer recorded: 2026-10-05; see [OWN-DEC-32](#OWN-DEC-32): each job is priced individually on its own estimate, after a visit or online when no visit is needed; there is no fixed price list (Q-28-01).

#### OWN-DEC-08

**Deposits for large jobs; terms undecided**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Finance (deposits)
- Context: **FACT:** "Deposits for large jobs; threshold, amount, timing and terms remain owner decisions." (L9). Five draft agreements require fixed 25% to 40% deposits or retainers on every job (three of them non-refundable), which conflicts with this fact ([00](00-project-charter.md) section 5 row 4).
- Options considered: Not recorded.
- Selected approach: Deposits apply to large jobs; threshold, amount, timing and terms remain owner decisions.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Until the policy exists, deposit enforcement stays off in the software (D-06-12) and no draft deposit clause may be used.
- Consequences: Deposit lifecycle without values (D-06-12); launch criterion 10 needs the configured policy ([00](00-project-charter.md) section 7.2). Open part: G-125.
- Review trigger: The owner decides the deposit policy (G-125; Q-05-03; Q-06-06).
- Approver: Owner (recorded); the open terms need HUMAN REVIEW: attorney licensed in KY and/or IN (refundability, forfeiture), CPA (deposit accounting)
- Blocks: neither as recorded; the deposit policy (G-125) is needed before the attorney finalizes customer terms ([19](19-product-roadmap.md) section 7.3)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L9
- Owner answer recorded: 2026-10-05; the deposit policy was not decided in the answers recorded as OWN-DEC-32 to OWN-DEC-41 ([OWN-DEC-36](#OWN-DEC-36)); deposits stay OFF (NOT CONFIGURED).
- Owner answer recorded: 2026-10-05 (later the same day); see [OWN-DEC-42](#OWN-DEC-42): "the estimates over 1000 requires 20 % deposit". The deposit rate and threshold are decided; due timing, refundability (attorney) and the tax basis (CPA) are not.

#### OWN-DEC-09

**Electronic invoices with cash and check; no payment provider**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Finance (invoicing and payments)
- Context: **FACT:** "Electronic invoices with cash/check acceptance. Payment provider not selected. Received checks are not cleared money." (L10). Two draft agreements contain card-on-file billing clauses ([01](01-repository-inventory.md) section 3.2).
- Options considered: Not recorded.
- Selected approach: Invoices are electronic and payment is accepted in cash or by check; no payment provider is selected; a received check is not treated as cleared money.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Cash conversion is slower without electronic payments (R-19-08 in [19](19-product-roadmap.md)).
- Consequences: MVP payments are electronic invoices plus cash and check recording behind provider adapters ([00](00-project-charter.md) section 5 row 1); payment states separate Deposited from Cleared (D-05-12, D-06-11); card storage and card-on-file billing are out of scope until a provider and reviewed terms exist ([00](00-project-charter.md) section 6.2 item 10). Open part: G-127.
- Review trigger: The owner selects a payment provider (G-127).
- Approver: Owner (recorded); a provider choice needs HUMAN REVIEW: CPA (fees), attorney licensed in KY and/or IN (auto-billing terms)
- Blocks: neither (the MVP is built without a provider; [19](19-product-roadmap.md) section 7.2)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L10
- Owner answer recorded: 2026-10-05; see [OWN-DEC-36](#OWN-DEC-36): accepted methods are cash, check, Zelle, Cash App, Chime and Stripe. "Payment provider not selected" is superseded only in that Stripe is named; how each electronic method is used is not decided. Received checks are still not cleared money.

#### OWN-DEC-10

**English and Spanish with human-reviewed safety translations**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Language and customer experience
- Context: **FACT:** "English/Spanish public, customer and worker experience; require human-reviewed safety translations." (L11). No Spanish content exists in the vault ([02](02-gap-analysis.md) section 1.2).
- Options considered: Not recorded.
- Selected approach: Public, customer and worker experiences are in English and Spanish, and safety translations are reviewed by a human.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Spanish content and a qualified reviewer become launch dependencies, and the Spanish requirement may not be met at launch without them (R-00-06).
- Consequences: Internationalization is built from Phase 1 ([00](00-project-charter.md) section 5 row 9); Spanish safety text is activation item 3 of D-00-05 and launch criterion 11; reviewer and scope are open (G-136).
- Review trigger: The owner designates the Spanish reviewer (G-136; Q-32-10).
- Approver: Owner (recorded); translations need review by a qualified bilingual reviewer, and Spanish customer terms need HUMAN REVIEW: attorney licensed in KY and/or IN
- Blocks: neither as recorded; the reviewer (G-136) is needed at each service activation ([19](19-product-roadmap.md) section 7.3)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L11

#### OWN-DEC-11

**No brand assets or verified proof; never fabricate proof**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Marketing and claims
- Context: **FACT:** "No brand assets or verified portfolio/reviews supplied; never fabricate proof." (L12).
- Options considered: Not recorded.
- Selected approach: No brand assets, portfolio or reviews exist, and proof is never fabricated.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. The website launches with process-based content instead of testimonials or a portfolio ([00](00-project-charter.md) section 5 row 10).
- Consequences: Every claim passes the claims gate of [32](32-website-and-customer-experience.md); launch criterion 12 requires no unverified claim in customer-facing content ([00](00-project-charter.md) sections 6.2 item 20 and 7.2).
- Review trigger: The owner supplies verified assets or reviews.
- Approver: Owner (recorded); any compliance, insurance or licensing statement needs HUMAN REVIEW: attorney licensed in KY and/or IN
- Blocks: neither (in force)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L12

#### OWN-DEC-12

**Custom phased application built with AI coding**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Delivery approach
- Context: **FACT:** "Custom phased application with AI coding; ASAP does not establish a delivery date or zero infrastructure costs." (L13).
- Options considered: Not recorded.
- Selected approach: HandyHub builds a custom application in phases with AI coding; "ASAP" sets neither a delivery date nor zero infrastructure cost.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. AI-generated code is untrusted until reviewed, so delivery needs a named human reviewer (Q-00-06) and a budget envelope (Q-00-05; G-138).
- Consequences: Small reviewable changes with tests and human review, and the HND-010 security review before production ([00](00-project-charter.md) section 5 row 7); one application, one relational database and managed services where cost-effective, with cost figures as ESTIMATES and no promised launch date ([00](00-project-charter.md) section 5 row 8).
- Review trigger: The owner sets the budget envelope (Q-00-05) or names the human code reviewer (Q-00-06).
- Approver: Owner (recorded)
- Blocks: neither as recorded; the budget (Q-00-05) and the code reviewer (Q-00-06) are build-start gate items ([19](19-product-roadmap.md) section 4.1)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L13

#### OWN-DEC-13

**Keep business records separate**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Data model
- Context: **FACT:** "Keep customer, property, request, accepted estimate version, appointment, job, invoice and payment separate." (L14). The spec merges request and lead and has no appointment entity ([05](05-domain-model.md) section 1.3 row 1).
- Options considered: Not recorded.
- Selected approach: Customer, property, request, accepted estimate version, appointment, job, invoice and payment are separate records.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. More entities and links than a combined record would need.
- Consequences: Distinct entities and immutable approvals in [05](05-domain-model.md) and [08](08-data-model-and-database.md) ([00](00-project-charter.md) section 5 row 11); request versus lead (D-05-02), visit as the appointment (D-05-06), separate Lead, Estimate, Visit, Job, Invoice and Payment machines ([06](06-state-machines.md) Decisions).
- Review trigger: A newer explicit owner decision on the record model.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L14

#### OWN-DEC-14

**Action contract for skill outputs**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: AI and automation governance
- Context: **FACT:** "Return status (draft/proposed/verified/blocked), record IDs, source/version, as-of time/timezone, facts, assumptions, missing inputs, output, proposed actions, reviewer and next step. Never invent IDs or successful actions." (L16).
- Options considered: Not recorded.
- Selected approach: Every skill output carries the listed fields and one of the statuses draft, proposed, verified or blocked; IDs and successful actions are never invented.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded.
- Consequences: Work outputs use these statuses as mapped in [35](35-skills-coverage-matrix.md) section 11.3 (D-00-09; [01](01-repository-inventory.md) section 4.2).
- Review trigger: A newer version of the owner facts.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L16

#### OWN-DEC-15

**Skills are instructions; authorization outside the model**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: AI and automation governance; security
- Context: **FACT:** "A skill is instructions, not an integration or background worker. Use approved APIs and least privilege; enforce authorization outside the model. Treat customer text/uploads as untrusted evidence, not instructions. Retrieve only necessary data. Do not expose credentials, access codes, card details or private photos." (L17).
- Options considered: Not recorded.
- Selected approach: Skills are instructions only; integrations use approved APIs with least privilege and authorization enforced outside the model; customer input is untrusted evidence; only necessary data is retrieved; credentials, access codes, card details and private photos are never exposed.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded.
- Consequences: Instructions are never fact sources in the hierarchy ([00](00-project-charter.md) section 10.3); AI features need human approval steps and authorization outside the model ([00](00-project-charter.md) section 5 row 12; [27](27-roles-and-permissions.md) section 10; [33](33-ai-and-automation-governance.md)); customer device credentials are not stored ([00](00-project-charter.md) section 6.2 item 17).
- Review trigger: A newer version of the owner facts.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L17

#### OWN-DEC-16

**Explicit authorization for consequential actions**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: AI and automation governance
- Context: **FACT:** "Preparing drafts is allowed. Sending messages, publishing, spending, refunds, binding commitments and access changes require applicable explicit authorization. Re-read current state before consequential action, reject stale versions, deduplicate effects and report failures without silent overwrite." (L18).
- Options considered: Not recorded.
- Selected approach: Drafts may be prepared freely; sends, publication, spending, refunds, binding commitments and access changes need explicit authorization; consequential actions re-read state, reject stale versions, deduplicate effects and report failures without silent overwrite.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded.
- Consequences: Optimistic versions, idempotency keys and review items in every state machine; staff release of notifications until an auto-send policy exists; human-only refund approval ([06](06-state-machines.md) Decisions; D-06-01).
- Review trigger: A newer version of the owner facts, or an approved auto-send policy.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L18

#### OWN-DEC-17

**No active field SOP until competent review; unknown is not safe**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Field safety
- Context: **FACT:** "No active field SOP until competent review of task-specific manufacturer instructions, hazards, qualifications, applicable requirements, emergency arrangements and Spanish translation. Unknown is not safe; acknowledgment cannot bypass critical holds." (L20). No SOP is approved today ([04](04-service-registry.md) section 2.4).
- Options considered: Not recorded.
- Selected approach: No field SOP becomes active before competent review of the listed topics; unknown conditions are treated as unsafe; an acknowledgment never bypasses a critical hold.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. No service can be booked until competent review is done, which makes the business-readiness chain the likely longer one (HYPOTHESIS, [19](19-product-roadmap.md) section 7.1).
- Consequences: No service is bookable until the activation rule is met, and briefings show only approved, versioned content ([00](00-project-charter.md) section 5 row 3; D-00-05); gate items cannot be overridden (D-04-05); fail-closed guards and non-overridable critical holds ([06](06-state-machines.md) Decisions).
- Review trigger: A newer version of the owner facts.
- Approver: Owner (recorded); SOP activation needs HUMAN REVIEW: qualified safety professional and the trade or hazardous-material specialists each service needs
- Blocks: neither as recorded; it is the reason no service can launch before competent SOP review (activation item 2 of D-00-05)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L20

#### OWN-DEC-18

**Check current primary sources; verify the municipality**

- Status: RECORDED owner decision
- Date: 2026-10-02
- Domain: Compliance research
- Context: **FACT:** "Check current primary sources for changing legal, safety, tax, product and provider claims; record source, date, jurisdiction and applicability." The line names the EPA RRP, EPA asbestos and OSHA sources and ends: "Verify the actual Kentucky/Indiana municipality; do not assume statewide trade permissions." (L21).
- Options considered: Not recorded.
- Selected approach: Changing legal, safety, tax, product and provider claims are checked against current primary sources with source, date, jurisdiction and applicability recorded; the actual municipality is verified and no statewide trade permission is assumed.
- Why: Not recorded by the owner.
- Tradeoffs: None recorded. Each municipality served needs its own determination.
- Consequences: Permit, license and qualification flags are recorded per line type and jurisdiction, and `unknown` blocks Start (SVC-009 in [04](04-service-registry.md) section 2.6); screening triggers such as pre-1978 or unknown build year are conservative holds, not legal conclusions ([02](02-gap-analysis.md) section 4.1). Open parts: G-140, G-141.
- Review trigger: A new municipality in the service area, or a source changes.
- Approver: Owner (recorded); determinations need HUMAN REVIEW: attorney licensed in KY and/or IN, local permit offices and licensing authorities, EPA RRP-certified renovator, accredited asbestos inspector
- Blocks: neither as recorded; the boundaries (G-140, G-141) are needed at each service activation ([19](19-product-roadmap.md) section 7.3)
- Source: [Owner facts](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) L21

#### OWN-DEC-19

**Order of work: documentation sweep first, then the software, then business readiness and the launch gate**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Delivery
- Context: **FACT:** the owner's message of 2026-10-04: "Stage A ... finish the documentation pass first"; "Stage B ... build the software in app/"; "Stage C: in parallel with Stage B, prepare the review packets".
- Options considered: Not recorded.
- Selected approach: Stage A (documentation sweep and the owner start-decision brief), then Stage B (Product Phases 1 to 4 in `app/`), with Stage C (review packets, approved configuration, MVP launch gate) in parallel with Stage B.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Phase entry for Phase 1 still needs the build-start gate items of section 3.1 recorded; until then Stage B proceeds on PROPOSED defaults with everything configurable.
- Review trigger: A new owner direction.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [HANDOFF](../HANDOFF.md) section 2

#### OWN-DEC-20

**AI features are a second wave; the AI module stays disabled**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: AI and automation governance
- Context: **FACT:** the owner's message of 2026-10-04: "AI features are a second wave: keep the AI module disabled for now.".
- Options considered: Not recorded.
- Selected approach: Product Phases 1 to 4 build only the tested AI-disabled state (AIG-002, ARC-030) and deterministic non-AI automation; no AI provider integration until the owner approves [33](33-ai-and-automation-governance.md).
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: EP-29 AI skill integration and NEAR-002 AI workspaces move after launch readiness ([19](19-product-roadmap.md), [22](22-backlog.md)).
- Review trigger: A new owner direction.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [HANDOFF](../HANDOFF.md) section 2

#### OWN-DEC-21

**Build the software in app/ inside this repository on the planned stack**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Architecture
- Context: **FACT:** the owner's message of 2026-10-04: "build the software in app/ on the planned stack (TypeScript strict, Node.js LTS, Fastify, PostgreSQL, Kysely, React/Vite PWA, Astro, English and Spanish)".
- Options considered: Not recorded.
- Selected approach: The application is built under `app/` in this repository following the [07](07-system-architecture.md) D-07-24 layout, on the D-07-22 stack.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: D-07-22 and D-07-24 stay PROPOSED until the owner confirms them in the [owner start-decision brief](owner-start-decision-brief.md); a separate repository ([15](15-devops-infrastructure.md) section 4.1) remains an option. Application work never edits vault business files.
- Review trigger: A new owner direction.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [HANDOFF](../HANDOFF.md) section 2

#### OWN-DEC-22

**No production deployment or real-customer contact without the owner's go decision**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Release and launch
- Context: **FACT:** the owner's message of 2026-10-04: "Do not deploy to production or contact real customers without my explicit go decision.".
- Options considered: Not recorded.
- Selected approach: Only local, CI and (later) staging environments with synthetic data; no message reaches a real customer; the MVP launch gate ([00](00-project-charter.md) section 7.2; [18](18-release-and-launch-plan.md)) ends with the owner's explicit go decision.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Consistent with HND-008 and [18](18-release-and-launch-plan.md) D-18-14.
- Review trigger: A new owner direction.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [HANDOFF](../HANDOFF.md) section 2

#### OWN-DEC-23

**Claude Code reviews and merges pull requests once CI is green**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Delivery
- Context: **FACT:** the owner's message of 2026-10-04 in the project chat: "I wanna you edit the start-desicion and make Claude Code , review and merge". This answers item 7 of the [start-decision brief](owner-start-decision-brief.md) for code review and merging (Q-00-06 code part = Q-07-07 = Q-15-02 = Q-24-01; Q-23-01 code part).
- Options considered: The owner merges; a named developer merges; both; Claude Code reviews and merges (selected).
- Selected approach: Claude Code opens the pull request, reviews it against [24](24-ai-agent-development-guide.md) section 5.4 and [23](23-definition-of-done.md), and merges it once every required CI check is green on the head being merged. It never merges with a required check red or skipped, and never changes branch protection.
- Why: Owner direction.
- Tradeoffs: **RISK:** the same kind of agent writes and reviews the code (R-00-04, R-23-02); mitigated by the blocking CI gates, the 23 checklists, the append-only change record and the unchanged release controls below.
- Consequences: Still with the owner or named professionals: each production release and the go decision (OWN-DEC-22; [00](00-project-charter.md) section 10.2), the HND-010 security review by a qualified reviewer before the first production release (Q-00-06 security part; Q-12-01), every master section 1.3 professional review, and the activation of prices, agreements, SOPs, tax and payment configuration. A merge is not an activation ([23](23-definition-of-done.md) section 2.3).
- Review trigger: A new owner direction, a second developer joining, or a defect found after merge that review should have caught.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [owner-start-decision-brief](owner-start-decision-brief.md) item 7

#### OWN-DEC-24

**Development repository: app/ in this repository on the current GitHub repository**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Architecture / delivery
- Context: **FACT:** the owner's answer to item 2 of the [start-decision brief](owner-start-decision-brief.md) in the project chat, 2026-10-04: "app/ in this repository. Keep using the current GitHub repository for development; repository/account ownership can be moved to a business-owned GitHub organization later if needed."
- Options considered: The options listed in the brief, item 2.
- Selected approach: The code stays in `app/` of this repository (D-07-24 approved with changes) on the current GitHub repository; a move to a business-owned GitHub organization stays possible later.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Answers Q-15-01 for development. **RISK:** the repository is public and owned by a personal account (FACT, GitHub repository settings, 2026-10-04); business plans and code are readable by anyone. WEB-041 and OPS-006 (business-owned accounts before launch) remain launch requirements. **RECOMMENDATION:** make the repository private now (owner action in GitHub settings).
- Review trigger: Before launch (WEB-041), or a second developer joins.
- Approver: Owner (recorded)
- Blocks: neither (in force); business-owned accounts are a launch requirement
- Source: [owner-start-decision-brief](owner-start-decision-brief.md) item 2

#### OWN-DEC-25

**Free hosting for development and early staging; no paid production infrastructure yet**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Infrastructure
- Context: **FACT:** the owner's answer to item 3 of the [start-decision brief](owner-start-decision-brief.md) in the project chat, 2026-10-04: "use free hosting for development and early staging where practical. A public development/staging environment may use free managed services. Do not create paid production infrastructure yet. Before production, select the final hosting provider, US region, backup strategy, and production data location."
- Options considered: The options listed in the brief, item 3.
- Selected approach: Development and early staging run on free managed services where practical; a public staging environment keeps the staging rules (synthetic data only, noindex, protected, provider hostnames, host-only cookies; [15](15-devops-infrastructure.md) section 6). No paid production infrastructure is created. D-07-23 is deferred to before production.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Answers Q-07-02 for development and staging; Q-07-13 (data location, attorney review) stays open for production. Free tiers may sleep, pause or expire; staging data is synthetic and disposable.
- Review trigger: Before production, or when a free tier becomes unsuitable.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [owner-start-decision-brief](owner-start-decision-brief.md) item 3

#### OWN-DEC-26

**Monthly budget: $0 for now**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Finance / infrastructure
- Context: **FACT:** the owner's answer to item 4 of the [start-decision brief](owner-start-decision-brief.md) in the project chat, 2026-10-04: "$0/month for now. Use free tiers during development, testing, and early staging. Do not purchase or upgrade any hosting/provider service without owner approval. Re-evaluate the infrastructure budget before production or whenever free-tier limitations become unsuitable."
- Options considered: The options listed in the brief, item 4.
- Selected approach: The infrastructure budget is $0 per month; only free tiers are used; any purchase or upgrade needs the owner's approval first.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Answers Q-00-05 = Q-07-01 = Q-15-07 for infrastructure for now (gap G-138 partly closed); the budget for professional reviews is not set by this answer.
- Review trigger: Before production, or a free tier becomes unsuitable.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [owner-start-decision-brief](owner-start-decision-brief.md) item 4

#### OWN-DEC-27

**Staff sign-in: identity spike, then a managed identity provider; MFA for every staff account**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Security / identity and access
- Context: **FACT:** the owner's answer to item 5 of the [start-decision brief](owner-start-decision-brief.md) in the project chat, 2026-10-04: "spike first, then use a managed identity provider. Do not build production authentication from scratch. MFA is required for all staff accounts."
- Options considered: The options listed in the brief, item 5.
- Selected approach: Run the identity spike of [07](07-system-architecture.md) section 22 against the section 8.2 criteria, then use a managed identity provider for staff; production authentication is not built from scratch; MFA is required for every staff account.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Answers Q-07-03 for staff. The dev adapter stays for local/CI only; the production adapter stays NOT CONFIGURED until a provider is chosen and the owner creates its account (free tier, OWN-DEC-26).
- Review trigger: The spike result.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [owner-start-decision-brief](owner-start-decision-brief.md) item 5

#### OWN-DEC-28

**Launch role holders: the owner does everything; monetary limits NOT CONFIGURED**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Roles and permissions
- Context: **FACT:** the owner's answer to item 6 of the [start-decision brief](owner-start-decision-brief.md) in the project chat, 2026-10-04: "owner handles dispatch, estimating, customer service, approvals, and field work at launch. Owner has final approval authority. Keep specific monetary approval limits NOT CONFIGURED until the related pricing/payment policies are decided."
- Options considered: The options listed in the brief, item 6.
- Selected approach: At launch the owner holds the office roles (ADM, DSP, ESTR, CSR) and does field work; the owner has final approval authority; every monetary approval limit stays NOT CONFIGURED.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Answers Q-27-01; Q-27-04 (limits) stays open. **RISK:** one person holds approving and field roles, so self-approval refusals stay in force (no override of one's own critical hold, the QA verifier is never the corrector, the collector never clears their own deposit); L3 runs as L2 with after-the-fact review ([27](27-roles-and-permissions.md) sections 9 and 11). Safety gates are unchanged.
- Review trigger: The first hire, or the access review (AUTH-031).
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [owner-start-decision-brief](owner-start-decision-brief.md) item 6

#### OWN-DEC-29

**Approval channel: chat; Claude records each approved decision with the date**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Governance
- Context: **FACT:** the owner's answer to item 8 of the [start-decision brief](owner-start-decision-brief.md) in the project chat, 2026-10-04: "chat is the approval channel. I will answer approvals and decisions in chat, and Claude should record each approved decision in the decision log with the date."
- Options considered: The options listed in the brief, item 8.
- Selected approach: The owner gives approvals and decisions in the chat; Claude records each one in this log with the date (section 1.4).
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Answers Q-00-10, Q-20-01 and Q-24-05 (channel).
- Review trigger: A new owner direction.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: [owner-start-decision-brief](owner-start-decision-brief.md) item 8

#### OWN-DEC-30

**The application code moves to its own private repository, Bh3os/handyhub-app**

- Status: RECORDED owner direction
- Date: 2026-10-04
- Domain: Architecture / delivery
- Context: **FACT:** the owner asked whether the staging web service could harm their data; Claude explained that the hosting provider reads the whole repository, including the business documents, and offered to move the application code into a separate private repository so the provider sees only code. The owner answered in the project chat on 2026-10-04: "yes do this".
- Options considered: Keep `app/` in this repository and give the hosting provider access to it (the provider can read the business documents); move the code to its own private repository (selected).
- Selected approach: The code under `app/` moves, with its git history, to the private repository `Bh3os/handyhub-app` (repository root = former `app/`); this repository keeps the plans, decisions and business files. Hosting providers are granted access to the code repository only. The permission matrix keeps a verbatim snapshot of plan 27 in the code repository so its doc-sync tests still prove code and plan agree (AUTH-032).
- Why: Owner direction: business documents are not shared with hosting providers.
- Tradeoffs: Two repositories to keep in step: a change to plan 27 needs its snapshot updated in the code repository in the same change set; sessions need access to both repositories.
- Consequences: Amends D-07-24 (approved with changes the same day) and OWN-DEC-24 for where the code lives; the repository host and ownership rules of OWN-DEC-24 apply to both repositories.
- Review trigger: A new owner direction, or a second developer joining.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-04

#### OWN-DEC-31

**No minimum job value in any stage**

- Status: RECORDED owner direction
- Date: 2026-10-05
- Domain: Pricing, estimating and finance
- Context: **FACT:** the owner's message in the project chat, 2026-10-05: "forget all the way the 150 usd min job don't consider it at all in all the stages and continue what you working at".
- Options considered: Not recorded.
- Selected approach: HandyHub has no minimum job value. The \$150 minimum of the owner facts of 2026-10-02 (OWN-DEC-06) is withdrawn and is not considered in pricing, estimating, invoicing, agreements, SOPs, the website, the request form, the software or any review packet. Every mention of a \$150 minimum in the vault business files (`Pricing/`, `Service Agreements/`, `Main Plans/`, the spec and others) is superseded by this entry; those files are not reworded (CLAUDE.md rule 5) and the owner may edit them.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Supersedes OWN-DEC-06, D-28-04, D-28-05, D-28-06, D-28-07 and D-32-04; packet item B2 is withdrawn. In the software (`Bh3os/handyhub-app`, migration 0007) the proposed minimum version is retired, no minimum rule can be proposed or activated, and the website and request form carry no minimum statement or acknowledgement. Small jobs are priced only by their written estimate.
- Review trigger: A new owner direction.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-05

#### OWN-DEC-32

**Each job is priced individually on its own estimate; no fixed price list**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Pricing, estimating and finance
- Context: **FACT:** the owner's answer in the project chat, 2026-10-05 (decision packet item B1, OWNER B): "each job should priced individually based on the job estimate will be generated after the visit or online if it doesn't require". [28](28-pricing-estimating-and-job-costing.md) Q-28-01 asked which pricing model, price items and approved values each launch service uses; [OWN-DEC-07](#OWN-DEC-07) records service-specific estimating with no rates supplied.
- Options considered: A price book with approved price items and values per service, using the models of [28](28-pricing-estimating-and-job-costing.md) section 3.3 (flat rate, labor-hour, unit, linear-foot, square-foot, tiered package and others; decision packet item B1); pricing each job individually on its estimate (selected).
- Selected approach: There is no fixed price list from the owner. The estimator prices each job individually on its own estimate. The estimate is prepared after a visit, or online when the job does not require a visit.
- Why: Owner direction.
- Tradeoffs: None recorded by the owner. **RISK** (R-28-10, R-28-14): without approved price items, each price rests on the estimator's judgment on the day; consistency and margin become visible only through job costing and the exceptions reports.
- Consequences: Answers Q-28-01 (pricing model: per-job pricing; no price items with pre-approved values) and decision packet item B1; answers [32](32-website-and-customer-experience.md) Q-32-06 in part (online estimates are offered when no visit is needed; whether a visit is free or charged is not answered). Not decided: who judges that a job needs no visit. In the software (`Bh3os/handyhub-app`) per-job pricing is being built as CORE 8c: the estimator enters the price of each line on the estimate and the server computes the totals in integer cents; the owner then adds a "Priced per job" item for each service to a proposed price-book version ("How it is priced": "Priced per job"; no price is typed) and approves and activates that version with step-up. Price-book activation still needs each service's active, competently reviewed SOP and hazard templates (PRC-042, D-28-25 PROPOSED; [OWN-DEC-17](#OWN-DEC-17)). The `Pricing/` files stay unapproved benchmarks and nothing from them is seeded as a price (D-28-01). Sending an estimate still waits for the tax setting (OWNER D; [28](28-pricing-estimating-and-job-costing.md) section 3.9), the estimate validity ([OWN-DEC-34](#OWN-DEC-34)) and attorney-approved terms (OWNER G). There is no minimum job value ([OWN-DEC-31](#OWN-DEC-31)).
- Review trigger: A new owner direction, or the owner chooses to approve price items for some services.
- Approver: Owner (recorded); the margin basis stays with the CPA ([OWN-DEC-07](#OWN-DEC-07), Q-28-13)
- Blocks: neither (in force)
- Source: project chat, 2026-10-05; [28](28-pricing-estimating-and-job-costing.md) sections 3.3 and 15

#### OWN-DEC-33

**Launch service set: all four categories, all 26 services**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Service catalog, boundaries and activation
- Context: **FACT:** the owner's answer in the project chat, 2026-10-05, to decision packet item A1 (OWNER A), as relayed by the working session that asked the question (the owner's exact words are not reproduced in the message used for this record): all four categories launch - cleaning, drywall, painting and home improvement, all 26 services. [OWN-DEC-04](#OWN-DEC-04) already puts all 26 services in scope; the launch set was open (Q-00-02 = Q-04-01 = Q-29-02 = Q-31-03 = Q-32-07 = Q-18-01; gap G-139).
- Options considered: A smaller first set chosen by review burden or demand (decision packet item A1; [00](00-project-charter.md) section 4.4); all 26 services (selected).
- Selected approach: The launch service set is all 26 services in the four categories.
- Why: Owner direction.
- Tradeoffs: None recorded by the owner. **RISK:** each of the 26 services still needs its own competently reviewed SOP and hazard templates, insurance confirmation and attorney-reviewed scope terms before it can be offered, so the review chain covers 26 services instead of a few (**HYPOTHESIS**, [19](19-product-roadmap.md) section 7.1: the review chain is the longer path to launch); R-32-06 (leads for services that cannot yet be delivered).
- Consequences: Answers the launch-set part of Q-00-02, Q-04-01, Q-29-02, Q-31-03, Q-32-07 and Q-18-01 (gap G-139). Being in the launch set is not being bookable: a service is offered only when its SOP and hazard templates are active after competent review ([OWN-DEC-17](#OWN-DEC-17), D-31-01), its price-book status is active ([OWN-DEC-32](#OWN-DEC-32)), insurance is confirmed ([18](18-release-and-launch-plan.md) gate 9) and the owner's go decision is given ([OWN-DEC-22](#OWN-DEC-22)). Not decided: the order in which the safety professional reviews the SOPs (Q-31-03 order part) and the pilot set. In the software the preview website shows all 26 services (handyhub-app WEB 1, PR #35); every service stays not bookable until its activation evidence exists.
- Review trigger: A new owner direction, or a service cannot pass its competent review.
- Approver: Owner (recorded); HUMAN REVIEW: qualified safety professional (each SOP and hazard template), licensed insurance broker (coverage for each activity)
- Blocks: neither (in force); each service's activation evidence blocks that service
- Provenance (main session, 2026-10-05): these are the owner's own answers given through the in-chat question tool, which the recording session could not see; the owner selected, in the in-chat question "which service categories do you want to open first at launch?" (options Home improvement, Drywall, Painting, Cleaning), the answer "cleaning, dry wall , painting.and home improvement".
- Source: project chat, 2026-10-05; [owner-business-decision-packet](owner-business-decision-packet.md) item A1; [18](18-release-and-launch-plan.md) Q-18-01

#### OWN-DEC-34

**A sent estimate stays valid for 14 days**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Pricing, estimating and finance
- Context: **FACT:** the owner's answer in the project chat, 2026-10-05, to decision packet item B9 (OWNER I; [28](28-pricing-estimating-and-job-costing.md) Q-28-11): "14 day". [28](28-pricing-estimating-and-job-costing.md) section 5.4 gives every sent version an expiry from the active EstimateValidityPolicy (PRC-012).
- Options considered: Not recorded.
- Selected approach: A sent estimate stays valid for 14 days.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Answers the period part of Q-28-11 and decision packet item B9. Not decided: whether an expired estimate is re-priced (the second part of Q-28-11; [28](28-pricing-estimating-and-job-costing.md) section 5.4 proposes that re-issuing creates a new version priced under the active price book, PROPOSED), which time zone counts the days (Q-06-12), how long a sent change order stays valid (Q-06-11), and the customer-facing wording (attorney, ATT-Q10 in the [attorney packet](professional-packets/attorney-customer-documents.md)). In the software the `estimate_validity` business policy stays NOT CONFIGURED until the owner enters it (estimates cannot be sent, `ESTIMATES_CANNOT_BE_SENT`): staff app -> Business settings -> "How long an estimate stays open" -> Propose a version with your values -> 14, with where the decision comes from and what the version is for -> Propose version -> Activate (reason and step-up). Claude does not enter the value for the owner. Sending also waits for the tax setting (OWNER D) and attorney-approved terms (OWNER G).
- Review trigger: A new owner direction, or the attorney's wording review.
- Approver: Owner (recorded); HUMAN REVIEW: attorney licensed in KY and/or IN (validity wording, ATT-Q10)
- Blocks: neither (in force); estimate sending stays blocked until the owner activates the setting
- Source: project chat, 2026-10-05; [28](28-pricing-estimating-and-job-costing.md) section 5.4 and Q-28-11

#### OWN-DEC-35

**Reply to customers in less than an hour; website wording softer until an attorney approves "guaranteed"**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Website and customer experience
- Context: **FACT:** the owner's answer in the project chat, 2026-10-05 (OWNER F; [32](32-website-and-customer-experience.md) Q-32-03, response-time part): "answer guaranteed in less than hour". The scope "every day, all hours" and the website sentence below are as relayed by the working session that asked the question (the owner's words for them are not reproduced in the message used for this record). [32](32-website-and-customer-experience.md) section 4.1 rule 2 holds every guarantee for attorney review; [OWN-DEC-02](#OWN-DEC-02) records that 24/7 staffing is not established.
- Options considered: Not recorded.
- Selected approach: HandyHub answers a customer's inquiry in less than an hour, every day, at all hours. Until an attorney approves the word "guaranteed", the website states only: "We aim to reply within an hour, every day." (Spanish AI draft pending bilingual review). The business phone number and email address are not provided yet.
- Why: Owner direction.
- Tradeoffs: None recorded by the owner. **RISK:** a reply promise at all hours needs a person able to answer at all hours; the owner holds every office role ([OWN-DEC-28](#OWN-DEC-28)) and 24/7 staffing is not established ([OWN-DEC-02](#OWN-DEC-02)), so a missed reply breaks a published expectation. **RISK:** the word "guaranteed" may create a legal commitment (attorney, ATT-Q40). This is a reply promise only: no emergency, 24/7 or same-day service is promised ([00](00-project-charter.md) section 6.1 item 6 unchanged).
- Consequences: Answers the response-time part of Q-32-03 and the first-response part of [06](06-state-machines.md) Q-06-01. Still open: the public phone number, email address and business hours, and who answers out of hours (Q-32-03, OWNER F); when a lead becomes stale (Q-06-01). In the software the website's receipt and form show the softer sentence and the copy lint allows only that sentence and its Spanish draft (handyhub-app branch `feat/site-reply-wording`, in review); the contact path stays "[phone or email to be provided]". Added to the [attorney packet](professional-packets/attorney-customer-documents.md) as ATT-Q40.
- Review trigger: The attorney's answer to ATT-Q40, the owner provides the phone and email, or staffing changes.
- Approver: Owner (recorded); HUMAN REVIEW: attorney licensed in KY and/or IN (the word "guaranteed", ATT-Q40); qualified bilingual reviewer (Spanish sentence)
- Blocks: neither (in force)
- Provenance (main session, 2026-10-05): these are the owner's own answers given through the in-chat question tool, which the recording session could not see; for "when does it apply?" the owner selected "Every day, all hours"; for how the website says it, the owner selected "Softer wording now" (offered as: show "We aim to reply within an hour" now, switch to "guaranteed" after attorney review).
- Source: project chat, 2026-10-05; [32](32-website-and-customer-experience.md) section 4.1 rule 2 and Q-32-03

#### OWN-DEC-36

**Accepted payment methods: cash, check, Zelle, Cash App, Chime and Stripe; deposits not decided**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Pricing, estimating and finance
- Context: **FACT:** the owner's answer in the project chat, 2026-10-05 (OWNER E; [payments packet](professional-packets/payments-decision.md) item E1; decision packet item B4): "accept cash, check,zelle,cash app, chime, and stripe". The deposit policy (decision packet item B3, Q-28-09) was not decided. [OWN-DEC-09](#OWN-DEC-09) records cash and check acceptance with no payment provider selected.
- Options considered: Cash and check only, or also electronic methods once a provider exists (payments packet E1, E2).
- Selected approach: HandyHub accepts cash, check, Zelle, Cash App, Chime and Stripe. The deposit policy stays undecided.
- Why: Owner direction.
- Tradeoffs: None recorded by the owner. **RISK** (payments packet, [12](12-security-threat-model.md) section 4.18): more channels mean more reconciliation work and more ways for a forged payment confirmation to be accepted; a received check is still not cleared money ([OWN-DEC-09](#OWN-DEC-09)).
- Consequences: Answers payments packet item E1 and the methods part of [28](28-pricing-estimating-and-job-costing.md) Q-28-10; answers item E2 in part (Stripe is named; "payment provider not selected" in [OWN-DEC-09](#OWN-DEC-09) is superseded only to that extent). Not decided: how each electronic method is used (business accounts, payment instructions on invoices, and whether Stripe is connected to the software or used outside it), card on file (E3, Q-27-17), who collects cash and checks (E4, Q-27-03), refunds and credits (E5, Q-28-27), card disputes (E6, Q-06-18), payment terms (E7), provider fees (E8) and deposits (B3, Q-28-09). In the software the `payment_methods` policy stays NOT CONFIGURED (no payment can be recorded) and its parameter shape is not defined yet (`POLICY_KIND_NOT_PROPOSABLE`); the planned payment record accepts cash and check only ([08](08-data-model-and-database.md) `finance.payment`), so the six methods are configured at the payments step (CORE 15) after the CPA's reconciliation advice; any Stripe integration waits for the SEC-027 review and never stores a card number (AUTH-035). The `deposit_policy` stays NOT CONFIGURED: deposits are OFF.
- Review trigger: The payments step (CORE 15), the CPA's answers, or the owner decides the deposit policy.
- Approver: Owner (recorded); HUMAN REVIEW: CPA (reconciliation, fees), attorney licensed in KY and/or IN (provider terms, card on file, any fee passed to customers), IT/security reviewer (SEC-027 before Stripe goes live)
- Blocks: neither (in force); recording payments waits for the payments step
- Source: project chat, 2026-10-05; [payments packet](professional-packets/payments-decision.md) section 2
- Owner follow-up: 2026-10-12, see [OWN-DEC-67](#OWN-DEC-67): Square replaces Stripe; card payments are taken on staff phones and recorded by hand; no card surcharge; the website names no card provider.

#### OWN-DEC-37

**Service area: the Louisville metropolitan area in Kentucky and Southern Indiana (nine counties; Salem and Madison named)**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Compliance and service area
- Context: **FACT:** the owner's answer in the project chat, 2026-10-05 (OWNER C; decision packet item A4; [32](32-website-and-customer-experience.md) Q-32-08; gap G-126): "Kentuckiana refers to the metropolitan area that includes Louisville, Kentucky, and the surrounding counties in both Kentucky and Southern Indiana." The county list below is as relayed by the working session that asked the question (the owner's words for it are not reproduced in the message used for this record). [OWN-DEC-03](#OWN-DEC-03) records Kentuckiana with ZIP codes configured only after review.
- Options considered: ZIP codes or counties, one state or both (decision packet item A4).
- Selected approach: The service area is the Louisville metropolitan area: in Kentucky, Jefferson (Louisville), Oldham, Bullitt, Shelby and Meade counties; in Indiana, Clark, Floyd, Harrison (which includes Corydon) and Scott counties; plus the towns of Salem (Washington County, IN) and Madison (Jefferson County, IN).
- Why: Owner direction.
- Tradeoffs: None recorded by the owner. Both states are served, so each needs its own legal, tax and permit assessment ([OWN-DEC-03](#OWN-DEC-03); the CPA and attorney packets ask per state).
- Consequences: Answers the coverage part of Q-32-08 and decision packet item A4 (gap G-126 in part). Not decided: who may override coverage for a single request (Q-32-08); for Salem and Madison, whether the whole county or only the town is served (new Q-32-22, because the owner named the towns, not the counties). The ZIP-code proposal built from the official Census 2020 ZCTA-to-county relationship file is [owner-service-area-zip-list.md](owner-service-area-zip-list.md), PROPOSED until the owner activates it; on 2026-10-05 its tables could not be extracted because the Census site was unreachable from the session. In the software the `service_area` policy stays NOT CONFIGURED (no automatic coverage check; a person reviews every request) until the owner pastes the list: staff app -> Business settings -> Service area -> Propose -> Activate (step-up).
- Review trigger: The owner activates the ZIP list, answers Q-32-22, or adds or removes an area.
- Approver: Owner (recorded); HUMAN REVIEW: attorney licensed in KY and/or IN and CPA for each state's rules ([OWN-DEC-03](#OWN-DEC-03))
- Blocks: neither (in force)
- Provenance (main session, 2026-10-05): these are the owner's own answers given through the in-chat question tool, which the recording session could not see; the owner answered the in-chat county questions with, for Kentucky, "Meade county, clark county in, Floyd county in , including salem,coyrdon,and Madison in,Jefferson (Louisville),Oldham,Bullitt,Shelby" and, for Southern Indiana, "Clark,Floyd,Harrison,Scott".
- Owner answer recorded: 2026-10-05 (later the same day): "then whole counties". Q-32-22 is answered: the whole of Washington County, IN (Salem) and Jefferson County, IN (Madison) is served, so the service area is eleven whole counties (KY Jefferson, Oldham, Bullitt, Shelby, Meade; IN Clark, Floyd, Harrison, Scott, Washington, Jefferson). The extraction script now lists both as core counties ([owner-service-area-zip-list.md](owner-service-area-zip-list.md) section 8).
- Source: project chat, 2026-10-05; [owner-service-area-zip-list.md](owner-service-area-zip-list.md)

#### OWN-DEC-38

**No second administrator yet; nobody releases a hold they raised**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Field safety, SOPs and job execution
- Context: **FACT:** the owner's answer in the project chat, 2026-10-05: "don't make a second admin yet". Keeping the strict rule (nobody releases a hold they raised) is as relayed by the working session that asked the question. **FACT** (handyhub-app PR #33, CORE 12b and 12c): a hold is released only by an administrator with step-up, a reason, the evidence and the qualified assessor's qualification, and never by the person who raised it (`RELEASER_IS_REPORTER`). Voiding a hold (`VoidHold`, [06](06-state-machines.md) H3) is not built yet (the handyhub-app field-safety module lists it as not built), so no hold can be voided by anyone today. The owner is the only administrator ([OWN-DEC-28](#OWN-DEC-28)). [06](06-state-machines.md) section 6.4 (H2, H3) and [27](27-roles-and-permissions.md) sections 6.3 and 9 set the release and self-approval rules.
- Options considered: Create a second administrator account; keep the strict rule without a second administrator (selected). Relaxing the rule for a sole administrator is not an option: safety gates are never weakened (CLAUDE.md rule 4).
- Selected approach: No second administrator account is created for now. The rule stays as built: nobody releases a hold they raised.
- Why: Owner direction.
- Tradeoffs: **RISK:** a hold the owner raises cannot be released until a second administrator exists, so that job stays blocked even after a qualified assessment. Stop Work and Report Hazard stay available to everyone, and a hold a worker raises can still be released by the owner as administrator with the qualified assessment.
- Consequences: Applies the self-approval refusals of [OWN-DEC-28](#OWN-DEC-28) to every hold release. [06](06-state-machines.md) H2 names the lead worker ("a lead worker never releases their own hold"); the software applies the rule to every person, which this entry confirms. When the owner wants such a hold released, the remedy is to create a second administrator (a new owner decision; an account with MFA per [27](27-roles-and-permissions.md) section 8.1), never to relax the rule. This decision does not change voids: [06](06-state-machines.md) H3 (PROPOSED) still governs them once `VoidHold` is built (entered in error only; for a critical hold a second person's confirmation where one exists, otherwise the void is listed for the qualified safety professional's periodic review, Q-06-15).
- Review trigger: The owner decides to create a second administrator, the first hire ([OWN-DEC-28](#OWN-DEC-28)), or the qualified safety professional's review of the hold rules (Q-06-15, Q-27-15).
- Approver: Owner (recorded); the qualified safety professional reviews the hold rules (Q-06-15, Q-27-15)
- Blocks: neither (in force)
- Provenance (main session, 2026-10-05): these are the owner's own answers given through the in-chat question tool, which the recording session could not see; the owner selected "Keep strict, add 2nd admin (Recommended)" in the in-chat question on hold release, then wrote "don't make a second admin yet".
- Source: project chat, 2026-10-05; [06](06-state-machines.md) section 6.4; [27](27-roles-and-permissions.md) sections 6.3 and 9

#### OWN-DEC-39

**Record when the customer first opens the estimate link (date and time only)**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: State machines (estimate); privacy
- Context: **FACT:** the owner's answer in the project chat, 2026-10-05, to [06](06-state-machines.md) Q-06-02, as relayed by the working session that asked the question (the owner's exact words are not reproduced in the message used for this record): yes, record "Viewed" - the first open, date and time only. D-06-24 (PROPOSED) records "Viewed" only from an authenticated session or a verified version-bound link and uses no email open tracking.
- Options considered: Do not record views; record views from the estimate link (selected); email open tracking (not used, D-06-24).
- Selected approach: HandyHub records that a customer viewed an estimate: the first time the estimate link is opened, with the date and time only.
- Why: Owner direction.
- Tradeoffs: None recorded by the owner. Later opens are not recorded.
- Consequences: Answers the owner part of Q-06-02 for [06](06-state-machines.md) section 5 (STM-002 "Viewed"). D-06-24 stays PROPOSED as written; this entry does not approve its other parts. **ASSUMPTION** drawn from "date and time only": no device, network address or location of the open is kept ([13](13-privacy-data-governance.md) telemetry rules). In the software the customer approval link (handyhub-app CORE 9b, PR #31) records `first_viewed_at` when the link is opened for the content it was issued for. Whether the privacy notice must mention this record is ATT-Q41 in the [attorney packet](professional-packets/attorney-customer-documents.md).
- Review trigger: The attorney's answer to ATT-Q41, or the privacy owner's review.
- Approver: Owner (recorded); privacy owner OWN-007; HUMAN REVIEW: attorney licensed in KY and/or IN (privacy-notice disclosure, ATT-Q41)
- Blocks: neither (in force)
- Provenance (main session, 2026-10-05): these are the owner's own answers given through the in-chat question tool, which the recording session could not see; the owner selected "Yes, record viewed (Recommended)" (offered as: records the first time the customer opens the link; no device, location or IP data).
- Source: project chat, 2026-10-05; [06](06-state-machines.md) section 5.2, D-06-24 and Q-06-02

#### OWN-DEC-40

**Field workers see the service address from visit confirmation through the service day, then it is hidden**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Security / identity and access (privacy)
- Context: **FACT:** the owner's answer in the project chat, 2026-10-05, to [27](27-roles-and-permissions.md) Q-27-09 (= [11](11-worker-job-execution.md) Q-11-19, address part), as relayed by the working session that asked the question (the owner's exact words are not reproduced in the message used for this record). D-27-04 (PROPOSED, [27](27-roles-and-permissions.md) section 5.2) shows the address from the Upcoming phase; [13](13-privacy-data-governance.md) section 3.3 row 3 limits assigned field roles to the access window.
- Options considered: The phases of the [27](27-roles-and-permissions.md) section 5.2 access window.
- Selected approach: The assigned field worker sees the service address from the moment the office confirms the visit through the service day; after the service day the address is hidden.
- Why: Owner direction.
- Tradeoffs: None recorded by the owner.
- Consequences: Answers the address part of Q-27-09 and Q-11-19. A tentative assignment or slot hold shows no address; the post-service view shows none. Still open: when the site contact phone and access secrets appear (D-27-04 proposes the service day only), the post-service grace period (Q-27-09) and whether workers see customers' full names (Q-11-19). D-27-04 stays PROPOSED for its other parts. In the software the worker's "My day" screen (handyhub-app CORE 13b part 1, PR #32) shows the address only for visits the office has confirmed, in the Upcoming and Service-day phases, and not after the service day. **FACT** (handyhub-app `apps/server/src/modules/field/day.ts`): the address also disappears as soon as the visit is completed or recorded as a no start (Post-service phase), which can be before the service day ends; past visits are not listed. That is stricter than "through the service day"; showing the address until the day ends after an early completion would be a reviewed code change if the owner wants it.
- Review trigger: The privacy owner's review, or an operational need for earlier access.
- Approver: Owner (recorded); privacy owner OWN-007
- Blocks: neither (in force)
- Provenance (main session, 2026-10-05): these are the owner's own answers given through the in-chat question tool, which the recording session could not see; the owner selected "Once visit is confirmed (Recommended)" (offered as: the address shows from the time the office confirms the visit through the service day, then is hidden).
- Source: project chat, 2026-10-05; [27](27-roles-and-permissions.md) section 5.2; [11](11-worker-job-execution.md) section 3.2; [13](13-privacy-data-governance.md) section 3.3

#### OWN-DEC-41

**Notification outbox merged with automatic drafts off (NOT CONFIGURED) until the 27 workflow 5 amendment is approved**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Communications and notifications
- Context: **FACT:** the owner's decision in the project chat, 2026-10-05, as relayed by the working session and recorded in handyhub-app PR #36: merge the notification outbox with automatic drafts switched off - NOT CONFIGURED - until the owner approves the amendment of [27](27-roles-and-permissions.md) section 10.4 workflow 5. [06](06-state-machines.md) section 2.6 lists "notification drafts for events outside the auto-send policy in workflow 5" among the SYS writes that 27 must confirm and says they are not built until 27 adds them.
- Options considered: Merge with automatic drafts on; merge with drafts off (selected); do not merge yet.
- Selected approach: The outbox is merged. No message is drafted automatically from requests or visits; a message leaves draft only when staff release it, and a released message is kept, not sent (no provider exists).
- Why: Owner direction.
- Tradeoffs: None recorded by the owner.
- Consequences: The workflow 5 amendment (SYS may create drafts for events outside the auto-send policy, for staff release) stays PROPOSED until the owner approves it; turning drafts on is then a reviewed code change, never a setting. The auto-send policy remains unapproved, no email or text provider is chosen, and the business email and phone are not provided (OWNER F, [OWN-DEC-35](#OWN-DEC-35)).
- Review trigger: The owner approves or rejects the [27](27-roles-and-permissions.md) section 10.4 workflow 5 amendment.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Provenance (main session, 2026-10-05): these are the owner's own answers given through the in-chat question tool, which the recording session could not see; the owner selected "Merge, drafts off (Recommended)" (offered as: merge the outbox, the Messages screen and the release flow, but keep automatic drafts switched off, NOT CONFIGURED, until the owner approves the roles change).
- Source: project chat, 2026-10-05; [06](06-state-machines.md) section 2.6; [27](27-roles-and-permissions.md) section 10.4

#### OWN-DEC-42

**Deposit: 20% on estimates over $1,000; due timing, refunds and tax basis not decided**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Pricing, estimating and finance
- Context: **FACT:** the owner's message in the project chat, 2026-10-05: "the estimates over 1000 requires 20 % deposit" (decision packet item B3; G-125; Q-05-03; Q-06-06). Earlier the same day the deposit policy was recorded as not decided ([OWN-DEC-36](#OWN-DEC-36), [OWN-DEC-08](#OWN-DEC-08) owner-answer line).
- Options considered: No deposit; a deposit on every estimate; a deposit above a threshold (selected).
- Selected approach: An estimate whose total is over $1,000.00 requires a deposit of 20% of that total; at or below $1,000.00 no deposit is required. The software reads "over" as strictly greater than $1,000.00 (PROPOSED reading, to confirm with the owner).
- Why: Owner direction.
- Tradeoffs: None recorded by the owner. **OPEN QUESTION:** when the deposit is due (at approval or before scheduling; owner). **HUMAN REVIEW:** refundability, forfeiture and the deposit clause wording (attorney licensed in KY and/or IN; ATT packet); whether the $1,000 threshold and the 20% basis include sales tax, whether a deposit is itself taxable, and the rounding of the deposit to cents (CPA; tax is NOT CONFIGURED today, so an estimate total is not final and the deposit amount is shown only once the total is known).
- Consequences: Answers the threshold and rate parts of decision packet item B3, G-125, Q-05-03 and Q-06-06. In the software (`Bh3os/handyhub-app`, PR #40, in review) the `deposit_policy` policy kind becomes proposable with versioned values (threshold in cents, comparison "greater than", rate in basis points); nothing is seeded: the owner proposes "over $1,000, 20%" and activates it in Business settings with a reason and a fresh sign-in. Estimates show the rule and the exact amount (integer cents, ROUND_HALF_UP once) when the total is known, otherwise "total not known". Collection waits for the payments step (CORE 15; methods in [OWN-DEC-36](#OWN-DEC-36)). Launch criterion 10 ([00](00-project-charter.md) section 7.2) needs the activated policy.
- Review trigger: The owner decides the due timing, the attorney answers on refunds, or the CPA answers on the tax basis.
- Approver: Owner (recorded); HUMAN REVIEW: attorney licensed in KY and/or IN (refunds, wording), CPA (tax basis, rounding, deposit accounting)
- Blocks: neither (in force)
- Source: project chat, 2026-10-05; [28](28-pricing-estimating-and-job-costing.md); [30](30-service-agreement-standards.md)

#### OWN-DEC-43

**Business phone and email stay placeholders for now**

- Status: RECORDED owner decision
- Date: 2026-10-05
- Domain: Website and customer experience
- Context: **FACT:** the owner's message in the project chat, 2026-10-05: "leave the phone an email placeholder for now" (OWNER F; [32](32-website-and-customer-experience.md) Q-32-03, contact part).
- Options considered: Provide the business phone and email now; keep placeholders (selected).
- Selected approach: The business phone number and email address are not published yet; the website and messages keep their "to be provided" placeholders.
- Why: Owner direction.
- Tradeoffs: None recorded by the owner. Customers cannot call or email from the website until the owner provides them; the request form stays closed on staging anyway (OWNER H).
- Consequences: The contact part of Q-32-03 stays open by owner choice; no phone or email is invented anywhere ([OWN-DEC-35](#OWN-DEC-35) unchanged: the website says "We aim to reply within an hour, every day."). The notification provider stays NOT CONFIGURED ([OWN-DEC-41](#OWN-DEC-41)).
- Review trigger: The owner provides the phone and email (before the go decision, OWNER H).
- Approver: Owner (recorded)
- Blocks: neither (in force); needed before the go decision
- Source: project chat, 2026-10-05
- Owner answer recorded: 2026-10-06; see [OWN-DEC-49](#OWN-DEC-49) (the website now shows `info@handyhub247.com`) and [OWN-DEC-47](#OWN-DEC-47) (the phone stays a placeholder).

#### OWN-DEC-44

**Website rebuild for local search and quote requests: goals, steps and rules**

- Status: RECORDED owner direction
- Date: 2026-10-06
- Domain: Website and customer experience
- Context: **FACT:** the owner's brief in the project chat, 2026-10-06: "You are rebuilding an existing website, HandyHub, in this repo." Goals in order: "Rank on Google for local searches", "More quote requests and calls", "Look premium and trustworthy", "Fix anything broken or unfinished"; an audit first ("Stop and wait for my approval before editing"), then local SEO, quote requests, premium design and fixes; rules: "Work on a new git branch. Commit after each step", "Never invent reviews, prices, licenses, addresses, or photos. Where content is missing, insert [[PLACEHOLDER: what is needed]]", "Do not deploy. Verify each step in the browser at mobile and desktop widths". The audit was approved through the owner's answers recorded in [OWN-DEC-45](#OWN-DEC-45) to [OWN-DEC-52](#OWN-DEC-52).
- Options considered: Not recorded.
- Selected approach: The website is rebuilt in four steps, one commit each, on handyhub-app branch `feat/local-seo-rebuild` (draft PR #59, not merged: a merge deploys staging automatically). Missing content is a visible `[[PLACEHOLDER: ...]]`, listed in the report `docs/website-rebuild-2026-10-06.md`.
- Why: Owner direction.
- Tradeoffs: None recorded by the owner.
- Consequences: handyhub-app PR #59 and its report (before and after Lighthouse, changes, redirects, placeholders, the owner's checklist outside the code). The PROPOSED choices made while building are [D-20-10](#D-20-10) to [D-20-13](#D-20-13).
- Review trigger: The owner reviews PR #59.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-06

#### OWN-DEC-45

**Public website in English only; Spanish stays for the staff**

- Status: RECORDED owner decision
- Date: 2026-10-06
- Domain: Website and customer experience
- Context: **FACT:** "let the spanich only for the staff cuz i will hire mexicans but the customers only use english" (project chat, 2026-10-06).
- Options considered: Keep the bilingual public website; English-only public website with Spanish for the staff (selected).
- Selected approach: The public website is English only. Spanish stays in the staff app and the worker screens (`@handyhub/i18n`, English and Spanish keys, AGENTS.md), including safety text, which still needs a qualified bilingual reviewer. The former `/es` pages answer 301 with the English page.
- Why: Owner direction: the customers use English; the crew may use Spanish.
- Tradeoffs: Spanish-speaking customers have no Spanish website; the request form records English as the page language.
- Consequences: handyhub-app PR #59 step 1 (redirects in `platform/site-redirects.ts`). The bilingual requirement for staff and worker screens is unchanged.
- Review trigger: The owner wants Spanish for customers.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-06

#### OWN-DEC-46

**The business name stays HandyHub**

- Status: RECORDED owner decision
- Date: 2026-10-06
- Domain: Brand and business identity
- Context: **FACT:** "keep my name handy hub" (project chat, 2026-10-06), asked during the rebuild audit.
- Options considered: Not recorded.
- Selected approach: The website, structured data and social image use the name "HandyHub" ([OWN-DEC-02](#OWN-DEC-02) unchanged).
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: No rename anywhere.
- Review trigger: The owner changes the name.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-06

#### OWN-DEC-47

**The business phone stays a placeholder on the website for now**

- Status: RECORDED owner decision
- Date: 2026-10-06
- Domain: Website and customer experience
- Context: **FACT:** "leave phone number place holder for now" (project chat, 2026-10-06).
- Options considered: Publish a number now; keep a visible placeholder (selected).
- Selected approach: Every phone spot on the website shows a visible `[[PLACEHOLDER: business phone number]]`; no page links to a number and the structured data has no telephone until the build variable `PUBLIC_BUSINESS_PHONE` is set.
- Why: Owner direction.
- Tradeoffs: Visitors cannot tap to call until the number is set.
- Consequences: Reaffirms the phone part of [OWN-DEC-43](#OWN-DEC-43). Setting the number is the first item of the owner checklist in the PR #59 report.
- Review trigger: The owner provides the number (before the go decision, OWNER H).
- Approver: Owner (recorded)
- Blocks: neither (in force); needed before the go decision
- Source: project chat, 2026-10-06

#### OWN-DEC-48

**The street address is never published**

- Status: RECORDED owner decision
- Date: 2026-10-06
- Domain: Website and customer experience
- Context: **FACT:** "don't publish my adress" (project chat, 2026-10-06).
- Options considered: Publish the address; name only the service area (selected).
- Selected approach: The website and its structured data name the service area (the 11 counties) and the state only, never a street, city of residence or ZIP code. The Google Business Profile is set up as a service-area business with the address hidden (owner step).
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: Tests in handyhub-app fail if a street address, a ZIP code or an address field reaches a page or the structured data.
- Review trigger: The owner decides to publish an address.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-06

#### OWN-DEC-49

**The business email is on the owner's domain: info@handyhub247.com**

- Status: RECORDED owner direction
- Date: 2026-10-06
- Domain: Website and customer experience
- Context: **FACT:** "i,m gonna use handyhub247.com so write appropiate email for that domain" (project chat, 2026-10-06). The address `info@handyhub247.com` was chosen by Claude at the owner's direction; the owner may choose another.
- Options considered: Keep the email placeholder; an address on the domain (selected).
- Selected approach: The website shows `info@handyhub247.com` in every footer, on About, Accessibility and Privacy, and in the structured data. Creating the mailbox and its DNS records (MX, SPF, DKIM, DMARC) is an owner step; the software sends nothing from it (the notification provider stays NOT CONFIGURED, [OWN-DEC-41](#OWN-DEC-41)).
- Why: Owner direction.
- Tradeoffs: Mail to the address bounces until the owner creates the mailbox.
- Consequences: Updates the email part of [OWN-DEC-43](#OWN-DEC-43). Domain ownership is recorded as the owner's statement; G-150 stays open until it is verified.
- Review trigger: The owner creates the mailbox or picks another address.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-06

#### OWN-DEC-50

**Stock photos per service now; photos from real jobs later**

- Status: RECORDED owner decision
- Date: 2026-10-06
- Domain: Website and customer experience
- Context: **FACT:** "use stock that shows each service and in our latest projects we gonna use the pictures from our jobs" (project chat, 2026-10-06).
- Options considered: No photos; stock photos per service with real job photos later (selected).
- Selected approach: Each service shows a free stock photo (Unsplash license) downloaded at build time and served from the site; a photo the owner adds under the same name replaces it. "Latest projects" keeps placeholders until the owner supplies photos from real jobs, each with the customer's permission.
- Update 2026-10-06: the photo source is now Pexels (pexels.com/license: free to use, no attribution required). Unsplash refused the build servers with HTTP 401, in CI and on Render. 25 of the 26 services have a photo; air-duct cleaning keeps the designed fallback block until a suitable photo is found. Each photo was chosen by its Pexels title, and the owner checks them on staging (handyhub-app PR #60, merged as `6f70dc2`).
- Why: Owner direction.
- Tradeoffs: Stock photos show the kind of work, not HandyHub's own; the owner reviews them after the first build.
- Consequences: handyhub-app `scripts/fetch-photos.mjs`, `src/data/photos.json`; the fetch never fails a build. No stock photo is presented as HandyHub's own work.
- Review trigger: The owner supplies job photos.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-06

#### OWN-DEC-51

**The website shows the licensed-trade and hazard limits again**

- Status: RECORDED owner decision
- Date: 2026-10-06
- Domain: Website and customer experience
- Context: **FACT:** "do include this plumbing and this stuff" (project chat, 2026-10-06), answering the audit question about the limits that an earlier request had removed from the website (handyhub-app PR #56).
- Options considered: Keep the limits off the website; show them again (selected).
- Selected approach: Every service page answers "Is there anything you don't do?" with the service's own limits, the home-age limits where they apply, and the licensed-trade (line-voltage electrical, gas, plumbing, HVAC), asbestos and lead, mold and structural limits; How estimates work lists "Work we don't do". The same text is in the FAQPage structured data.
- Why: Owner direction; master section 1.3 boundaries.
- Tradeoffs: Longer service pages.
- Consequences: handyhub-app `src/data/faq.ts`. **HUMAN REVIEW:** the attorney and the safety professional read the wording before launch.
- Review trigger: Attorney or safety-professional review of the wording.
- Approver: Owner (recorded); **HUMAN REVIEW: attorney licensed in KY and/or IN; qualified safety professional**
- Blocks: neither (in force)
- Source: project chat, 2026-10-06

#### OWN-DEC-52

**The quote forms are tested before launch**

- Status: RECORDED owner direction
- Date: 2026-10-06
- Domain: Website and customer experience
- Context: **FACT:** "i want the requst forms to be tested before the launc" (project chat, 2026-10-06).
- Options considered: Not recorded.
- Selected approach: An automated end-to-end test sends the real quote form, with a photo, through the real server and PostgreSQL on every change (handyhub-app `apps/e2e/tests/quote-form.spec.ts`); after opening the form at the go decision the owner sends one test request and checks it on Requests.
- Why: Owner direction.
- Tradeoffs: None recorded.
- Consequences: The test runs in CI; a red test blocks the merge.
- Review trigger: The go decision (OWNER H).
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-06

#### OWN-DEC-53

**Deploy the rebuilt website and the staff app to staging**

- Status: RECORDED owner direction
- Date: 2026-10-06
- Domain: Release and launch
- Context: **FACT:** after the rebuild report the owner wrote "No deploy i want see how it works and i want to see how the employees dite works too", then "No i mean i want deploy gor both sites" (project chat, 2026-10-06). This lifts the brief's "Do not deploy" ([OWN-DEC-44](#OWN-DEC-44)) for staging.
- Options considered: Not recorded.
- Selected approach: handyhub-app PR #59 merged (squash, `ac65d83`), and Render deployed the single staging service `handyhub-staging` automatically (live 2026-10-06 02:21 UTC). That service serves the website at `/` and the staff app at `/app/`. The staging defaults are unchanged: noindex, quote form closed, phone placeholder.
- Why: Owner direction. The owner wants to see both sites working.
- Tradeoffs: The first build downloaded no stock photos, because Unsplash's download link answered 401 (in CI too). Service pages showed the designed fallback block until the follow-up fix, handyhub-app PR #60 (merged 2026-10-06 as `6f70dc2`), switched to free Pexels photos for 25 of the 26 services (see [OWN-DEC-50](#OWN-DEC-50)).
- Consequences: Staging only. Production, the real domain and opening the quote form stay with the go decision (OWNER H; [OWN-DEC-22](#OWN-DEC-22)).
- Review trigger: The go decision (OWNER H).
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-06

#### OWN-DEC-54

**Premium home-services identity for the website and the staff app**

- Status: RECORDED owner decision
- Date: 2026-10-11
- Domain: Website and customer experience
- Context: **FACT:** the owner's design brief in the project chat, 2026-10-11, after the website audit of the same day: "For HandyHub, I would go with a Premium Home-Improvement Company identity: elegant, modern, professional, and trustworthy, with a strong local presence in Kentucky and Southern Indiana. The website should feel like an established home-services company that customers trust with their properties, not a gig-work marketplace or a generic handyman template." Colour system named by the owner: Deep Navy #1A2B49, Warm Ivory #F7F5F0, Champagne Gold #C79A55, Charcoal #303942, Stone #E7E2D9 ("champagne gold adds elegance without the aggressive look of bright construction-yellow buttons"). Visual inspiration: architectural photography, clean compositions, restrained colours, a premium residential atmosphere. Home page direction with the label "Your property. Our priority.", the headline "Professional care for every corner of your property." and the actions "Request an estimate" and "Explore services". Site structure: hero; trust and credentials ("genuine insurance, qualifications, guarantees, and verified reviews"); services; our work ("real project portfolios"); why HandyHub; how it works; who we serve; service areas "with ZIP-code verification"; testimonials ("authentic reviews"); final call to action. Features: "a guided estimate request that lets them select a service, describe the job, upload photos, specify their property location, and choose a preferred appointment window", "clear confirmation", review of the estimate before accepting; the admin and technician portal handles estimates, assignments, schedules, SOPs, safety checks, tools, materials, job photographs, customer communication, invoicing and payment status, "without making unsupported claims about live dispatch or technician availability". Design rules for the coding agent: editorial-quality layouts, beautiful residential and project photography, deep navy and warm neutral colours, refined typography, generous whitespace, subtle motion, exceptional mobile usability; "Avoid gig-economy marketplace aesthetics, generic SaaS dashboards on public pages, excessive gradients, cartoon illustrations, aggressive animations, misleading fleet claims, and fabricated credentials or reviews"; the public website designed for conversion and customer confidence, the internal platform for speed, clarity, safety and efficiency, one HandyHub identity across both. Next deliverable named by the owner: "a complete HandyHub UI/UX design specification".
- Options considered: Keep the "work order" direction of 2026-10-06 ([D-20-13](#D-20-13)); the premium residential identity (selected).
- Selected approach: The identity, its tokens, components, every public page, the guided estimate request, the journeys and the staff-app token mapping are specified in handyhub-app `docs/design/handyhub-design-spec.md` (version 1.0, 2026-10-12; handyhub-app PR #61), and built in five phases. Credentials, reviews and projects appear only when real, verified and permitted, and their sections render only then (CLAUDE.md rule 1; [32](32-website-and-customer-experience.md) section 4); no placeholder is visible on the public site. The words the copy check blocks (premium, luxury, best, expert, team, insured, licensed, guarantee, years of experience and the others) stay off the site until approved and, where needed, reviewed by the attorney. The ZIP check answers from the `service_area` policy; the ZIP list for the 11 counties is policy data the owner activates. The preferred visit windows are a request preference, never an appointment (CX-002). The specification also sets the typefaces as PROPOSED (Newsreader and Source Sans 3) and retires the work-order ticket as PROPOSED, both for the owner's confirmation.
- Why: Owner direction. The audit of 2026-10-11 found the site clear but short of proof and of a distinctive, trustworthy look.
- Tradeoffs: Navy and gold are a common "established company" palette; the execution (one signature, restrained gold, editorial type, real photography) must carry the distinctiveness. Sections that depend on the owner's content (credentials, reviews, projects, the introduction, county lines) stay absent until it exists, so the first live version is quieter than the brief's mockup.
- Consequences: [D-20-13](#D-20-13) SUPERSEDED. Plan 10 D-10-17 (neutral palette and system font until brand assets exist) is answered: brand assets now exist. Plan 32 sections 2.3 and 6.3 (the guided request, ZIP coverage, timing preference) are built in the shape of the specification. HUMAN REVIEW: attorney for credential wording once certificates exist and for the review-publication permission text; the safety reviewer for the limits list on every service page.
- Review trigger: The owner's confirmation of the PROPOSED items in the specification's section 10; the first real credentials, reviews and project photographs.
- Approver: Owner (recorded); Attorney (KY/IN) for credential and review wording
- Blocks: neither (in force)
- Source: project chat, 2026-10-11 (the owner's design brief); handyhub-app `docs/design/handyhub-design-spec.md`
- Implementation: built in handyhub-app PR #62 (branch `design/identity-phases-1-5`, the five phases, merged by the owner 2026-10-12; CI green; staging deploy live). The gated sections (credentials, reviews, projects, the introduction) render only from the owner's content, still empty. CHG-20261012-003.

#### OWN-DEC-55

**Typography and service presentation of the premium identity**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Website and customer experience
- Context: **FACT:** the owner's answer to the four PROPOSED items of the design specification (project chat, 2026-10-12): "Newsreader + Source Sans 3: Approve. Excellent balance of editorial luxury and practical readability." "Replace work-order ticket with plate + At a glance: Approve. More refined, less industrial." Rules in the owner's words: "I'd specify Newsreader for prominent marketing headlines and selected section titles, with Source Sans 3 everywhere else, including navigation, service cards, form inputs, small labels and the customer dashboard. Avoid using Newsreader at tiny sizes, and don't overuse italic headline treatments. Premium typography depends on restraint." "Retire the work-order ticket visual from the customer-facing website. Use the refined service plate and clean 'At a glance' information rows. Preserve functional work-order interfaces in the internal admin and technician portals. Prioritize service photography, relevant details, and clear estimate actions over decorative UI elements." "The key is to make 'At a glance' genuinely informative rather than filling it with decorative labels or unverified service promises." Overall principle: "Every customer-facing element should reinforce HandyHub's premium home-improvement identity: thoughtful, polished, trustworthy, approachable, and operationally reliable."
- Options considered: Manrope as the body face (the owner preferred Source Sans 3: "less overtly technological"); keeping the ticket (rejected: "communicates administrative paperwork").
- Selected approach: As the owner wrote. The specification (handyhub-app `docs/design/handyhub-design-spec.md`, version 1.1) sets Newsreader never below 24 px and never italic, Source Sans 3 for spec values, navigation, forms, small labels and the staff app, and the At a glance rows Services, Estimate, Service area, Visits and Next step, each factual.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Phase 1 of the build (tokens, fonts, shell, plate, spec rows) can start; the home ticket of 2026-10-06 is removed in phase 2.
- Review trigger: None.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12
- Implementation: handyhub-app PR #62, phases 1 and 2 (Newsreader and Source Sans 3 self-hosted; plate and At a glance rows; the ticket removed from the customer site, kept in the internal work-order interfaces), merged 2026-10-12. CHG-20261012-003.

#### OWN-DEC-56

**Visit preferences on the estimate request**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Website and customer experience
- Context: **FACT:** the owner's refinement (project chat, 2026-10-12): "Treat these as customer preferences, not confirmed availability." "I'd keep all five options." Wording: "When would you prefer a visit? Select your preferred time. We'll confirm scheduling after reviewing your request." Options "Mornings, Afternoons, Evenings, Weekends, Any time, I'm flexible"; "This is a preference, not a confirmed appointment." "For the production form, I would make the options reflect actual working hours, support a preferred date where useful, and avoid promising evening or weekend appointments unless HandyHub provides them. If customers can accommodate more than one window, allowing multiple selections would make scheduling easier." Approved version: "Offer Mornings, Afternoons, Evenings, Weekends, and Any time. Clearly label these as preferred visit windows, not guaranteed availability. Display only options compatible with actual operating capacity. Confirm appointments after reviewing the service request."
- Options considered: Not recorded.
- Selected approach: As the owner wrote. The chips shown are the ones compatible with the configured visit hours (owner fact 2026-10-05: every day, 8 am to 10 pm, so all five appear today); several may be selected; an optional preferred date on or after tomorrow; stored as `preferred_windows` and `preferred_date` on the request, shown to the office, never written to a visit; the appointment is confirmed only when the office sends a date and an arrival window (CX-002).
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Plan 32 section 6.3 step 4 "timing preference" takes this shape; phase 4 of the build.
- Review trigger: Any change to the visit hours (the chips follow the configured hours).
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12
- Implementation: handyhub-app PR #62, phase 4 (the five chips with "Any time" standing alone, several selectable, an optional preferred date; stored as `preferred_windows` and `preferred_date`, migration 0029; shown to the office in the Requests list, never written to a visit), merged 2026-10-12. CHG-20261012-003.

#### OWN-DEC-57

**A dedicated county page only with authentic local content**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Website and customer experience
- Context: **FACT:** the owner's refinement (project chat, 2026-10-12): "I strongly agree with launching fewer, better pages. However, I'd distinguish between providing 2-3 authentic lines of local insight and creating an entire county landing page with only 2-3 lines. For a page to deserve its own URL, I'd include its real coverage, offered services, relevant communities, an authentic local introduction, and useful project or service details." "If you don't yet have sufficient material, keep the county on a well-designed, consolidated service-area page rather than generating a generic SEO landing page." Approved version: "Publish dedicated county pages only when authentic, location-specific information is available. Require at least 2-3 meaningful lines of original local context, supported by useful coverage and service details. Do not create repetitive, keyword-stuffed county pages. Keep other supported counties discoverable through the main service-area page until dedicated pages provide distinct value."
- Options considered: One page per served county ([D-20-12](#D-20-12), now superseded); county pages only with the owner's lines (the PROPOSED item); the owner's refinement (selected).
- Selected approach: As the owner wrote. The consolidated Areas page carries one section per county with an anchor (towns, the kinds of work, the request action) and the ZIP check; a county URL without a page answers 301 to its anchor, so the 11 county URLs published on staging on 2026-10-06 never break; the sitemap lists only pages that exist; the footer links to the page or the anchor.
- Why: Owner decision; Google's guidance against near-identical location pages, cited by the owner.
- Tradeoffs: Fewer indexable local pages until the owner's content exists.
- Consequences: [D-20-12](#D-20-12) SUPERSEDED; phase 3 of the build.
- Review trigger: The owner's local content for a county.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12
- Implementation: handyhub-app PR #62, phase 3 (the consolidated Areas page with a section and anchor per county and the ZIP check; a county page only with at least two local lines, none supplied yet; 301 from each county URL to its anchor; sitemap and footer follow), merged 2026-10-12. CHG-20261012-003.

#### OWN-DEC-58

**The estimate request form open on staging for the owner's testing**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Website and customer experience
- Context: **FACT:** after the identity build reached staging (handyhub-app PR #62, deploy live 01:46 UTC) the owner wrote "the request form is not working" (project chat, 2026-10-12). The staging log showed the request page served twice (01:56 and 01:57 UTC) with no call to the form's endpoints, which is the designed closed panel: the website was built with the Dockerfile default `PUBLIC_INTAKE=closed` and the server ran with `INTAKE_PUBLIC_FORM=closed`, both as the staging guide prescribed until the go decision. The deploy itself was healthy (environment stamped `staging`, migrations applied, no error logged). Asked whether to open the form on staging for testing, the owner chose "Open it on staging now".
- Options considered: Open both switches on staging (selected); the owner sets them in the Render dashboard; keep the form closed until the go decision (OWNER H).
- Selected approach: Claude set `PUBLIC_INTAKE=open` and `INTAKE_PUBLIC_FORM=open` on the Render service `handyhub-staging` at 02:03 UTC (the first is a Docker build argument: Render passes the service's environment variables to the build when the Dockerfile declares them with `ARG`); Render rebuilt and the deploy `dep-db63vrrbc2fs73anhgag` went live at 02:04:58 UTC. Staging keeps `noindex` and the preview notice; requests land in the staging database (synthetic environment); the form limit of 5 submissions per client address per hour applies (`TRUST_PROXY_HOPS=3`).
- Why: Owner decision, to test the guided estimate request end to end where it runs.
- Tradeoffs: While both switches are open, anyone who knows the staging address can submit a request into the staging database; the address is not indexed and not published. The launch-readiness item `public_form` reads ready on staging, which says nothing about production.
- Consequences: [OWN-DEC-22](#OWN-DEC-22) unchanged: production stays closed until the go decision. The staging guide (handyhub-app `docs/deploy-staging.md`, branch `docs/staging-form-open`) now names both switches and the staging state. The open form shows in the staging log as calls to `/api/public/v1/intake/status` and `/api/public/v1/sms-consent-notice` when the request page loads.
- Review trigger: The go decision (OWNER H); any real-customer data reaching staging (none expected).
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12
- Owner follow-up: 2026-10-12. Claude pointed out that the open staging form accepts personal data while the privacy notice is not attorney-approved, and that the website's privacy and terms pages say an attorney reviews them before the website accepts any request. Options offered: open for the test then close; close now; keep it open. The owner chose "Keep it open on staging". **RISK:** anyone who finds the staging address can submit real personal data without an approved privacy notice; the address is not indexed. **HUMAN REVIEW:** attorney licensed in KY and/or IN for the privacy notice and website terms (OWNER G). The staging guide (handyhub-app PR #63) states the switch closed by default and open on staging.
- Owner follow-up: 2026-10-12, see [OWN-DEC-73](#OWN-DEC-73): the whole staging environment goes behind an access gate for the owner and authorized testers; the forms stay enabled behind it. This replaces the public part of this decision.

#### OWN-DEC-59

**The two-websites functionality guide is the build specification**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Product scope; website and customer experience; operations
- Context: **FACT:** the owner uploaded "HandyHub: Customer Website, Staff Website, and Shared Business System - detailed functionality requirements and AI implementation guide" (version 1.0, 2026-10-11; 210 requirements with HH- ids, acceptance scenarios T01 to T75, implementation slices 0 to 9) and wrote "okay now build all what in this file and while you working if nedded to ask me any questions you welcome" (project chat, 2026-10-12). Its fixed rules: no minimum job charge (already [OWN-DEC-31](#OWN-DEC-31)); customer website, notifications and documents in English; staff website in English and Spanish with reviewed safety translations; guest requests with optional customer accounts; individual staff accounts; two websites on one business system and database.
- Options considered: Not recorded.
- Selected approach: Build the guide on the existing stack (no rewrite, no second database), slice by slice in its section 28 order, one pull request per slice, starting with the Slice 0 current-state and gap matrix (handyhub-app `docs/two-websites/`). Values the guide marks as proposed engineering defaults (session lengths, code lifetimes, polling interval, recovery targets) are configurable settings; business facts it leaves open (rates, tax, deposit terms beyond [OWN-DEC-42](#OWN-DEC-42), agreements, qualifications, coverage ZIPs, SOP content) stay NOT CONFIGURED until approved. The owner's answers to the guide's open choices are [OWN-DEC-60](#OWN-DEC-60) to [OWN-DEC-63](#OWN-DEC-63).
- Why: Owner direction.
- Tradeoffs: Very large scope; several slices can be built and tested on synthetic data but need owner, provider or professional inputs before live use (email account and domain, payment provider, attorney texts, competent SOP and Spanish safety review, qualifications).
- Consequences: Plans 09, 10, 11, 27 and 32 are read together with the guide; where they conflict, the guide and these owner answers govern and the conflict is recorded here.
- Review trigger: Each slice's merge; the owner's go decision (OWNER H).
- Approver: Owner (recorded); the professionals named per slice
- Blocks: neither (in force)
- Source: project chat, 2026-10-12; the guide file (handyhub-app `docs/two-websites/`)

#### OWN-DEC-60

**Email provider: Resend**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Communications; integrations
- Context: **FACT:** no email provider is configured (`NOTIFICATION_ADAPTER` accepts only `not_configured`; emails are recorded, never sent). The guide needs customer email for receipts, verification codes and estimate and invoice links. Asked "Which should HandyHub use?" with Resend, Amazon SES, Postmark or no email for now, the owner chose Resend.
- Options considered: Resend (selected); Amazon SES; Postmark; no email for now.
- Selected approach: A Resend adapter behind the existing notification outbox, NOT CONFIGURED until the owner creates the Resend account, verifies a sending domain and enters the API key in the host's settings (never in chat or a file). Outside production an email goes only to allow-listed test addresses, as text messages already do. Customer templates are English. Marketing email stays off (separate permission).
- Why: Owner decision.
- Tradeoffs: One more vendor holding customer email addresses and message content; it must be named in the privacy notice (attorney, OWNER G).
- Consequences: Owner actions: Resend account, sending domain DNS records, the sender address (business email, OWNER F), the API key on the host.
- Review trigger: Resend plan limits or deliverability problems.
- Approver: Owner (recorded); attorney for the privacy notice naming the vendor
- Blocks: neither (in force)
- Source: project chat, 2026-10-12

#### OWN-DEC-61

**The public request form requires both an email address and a phone number**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Website and customer experience
- Context: **FACT:** the guide makes email required and phone optional; the current form requires a phone and makes email optional ([OWN-DEC-44](#OWN-DEC-44) brief; [D-20-10](#D-20-10)). Asked which, the owner answered "make both required".
- Options considered: Email required and phone optional (the guide); phone required and email optional (current); both required (selected); at least one.
- Selected approach: Both fields required and validated on the client and the server; project access codes can go to either contact once it is verified; contact verification state stays visible to staff (HH-INT-13).
- Why: Owner decision.
- Tradeoffs: One more required field on the public form.
- Consequences: [D-20-10](#D-20-10) SUPERSEDED.
- Review trigger: Form completion data once the form is live.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12

#### OWN-DEC-62

**Request attachments: up to 10 photos, no PDFs**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Website and customer experience; privacy and data
- Context: **FACT:** the guide proposes 10 intake photos of 15 MiB and PDFs of 20 MiB (HH-INT-06); the current form takes up to 3 photos ([D-20-11](#D-20-11)). The owner chose "10 photos, no PDFs".
- Options considered: 10 photos and PDFs (the guide); 10 photos, no PDFs (selected); keep 3 photos.
- Selected approach: Up to 10 photos per request, JPEG, PNG or WebP, 15 MiB each (the existing D-32-07 size and the guide's proposal); no PDFs; validated by content signature, size and count on the server.
- Why: Owner decision.
- Tradeoffs: More stored personal media per request (retention per plan 13).
- Consequences: [D-20-11](#D-20-11) SUPERSEDED in its photo count.
- Review trigger: Real phone-camera files that exceed the size.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12

#### OWN-DEC-63

**Optional customer accounts sign in with a one-time code, no password**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Customer identity and access
- Context: **FACT:** the guide makes customer accounts optional and says not to build a custom authentication system (HH-ID-10). Asked how account customers should sign in, the owner chose "One-time code, no password".
- Options considered: One-time code by email or text (selected); ZITADEL customer accounts with passwords or passkeys.
- Selected approach: Passwordless sign-in with a one-time code sent to a verified email or phone, reusing the hashed, expiring one-time code system already built for estimate approval (12 D-12-05; `CUSTOMER_CODE_PEPPER`). Accounts link only verified, authorized records (HH-ID-02, HH-ID-03). Passkeys stay P1.
- Why: Owner decision.
- Tradeoffs: Sign-in depends on email or text delivery being available (OWN-DEC-60; Telnyx).
- Consequences: No new identity provider for customers; staff stay on ZITADEL ([OWN-DEC-27](#OWN-DEC-27)).
- Review trigger: A delivery outage or abuse of code requests.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12

#### OWN-DEC-64

**Quality review of every job by the owner, with punch-item rules**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Field work and quality
- Context: **FACT:** Slice 0 found HH-QA-02 in conflict with the owner's chat answer of 2026-10-05 to Q-06-05 ("Finishing a job don't need review"). Asked again, the owner chose "Owner reviews every job" and, for jobs the owner performed, "I review it, marked 'self-review'". On failed reviews the owner wrote: "Every problem becomes a punch item with an assigned owner, due date, and required correction evidence. Minor finish or cleanup issues: the job stays open and the customer sees "Follow-up work." The owner may issue an invoice if the approved payment terms allow it. Invoicing must not imply that unfinished work was accepted. Major defects, incomplete agreed scope, failed functional checks, or safety concerns: block the final invoice and return affected tasks for correction. Safety concerns also block affected work until properly resolved. Previously agreed deposit or progress invoices remain separate and follow their approved terms. The job cannot close until all punch items are corrected and pass re-check. Record the reviewer, results, evidence, and timestamps."
- Options considered: Owner reviews every job (selected); review only higher-risk jobs; no review.
- Selected approach: A ready_for_qa state after the worker's completion; the owner's review decision with a self-review flag when the owner did the work; punch items with owner, due date and correction evidence; minor issues keep the job open with "Follow-up work" for the customer and allow the invoice under the payment terms; major defects, incomplete scope, failed functional checks or safety concerns block the final invoice and return the affected tasks; deposit and progress invoices separate; closeout only after every punch item passes re-check.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Supersedes the 2026-10-05 chat answer to Q-06-05; slice 2.4 of the plan.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-65

**Customer emails are released by staff; codes and secure links send immediately**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Communications
- Context: **FACT:** Asked whether request receipts and status emails should go automatically, the owner chose "Staff release each email".
- Options considered: Automatic transactional emails; staff release each email (selected).
- Selected approach: Every customer email starts as a draft that staff release ([OWN-DEC-41](#OWN-DEC-41) kept). One-time codes and secure links are sent immediately because they expire within minutes or hours.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: OWN-DEC-41 confirmed.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-66

**Website facts the owner gave on 2026-10-05 (recorded late)**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Website and customer experience
- Context: **FACT:** The owner gave these facts in chat on 2026-10-05 and handyhub-app PR #47 published them (commit message: "Owner facts given in chat on 2026-10-05 ... quoted, not extended"), but they were never entered here; Slice 0 found the gap. Facts: estimates are free, online or in person; the 20% deposit on estimates over $1,000 is paid before materials are bought, the balance when the job is finished; 10% discounts for military members, seniors and returning customers, one per job, the biggest applies; visits every day, 8 am to 10 pm, never 24/7; same-day service when there is an opening, for an extra charge shown on the estimate; home-age limits (no paint-disturbing work in homes built before 1978 on HI-09, DW-01, DW-02, DW-03, PT-01, PT-02, PT-03, PT-04; popcorn removal only in homes built in 1981 or later on DW-02); the customers served (homeowners, renters, landlords, short-term rental hosts).
- Options considered: Not recorded.
- Selected approach: Recorded as owner facts in force; [OWN-DEC-67](#OWN-DEC-67) changes the card wording to an unnamed provider.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Completes [OWN-DEC-42](#OWN-DEC-42) (deposit timing) and the reply-only wording of [OWN-DEC-35](#OWN-DEC-35) (same-day service is offered only when there is an opening, for an extra charge).
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-67

**Square on staff phones instead of Stripe, recorded by hand; no card surcharge**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Pricing, estimating and finance
- Context: **FACT:** Asked whether to connect Stripe, the owner answered: "instead of stripe i will do square and the payments will be done through the staa phone"; "the customer can pay either way he like but for the deposit it will be secure link send to the customer using the built in functionlaity on square app"; "i canceled stripe so we sill not need that". Square payments reach HandyHub: "Staff record them by hand". Collectors: "Owner and field employees". Surcharge: "my aeeoreny recommended not add for whatever so we will not add the surcharge" (withdrawing the earlier surcharge answers). Website wording: "Keep the card provider unnamed".
- Options considered: Connect Stripe; keep Stripe outside; both; Square on staff phones (selected, owner's own option).
- Selected approach: Square replaces Stripe in [OWN-DEC-36](#OWN-DEC-36). Card payments on staff phones (Tap to Pay); the deposit through a secure link sent from the Square app. HandyHub has no payment provider connection and no Pay button (HH-FIN-10): staff record each payment with the Square payment ID; a deposit counts as paid only when verified in Square. Owner and field employees collect with an explicit permission; refunds stay with the owner. No card surcharge. The website says "credit or debit cards" without naming the provider.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: HH-FIN-08 and HH-FIN-09 do not apply (no electronic payment inside the software); the SEC-027 review for Stripe is no longer needed.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-68

**Three Start Work administrative exceptions, requested by the worker and approved by the owner**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Field work and safety
- Context: **FACT:** HH-WORK-03 needed the list of permitted administrative exceptions. The owner wrote the rules in full (handyhub-app `docs/two-websites/owner-resolutions.md` R2): (1) customer not present, when the scope is approved and unattended access is explicitly authorized, access instructions confirmed and a contact available; only the walkthrough may be deferred; (2) before-photos captured but the upload failed, photos kept on the device and marked pending synchronization; missing capture cannot be waived; (3) deposit paid but bookkeeping pending, independently verified through Square or another approved provider with the transaction reference; a statement or screenshot is not enough. "An assigned worker may submit an exception request with the reason and supporting evidence. Only the owner may approve it." Approval covers one requirement, job and visit, expires when the visit ends, and is invalidated by a relevant change. "Safety, legal, qualification, scope approval, work authorization, and access permission cannot be waived. Every approved administrative exception appears in the owner's review queue."
- Options considered: No waivers; listed paperwork waivers (selected, with the owner's rules).
- Selected approach: An exception record per requirement, job and visit with requester, reason, evidence, owner approval, timestamp, follow-up owner and deadline; expiry at visit end; invalidation on relevant change; open follow-up tasks; the owner's review queue. The hard holds of the Start Job gate stay unwaivable (0018 no-override CHECK).
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Slice 2.3. HUMAN REVIEW recommended: a qualified safety professional confirms the boundary before production.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-69

**Arrival and finish timestamps per worker; no categorized time tracking or payroll**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Field work; payroll boundary
- Context: **FACT:** HH-WORK-06 needed a timekeeping policy. The owner chose "Not now" for categorized time tracking and wrote: "Keep time tracking simple. Record a separate timestamp for each assigned worker when they tap "Arrived" and "Finished." Calculate the elapsed visit duration and link it to the worker and job. Allow the owner to correct forgotten or incorrect timestamps, preserving the original values and recording the reason. Flag missing timestamps instead of inventing a duration. Export these records for the accountant. Do not calculate payroll, overtime, deductions, or paystubs. Arrival does not automatically start work or bypass the required Start Work checks."
- Options considered: Job costing only; job costing and payroll; not now (selected, with the timestamps rule).
- Selected approach: As the owner wrote.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Slice 2.2. Payroll stays outside the software (master section 1.3 boundary).
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-70

**Retention schedule per category with an owner deletion-review queue; no automatic deletion**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Privacy and data
- Context: **FACT:** HH-PRIV-01 and HH-DATA-09 needed retention periods. The owner set a configurable schedule: requests that never become jobs 2 years after closure; unaccepted estimates 2 years after expiration or closure; customer and property profiles while active, then 7 years after the last completed service; accepted estimates, work authorizations, contracts and change orders 10 years after final job closeout; invoices, payments, receipts, refunds and reconciliation 7 years after the relevant tax return is filed or tax is paid, whichever is later; job photos, operational messages, checklists and arrival/finish timestamps 7 years after job closeout (evidence for an approval or contract follows the longer period); ordinary safety acknowledgments and incident records 10 years after closure; regulated employee medical or exposure records excluded from routine deletion with a separate reviewed schedule; access codes removed when no longer needed; sessions and links by their security settings. "Expired records enter an owner review queue; they are not deleted automatically." Holds (complaints, warranties, disputes, claims, investigations, unfiled tax returns, legal or insurance holds) block deletion. The owner then withdrew a separate one-year contact-removal rule and asked for a Delete action with the confirmation "Are you sure you want to delete this entry?", Archive when deletion is blocked, early deletion with a reason, and Archive, Void or audited correction for protected evidence.
- Options considered: Keep all until professionals set periods; owner sets periods now (selected).
- Selected approach: The schedule as versioned configuration; a deletion-review queue with hold checks; the owner's Delete and Archive actions with the confirmation dialog; a deletion log without the deleted personal content. **HUMAN REVIEW:** CPA and attorney confirm the periods; longer legal, tax, insurance or contractual requirements override them.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Slice 3.2.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-71

**Customer account deletion separate from protected business records**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Privacy and data
- Context: **FACT:** Asked how deletion works when records must be kept, the owner wrote: "Delete the login account separately from the business records." The confirmation shows what is deleted, what is retained, why, and the review date; sign-in, sessions and project-access links are revoked; eligible personal data and preferences are deleted; invoices and payments (7 years), accepted estimates and authorizations (10 years) and incident records (10 years) are retained; "Do not rewrite signed approvals or issued financial documents to anonymize them"; holds block deletion but access can still be disabled; owner, time, reason and deleted and retained categories are recorded.
- Options considered: Delete account and keep required records minimal; delete everything; the owner's wording (selected).
- Selected approach: As the owner wrote (handyhub-app `docs/two-websites/owner-resolutions.md` R5).
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Slice 3.2; HH-PRIV-03 in part.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-72

**Privacy notice and website terms drafted now, marked "Draft - not reviewed by an attorney" on staging**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Legal content (drafts)
- Context: **FACT:** The owner wrote: "Draft the complete English privacy notice and website terms now. Put them on staging with "Draft - not reviewed by an attorney." Do not use empty "pending review" pages." Vendors are described only after verifying the implementation (Render, Cloudflare R2, ZITADEL, Telnyx, Resend, Square). Marketing consent and photo-publication permission stay separate. The terms reflect guest requests, optional accounts, estimates needing approval, separately confirmed appointments, approved scope changes and configured payment and deposit policies, with no minimum job charge and no invented cancellation fees, warranties, liability waivers or refund rules. An attorney review checklist accompanies the drafts. "Production release requires the reviewed pages, verified practices, and documented owner approval. Record the policy version presented with each request or acceptance."
- Options considered: Prepare the attorney packet with pending pages; drafts on staging (selected, extended); close the staging form.
- Selected approach: As the owner wrote. **HUMAN REVIEW:** attorney licensed in KY and/or IN before production (OWNER G).
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Slice 1.1; HH-PRIV-04.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-73

**Whole staging behind an access gate for the owner and authorized testers**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Release and environments
- Context: **FACT:** The owner wrote: "Restrict the entire staging environment to me and explicitly authorized testers using an access gate. Keep the forms enabled behind that gate. Protect submission APIs and file access too; hiding pages or removing public links is insufficient. Keep normal customer/staff authentication and permissions active inside staging. Let me test each role using separate test accounts. Use an isolated staging database, test records, sandbox payments, and test email/SMS destinations. No real charges or messages to customers. Keep staging separate from production. Allow only a minimal health-check endpoint to remain publicly reachable, with no private data. Exclude staging from search indexing as an additional measure. This replaces any earlier instruction to close the staging form."
- Options considered: Password gate on all of staging (selected, extended); close the staging form; keep staging public.
- Selected approach: An access gate in front of every staging route (site, staff app, APIs, files), configured only outside production, with the health check public; normal sign-in and permissions inside; test accounts per role; test-only message destinations.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Replaces the public part of [OWN-DEC-58](#OWN-DEC-58); slice 1.1.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-74

**AI features stay off (Wave 2)**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: AI governance
- Context: **FACT:** Asked about AI features, the owner chose "Keep AI off for now".
- Options considered: Keep AI off (selected); build guardrails now; approve AI now.
- Selected approach: The tested "AI disabled" state stays ([OWN-DEC-20](#OWN-DEC-20)); HH-AUTO-03 and HH-AUTO-04 wait for the owner's approval of plan 33 and a provider.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: None.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-75

**End-of-job walkthrough record; "customer unavailable" is never acceptance**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Field work and quality
- Context: **FACT:** The owner wrote: "Record the end-of-job walkthrough with the customer or their authorized representative. Outcomes: accepted, accepted with punch items, customer unavailable, or disputed. Record the participant, worker, timestamp, comments, and linked punch items. Customer unavailable is never treated as acceptance. Share the completion summary and approved photos through the secure project link so the customer can review them later. No response is not acceptance. Disputed work goes to the owner for review. Customer acceptance does not bypass required quality checks or close unresolved punch items. A signature is optional unless the approved service agreement requires it."
- Options considered: Record when present (selected, extended); no walkthrough record.
- Selected approach: As the owner wrote.
- Why: Owner decision.
- Tradeoffs: None recorded.
- Consequences: Slice 2.4; HH-QA-03.
- Review trigger: The owner's review of the slice that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (fifth to ninth question rounds on the two-websites guide); handyhub-app `docs/two-websites/owner-resolutions.md`

#### OWN-DEC-76

**Only the owner may waive a required deposit**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Pricing, estimating and finance
- Context: **FACT:** The owner chose: "Only me, the owner." (question: who may waive a required deposit on a job).
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: Only the owner, with a fresh sign-in and a written reason; every waiver is audited. Any other role, including other administrators, is refused.
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-FIN-02; T36; amends the waiver choice made while building slice 2.7 (administrator or the named reviewer).
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass

#### OWN-DEC-77

**Only the owner may reopen a closed job**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Field work and quality
- Context: **FACT:** The owner chose: "Only me, the owner." (question: who may reopen a job that was already closed to correct a mistake).
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: Reopening needs the owner, a fresh sign-in and a reason; the original record is kept and the change is audited.
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-QA-09.
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass

#### OWN-DEC-78

**Customer reminder cadence; every reminder is a staff-released draft**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Communications
- Context: **FACT:** The owner wrote: "Prepare these reminders as drafts for staff to review and release: Unanswered estimate: 3 days after sending, then one final follow-up after 7 days. Confirmed appointment: 24 hours before the visit, with preparation instructions. Completed job: 2 days after completion, ask whether everything is satisfactory. Repeat service: use a customer-agreed schedule for recurring cleaning or maintenance. Every message should offer a simple way to approve, ask questions, reschedule, or request another service. Stop estimate reminders after acceptance, decline, expiration, or a customer response. Cancel outdated appointment reminders. Hold promotional follow-ups during unresolved complaints, and respect communication preferences and marketing consent. Do not send automatically; staff release each draft."
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: As the owner wrote. The cadence is pre-filled as a PROPOSED reminder_cadence policy the owner activates in the app; repeat-service reminders use a staff-recorded, customer-agreed next-service date (recurring job series stay P1, HH-SCH-10).
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-COM-05; HH-SCH-02; T65; T67; keeps OWN-DEC-65 (staff release each email).
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass

#### OWN-DEC-79

**Spanish staff content translated and checked by AI; safety translations released as "AI-reviewed" after a separate comparison**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Field safety and operations; bilingual content
- Context: **FACT:** The owner first wrote: "Have the AI translate and check all Spanish staff content now. For safety procedures, compare it against the approved English version and check terminology, warnings, prohibited actions, PPE, measurements, step order, and stop-work conditions. Correct errors and flag ambiguous source instructions without inventing guidance." Then, asked who would approve the Spanish safety translations, the owner wrote: "Remove the mandatory bilingual human-review step. Have AI complete all Spanish translations and run a separate comparison against the approved English source. Check warnings, PPE, prohibited actions, measurements, step order, and stop-work conditions. Automatically release translations that pass, recording the source version, review date, and status 'AI-reviewed.' Do not label them human-reviewed or safety-certified. Flag failed checks or ambiguous instructions and keep only the affected procedure pending. Do not invent missing guidance or alter the approved procedure. Existing safety, legal, and job-start holds remain unchanged. Complete this workflow and its tests now."
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: As the owner wrote (the second answer governs). A Spanish safety version is released as "AI-reviewed" only on a recorded passing comparison against the current approved English version; failed or ambiguous checks keep that procedure pending and blocked for Spanish-reading workers; a new English version invalidates the release. A human review record can still be added later. English competent review and every safety, legal and Start Work hold are unchanged.
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-LANG-02; HH-LANG-04; HH-PKT-04; T45; T70. **RISK:** without a qualified human reviewer, a translation error in a safety procedure could reach a worker; mitigated by the separate comparison, the honest "AI-reviewed" label and per-procedure blocking on any failed check. Amends D-31-02 (human-reviewed safety translations) by owner decision.
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass

#### OWN-DEC-80

**Problems and emergencies found during a job**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Field work and safety
- Context: **FACT:** The owner wrote: "The worker may resolve a problem without waiting for the owner only when the fix is within their training, qualifications, approved scope, and approved SOP, with no unresolved safety hold. If resolved, record what happened, the steps taken, materials used, and how the result was checked. Add photos only when safe and notify the owner. If the problem is unsafe, uncertain, outside their authority, or cannot be resolved, stop affected work, keep people away, and call the owner. Perform only approved, safe stabilization steps within the worker's training. Suspected gas leaks require immediate evacuation and contacting emergency services/the gas utility from a safe location. Workers must not attempt gas repairs or handle exposed potentially live wiring. Emergency action must not wait for the owner."
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: As the owner wrote. Suspected gas leaks and exposed potentially live wiring create a critical hold in the same transaction and never offer a resolve-on-site option; stabilization records only the make-safe steps the approved SOP lists.
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-CHG-04; HH-WORK-08; HH-INC-01; T48; T54; the Start Job gate, stop-work rights and critical holds stay as strict or stricter.
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass

#### OWN-DEC-81

**After-job care instructions drafted by AI for all 26 services, shown only after owner approval**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Website and customer experience
- Context: **FACT:** The owner wrote: "Have AI draft after-job care instructions for all 26 services now. Use the actual products' manufacturer guidance where relevant; do not invent drying, curing, cleaning, or waiting times. Keep each draft PROPOSED until I approve it. Customers see only the approved version appropriate to their completed work and products. If product details are missing, flag them for review rather than guessing. Record the approved version and include it in the customer's completion summary."
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: As the owner wrote. Product-dependent lines are filled only from stored manufacturer guidance for the products used on the job; when missing they are omitted from the customer view and flagged to staff.
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-QA-05; T57.
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass

#### OWN-DEC-82

**No license, certification or training-tracking module at launch; a job-level Hold / Ready control instead**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Field work and safety; staff
- Context: **FACT:** The owner wrote: "Remove the dedicated license, certification, and training-tracking module from the launch scope. Do not build credential uploads, expiry reminders, or qualification dashboards. The owner will check applicable requirements outside the software. Keep a simple job-level 'Hold / Ready' control with a note for unresolved requirements. Required legal or safety conditions still need resolution before affected work starts."
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: As the owner wrote. The qualification and permit records built in slice 2.6 are hidden and no longer block (data kept, one documented switch); a job on Requirements Hold cannot be confirmed or started until cleared with a note.
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-EST-05; HH-WORK-02; HH-SCH-03; HH-SCH-04; HH-SCH-06; T40. Licensing stays a human-review boundary (CLAUDE.md rule 3): the owner checks requirements outside the software.
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass

#### OWN-DEC-83

**No tax line or automatic tax for now; half-up rounding per line**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Pricing, estimating and finance
- Context: **FACT:** The owner wrote: "For the current setup, do not add a separate tax line or automatically charge tax on estimates and invoices. Keep tax configuration disabled and show the approved final price clearly. Keep consistent half-up rounding to cents per line, with totals matching the displayed amounts. No hidden rounding charges. This is a software setting, not a determination that every service is tax-exempt. Any applicable tax treatment will be confirmed separately with the accountant."
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: As the owner wrote. A "Tax not charged (owner setting; accountant to confirm)" mode is pre-filled as PROPOSED for the owner to activate; customer documents never state or imply tax-exempt status.
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-DATA-02; HH-FIN-04; T58. Tax treatment stays a human-review boundary with the CPA (OWNER D).
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass

#### OWN-DEC-84

**Service page content drafted by AI for all 26 services; owner approves and publishes**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Website and customer experience
- Context: **FACT:** The owner wrote: "Draft content for all 26 services using the existing service files: A clear, short description of included work and key exclusions. Estimate approach: remote when sufficient details/photos are available; site visit when inspection or measurements are needed. Simple, service-specific preparation instructions for the customer. Use plain English and the existing premium website style. Do not invent prices, completion times, credentials, or guarantees. Never ask customers to perform hazardous preparation. Keep drafts PROPOSED until I approve each service. Provide one review screen where I can edit, approve, and publish them individually or in a selected batch. Approved edits must preserve version history."
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: As the owner wrote.
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-CUS-02; HH-SVC-01; HH-SVC-02; HH-BASE-04.
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass

#### OWN-DEC-85

**Accessibility testing and fixes by AI with the available tools; screen-reader and device checks recorded as unverified**

- Status: RECORDED owner decision
- Date: 2026-10-12
- Domain: Accessibility and quality
- Context: **FACT:** The owner wrote: "Have the AI complete accessibility testing and fixes before launch using automated scans and available browser tools. Test keyboard navigation, focus, forms/errors, dialogs, mobile layouts, large text, contrast, and accessible names across customer and staff workflows. Fix issues, rerun checks, and record actual results. Do not mark keyboard/browser testing as screen-reader testing unless a real screen reader was used. Complete every check the available tools support. Record unsupported screen-reader or physical-device checks as unverified, with the remaining limitation clearly stated. Do not claim full accessibility conformance from automated checks alone."
- Options considered: As offered in the project chat; the owner's answer above.
- Selected approach: As the owner wrote.
- Why: Owner decision.
- Tradeoffs: None recorded beyond the RISK lines.
- Consequences: HH-A11Y-01; HH-A11Y-02; HH-A11Y-03; T69. **RISK:** screen-reader and physical-device behaviour stays unverified until a person tests it.
- Review trigger: The owner's review of the pull request that builds it.
- Approver: Owner (recorded)
- Blocks: neither (in force)
- Source: project chat, 2026-10-12 (owner questions after the launch coverage check); handyhub-app branches feat/launch-owner-decisions, feat/launch-spanish-review, feat/launch-field-decisions, feat/launch-care-tax, feat/launch-service-text, feat/launch-a11y-pass
