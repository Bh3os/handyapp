---
id: OQ-PERF-BUDGET-DETAILS
type: question
title: The performance budgets and measurement details HH-NFR-01 does not give
status: open
area: platform
links:
  related: ["[[HH-NFR-01]]", "[[OWN-DEC-59]]", "[[OWN-DEC-25]]", "[[INT-Render]]", "[[TSK-0105]]", "[[HH-PKT-01]]", "[[HH-CUS-01]]"]
source: "TSK-0105 (2026-10-26): HH-NFR-01 gives the targets; the details below are PROPOSED or NOT CONFIGURED. Results: docs/perf/README.md"
---
**Question:** does the Owner approve or change these PROPOSED details of the performance measurement, and set the budgets that are NOT CONFIGURED?

- **Who answers:** the Owner; Claude may answer the purely technical ones.
- **Decided, in use:**
  - The budgets come from [[HH-NFR-01]]. They are engineering targets of the guide, configured values under [[OWN-DEC-59]], and never customer promises.
  - Staff key reads must have p95 ≤ 800 ms. Core writes must have p95 ≤ 1.5 s.
  - Pages have LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1 as field p75 targets. A lab result is never reported as field.
  - All of these are written once, in `docs/perf/budgets.json`. CI enforces the two API budgets on a small fixed dataset.
- **PROPOSED, in use:**
  - **Dataset mix.** For N jobs (10,000 at full size): N/10 open requests and N/10 estimates waiting for the customer; deposits recorded on half the jobs; N/10 booked visits.
    - The booked visits fill the next four weeks at three visits a day for each of 12 workers.
    - Everything is made through the server's own routes (the staging fresh-data steps) with fictional contacts.
    - No past visits, started or completed jobs, invoices or time stamps: the routes cannot create those for synthetic data yet.
  - **Users.** The 20 concurrent active users are 1 Owner, 4 Office, 3 Estimators and 12 workers, each reading their role's screens.
  - **Load.** Every client runs a closed loop with no think time, so the load is an upper bound.
    - Phase A: staff key reads, 5 rounds.
    - Phase B: four write lanes (submission, acceptance, plan and confirm a visit, Start Work), with 16 staff still reading.
    - Phase C: 20 customers read their project overview.
    - Phase D: the Owner runs the exports.
    - The percentile is nearest-rank. Each budget is judged on the phase it applies to.
  - **Key reads** are the action queue, Owner Decisions, the schedule board (day and week), the customer list and search, the request list and summary, the customer record, the job packet, the Owner Dashboard and its records, My Day and My job packets.
  - **Start Work** is measured on the dataset's future visits. That measures the gate evaluation and its recorded refusal, not a passing start.
  - **CI check.** 24 jobs; both API budgets enforced. A key read may not run more than 2 extra statements when the data doubles.
  - **Page lab.** Chromium with Lighthouse's default mobile and desktop throttling and an empty cache, median of 3 loads. The pages are `/`, `/services`, one service page, `/request`, `/areas`, `/account` and `/portal/`. A local gzip proxy stands in for the compression of Render's load balancer.
- **NOT CONFIGURED (measured and reported, never enforced, until the Owner sets a number):**
  - **Portal overview API p95.** Measured 23 ms. PROPOSED: the staff key-read budget, 800 ms.
  - **Export p95.** Measured 143 ms at most. PROPOSED: 5 s.
  - **Bundle limits** (gzip). PROPOSED: site JS 200 KB, portal JS 200 KB, staff JS 600 KB, largest site first visit 400 KB. These are about 25% above the 2026-10-26 build.
- **Findings waiting for a decision:**
  - **My job packets** still brings every assigned job's packet up to date before listing ([[HH-PKT-01]]). It now does this for all the jobs at once (26 statements, p95 263 ms at 10,000 jobs), so it is within budget. Listing the last generated version and refreshing a packet only when it is opened would be a behaviour change; it is not built and stays the Owner's call.
  - **Layout shift on `/services`** (lab CLS 0.52 on mobile): the list of published services is read when the page runs, so a draft is never listed ([[HH-CUS-01]]). PROPOSED: the server writes the published list into the page when it serves it.
  - **Layout shift on `/account`** (lab CLS 0.15 on mobile): the page is drawn by its script. PROPOSED: reserve the space.
  - **The staff app is one 530 KB gzip script, and both staff catalogs are in it.** PROPOSED: load only the signed-in person's language, and split by route.
  - **Customer search** does a full `%text%` scan (19 ms at 12,000 customers). PROPOSED: a trigram index once search passes 100 ms on its own.
  - **Run the official Lighthouse** in addition to the lab script. It could not be downloaded in the build environment.
  - **Measure on representative staging**, as HH-NFR-01 asks. Staging is Render's free plan ([[OWN-DEC-25]], [[INT-Render]]), and the dataset would replace the Owner's test data, so this is the Owner's call.
- **Until answered:** the PROPOSED details are used. NOT CONFIGURED budgets are only reported. Nothing customer-facing states any speed.
