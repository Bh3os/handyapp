# Building the knowledge graph (brief for the build agents)

Read `kg/README.md` first: it defines the node format, types, edges, statuses and areas. Then look at the example nodes in `kg/rules/` and `kg/decisions/`.

## Ownership: only write in your own folders
| Agent | Writes | Sources |
| --- | --- | --- |
| R1 platform requirements | `requirements/` for HH-ARC, BASE, STATE, API, DATA, AUD, SEC, NFR, A11Y, TEST, LANG, OPS, AUTO | guide sections 1-4, 18-29 |
| R2 customer/intake/staff requirements | `requirements/` for HH-LEAD, SVC, INT, ID, PORT, CUS, COM, CRM, STAFF | guide sections 3-12 |
| R3 work/money requirements, tests, entities, roles | `requirements/` for HH-EST, SCH, PKT, WORK, OFF, QA, CHG, INC, FIN, PRIV, plus `acceptance/` T01-T75, `entities/` and `roles/` | guide sections 13-27; vault plans 05, 06, 27 |
| D1 decisions 01-85 | `decisions/` OWN-DEC-01..85 | `sources/vault-own-decisions.md`, `two-websites-owner-resolutions.md` |
| D2 decisions 86-128, journeys, facts, questions | `decisions/` OWN-DEC-86..128, plus `journeys/`, `facts/`, `questions/` | `sources/owner-answers-verbatim.md`, `decision-briefs.md`, `decisions-94-128-summary.md` |
| B business | `services/`, `sops/` and business `facts/` named FACT-SVC-*, FACT-PRICING-*, FACT-INVENTORY-*, FACT-AGREEMENT-* | `sources/vault/`, guide 6.2 |

The coordinator writes rules, OWN-DEC-129/130, `architecture/`, `integrations/` and `tasks/`.

## Fixed IDs to link to, even before the target node exists
- Requirements: the HH-XXX-NN ids used in the guide. Acceptance tests: `T01`..`T75`.
- Decisions: `OWN-DEC-01`..`OWN-DEC-130`, two-digit padding below 100: `OWN-DEC-07`, `OWN-DEC-64`, `OWN-DEC-104`.
- Customer journey:
  - `C01` finding a service
  - `C02` request form
  - `C03` receipt and verification
  - `C04` HandyHub questions and visit
  - `C05` estimate, approval and deposit
  - `C06` project workspace
  - `C07` appointment
  - `C08` during work and change orders
  - `C09` completion and handoff
  - `C10` invoice and payment
  - `C11` afterwards
- Staff journey:
  - `S00` sign-in
  - `S01` action queue
  - `S02` new request
  - `S03` customer and property records
  - `S04` estimates and publishing
  - `S05` scheduling board
  - `S06` inbox
  - `S07` My Day and offline
  - `S08` configuration
  - `S09` staff management and audit
  - `S10` cases
  - `S11` owner dashboard
- Services: `SVC-HI-01`..`SVC-HI-11`, `SVC-DW-01`..`SVC-DW-04`, `SVC-PT-01`..`SVC-PT-04`, `SVC-CL-01`..`SVC-CL-07`. Each SOP is `SOP-<same code>`.
- Integrations:
  - `INT-Bird` (SMS and phone number, [[OWN-DEC-129]])
  - `INT-Resend` (email)
  - `INT-Square` (payment links and Tap to Pay, recorded manually)
  - `INT-R2` (photo and document storage)
  - `INT-Render` (hosting)
- Roles: `ROLE-OWNER`, `ROLE-OFFICE`, `ROLE-ESTIMATOR`, `ROLE-WORKER`, `ROLE-CUSTOMER`, `ROLE-GUEST`, and `ROLE-MATRIX` (the permission matrix).
- Entities: `ENT-<Name>` in PascalCase, for example `ENT-Customer`, `ENT-Property`, `ENT-Project`, `ENT-Request`, `ENT-Estimate`, `ENT-EstimateVersion`, `ENT-Approval`, `ENT-Job`, `ENT-Visit`, `ENT-ChangeOrder`, `ENT-Invoice`, `ENT-Payment`, `ENT-Message`, `ENT-Photo`, `ENT-Document`, `ENT-Case`, `ENT-Hold`, `ENT-AuditEvent`, `ENT-StaffUser`, `ENT-PolicyVersion`.
- Rules: the `RULE-*` nodes in `kg/rules/`.
- Facts:
  - D2 owns the operating facts: `FACT-HOURS`, `FACT-TIMEZONE`, `FACT-RESPONSE-TARGET`, `FACT-DEPOSIT-RULE`, `FACT-ESTIMATE-VALIDITY`, `FACT-TAX-NO-LINE`, `FACT-NO-MINIMUM`, `FACT-NO-SURCHARGE`, `FACT-PAYMENT-DUE`, `FACT-PAYMENT-METHODS`, `FACT-PAYMENT-INSTRUCTIONS`, `FACT-BUSINESS-NAME`, `FACT-BUSINESS-ADDRESS`, `FACT-PUBLIC-CONTACT`, `FACT-AUTOMATIC-MESSAGES`, `FACT-REMINDER-CADENCES`, `FACT-REOPEN-PERIOD`, `FACT-VISIT-FEE`, `FACT-RETENTION-SCHEDULE`, `FACT-SERVICE-AREA`, `FACT-BRAND-IDENTITY`.
  - B owns the `FACT-SVC-*`, `FACT-PRICING-*`, `FACT-INVENTORY-*` and `FACT-AGREEMENT-*` facts.
  - Any other fact you need: link to it and list it in your final report.

## Content rules
1. **Decisions:** keep the owner's wording verbatim. Then add "Effect:" bullets saying what the software must do, and links: `supersedes`, the requirements it changes as `related`, and the facts it sets as `uses`.
2. **Requirements:** state the behaviour as it holds after every later decision. Where a decision changed the guide, the requirement says the new behaviour and links `decided_by` to that decision. Never keep superseded behaviour as current. Include every condition, error state and edge case from the source; leave nothing out, but don't repeat other nodes.
3. **Superseded decisions:** keep their text, set `status: superseded`, and add `superseded_by` (for example, Telnyx → [[OWN-DEC-129]], ZITADEL → [[OWN-DEC-114]], 3/7-day reminder cadences for unanswered questions → [[OWN-DEC-101]], for unpaid invoices → [[OWN-DEC-112]], for estimates → [[OWN-DEC-132]], price-book requirement → [[OWN-DEC-102]], activation steps → [[OWN-DEC-122]], $150 minimum → [[OWN-DEC-102]], no minimum).
4. **Facts:** each fact node holds one value with its decision link; unknown values have `status: open`.
5. **Language and size:** plain, precise English. Don't start a node by restating its title. Write each fact once and link to it from everywhere else.
6. **Checks before you finish:** run `node tools/kg.mjs lint`. Every problem must be fixed, except links to nodes owned by another agent (list those in your report).

## Git
- Work in your own worktree on the branch `kg/<agent>` (for example `kg/r1`), created from `origin/main`. Commit and push after every ~30 nodes, so a usage limit never loses work.
- Never push to main and never open pull requests: the coordinator merges.
- End every commit message with:
  - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_01EVqSLgnUH5GuXYR9SoT99h`
- Final report: the node counts per type, the links to nodes owned by other agents, and any facts or questions you found missing.
