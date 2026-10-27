---
id: OQ-TRACEABILITY-DETAILS
type: question
title: The traceability and Definition of Done details no decision gives
status: open
area: platform
links:
  related: ["[[HH-TEST-01]]", "[[HH-AUD-02]]", "[[HH-AUD-03]]", "[[HH-AUD-04]]", "[[HH-API-02]]", "[[HH-BASE-05]]", "[[TSK-0110]]", "[[T60]]"]
source: "TSK-0110 (2026-10-26): HH-TEST-01 and HH-AUD-04 ask for a generated, CI-checked traceability report with stated limitations; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of how traceability and the Definition of Done are checked?

- **Who answers:** the owner.
- **PROPOSED, in use:**
  - **Evidence.** A test counts for a requirement when its describe/it/test title names the requirement, or names an acceptance test the requirement is `tested_by`. Its layer comes from where the file lives: unit, integration (server API and PostgreSQL), ui (site, portal, staff app) or e2e. Passing is decided by the `test` and `e2e` jobs of the same CI run; the report does not run tests.
  - **Limitations.** A requirement or acceptance node states each limitation as one paragraph `**Limitation (<reason>; reviewer: <who>):** <text>`, with one of the four reasons of [[HH-TEST-01]] (owner input, owner decision, process requirement, real gap) and the person who must act. A limitation never counts as evidence, and a limited item is never called complete.
  - **Strict check** (`node tools/trace.mjs --strict`, in the CI `kg` job): every P0 requirement and every acceptance test has evidence or a valid limitation; every id a done task implements is named by a test title; every operational document (SOP, fact, service) whose text marks an OPEN QUESTION, CONFLICT or UNSOURCED value links to a question node ([[HH-AUD-02]]); `docs/traceability-report.md` equals the generated one. The baseline-failure rules of [[HH-AUD-03]] stay as they were.
  - **The committed report** holds no test line numbers or test counts, so it changes only with the graph or the layers of a requirement's evidence; `node tools/trace.mjs --write-doc` regenerates it. The full list of titles and lines is the CI artifact.
  - **Contract review** ([[HH-API-02]]): each operation of the table maps to the routes that implement it, and the rules a route contract can show are checked (actors, reads, idempotency keys, expected versions, rate limits, audit, fresh sign-in, the customer's fresh verification, online only). Readings: "Finalize upload" is the same request as the upload (the server validates the bytes on receipt); "Readiness" is the Start Work gate read; "Accept change" includes the staff capture of an in-person approval; "Reports/export" are the Owner Dashboard, its CSV and the accountant's export.
  - **A customer's payment claim** ([[T60]]): with no "I paid" action, the claim is a project message, and the conversation's "customer replied" item is the staff item that verifies it.
- **Until answered:** the PROPOSED details above are used.
