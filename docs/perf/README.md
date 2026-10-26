# Performance budgets: measured lab results (TSK-0105)

This report covers [HH-NFR-01](../../kg/requirements/HH-NFR-01.md). Every number here is a **lab result** from
synthetic data on the machine named below. None of it is field data, and none of it is a promise to customers.
HH-NFR-01 says nothing customer-facing advertises speed. The PROPOSED parts of the method are listed in
[OQ-PERF-BUDGET-DETAILS](../../kg/questions/OQ-PERF-BUDGET-DETAILS.md).

## The budgets

[`budgets.json`](budgets.json) is the one place the budgets are written. CI and the measurement script both read it.

| Budget | Value | Source | Enforced |
| --- | --- | --- | --- |
| Staff key reads, p95 | 800 ms | HH-NFR-01 (an engineering target of the guide, a configured value under OWN-DEC-59) | CI, small dataset |
| Core writes, p95 | 1.5 s | HH-NFR-01 | CI, small dataset |
| Public and customer pages: LCP, INP, CLS at field p75 | 2.5 s, 200 ms, 0.1 | HH-NFR-01 | No. These are field targets; lab results are only a proxy |
| Portal overview API, p95 | NOT CONFIGURED | HH-NFR-01 sets page targets, not an API latency | Measured, reported |
| Exports, p95 | NOT CONFIGURED | HH-NFR-01 does not name exports | Measured, reported |
| Bundle and page-weight limits | NOT CONFIGURED | HH-NFR-01 gives no number | Measured, reported in every CI run |

When the Owner decides a NOT CONFIGURED value, it goes into `budgets.json`. From then on CI enforces it.

## How it is measured

- **Dataset** (`apps/server/test/perf/dataset.ts`). The records are made through the server's own routes, using the
  same steps as the staging fresh test data. Fictional guests submit requests; staff qualify them and publish online
  estimates; fictional customers approve them. Deposits are recorded as cash, and work visits are planned and
  confirmed. So every job has the request, project, customer, property, estimate, approval, deposit requirement, queue
  items, outbox events and audit trail a real job has. Contacts are fictional: the names say "TEST DATA (fictional)",
  the email domain is reserved for tests, and the phone numbers are in the 555-0100 to 555-0199 range.
  - **Full size: 10,000 jobs** (HH-NFR-01).
  - PROPOSED mix: 1,000 open requests, 1,000 estimates waiting for the customer, deposits recorded on half the jobs,
    and 1,000 booked visits. The visits fill the next four weeks at three a day for each of 12 workers.
  - Resulting rows: 12,000 customers, contacts, properties, projects and requests; 11,000 estimates; 10,000 approvals
    and jobs; 1,000 visits; 5,000 payments; 34,000 queue items; 88,000 audit events; 50,000 outbox events.
  - Generation took about 3 to 4 minutes.
- **Load** (`apps/server/test/perf/load.ts`). Requests go over real HTTP on loopback to the listening server. The
  server uses its production pool: 10 connections and the connection-wait limit. Each client runs a closed loop with no
  think time. PROPOSED: 20 staff signed in at once (1 Owner, 4 Office, 3 Estimators, 12 workers). Each person runs the
  reads of their role. The measurement has four phases:
  - **A, staff key reads.** The 20 staff each run their role's reads five times. The reads are: action queue, Owner
    Decisions, schedule board (day and week), customer list and search, request list and summary, customer record,
    job packet, Owner Dashboard and its records, My Day, and My job packets.
  - **B, core writes under load.** Four write lanes run while 16 staff keep reading, 40 operations per lane. The writes
    are: request submission, estimate acceptance (approval), scheduling (plan, then confirm a visit), and Start Work.
  - **C, portal.** 20 fictional customers read their project overview.
  - **D, exports.** The Owner runs the dashboard CSV and the accounting exports (invoices, payments, visit timestamps)
    three times each.
- **Statements per request**: the number of SQL statements the server ran for one read on its own.
- **Pages** (`apps/e2e/lab/page-vitals.mjs`). Pages load in Chromium with an empty cache. Throttling uses
  Lighthouse's default values, applied through the DevTools protocol. Mobile is 4× CPU, 150 ms RTT and 1.6 Mbps down.
  Desktop is 40 ms RTT and 10 Mbps. Each page loads three times and the median is reported.
  - Lighthouse itself was not run: downloading it was not permitted in this environment. Running it is listed in the
    OQ node.
  - INP needs real interactions, so it stays a field metric and is not measured here.
- **Bundles** (`tools/perf-bundles.mjs`). Measures what each build ships, and what a first visit to each page
  downloads.

## Results: 10,000 jobs (2026-10-26)

**Machine:** a shared developer Mac (Apple M4, 10 cores, 16 GB) with PostgreSQL 16.15 on the same machine. Other
agents' integration and e2e suites were running at the same time: the load average was 4.5 to 9 before the run and
6 to 8 after it. Absolute numbers on Render's free plan will differ. Raw results:
[`results/2026-10-26-10000-jobs.json`](results/2026-10-26-10000-jobs.json).

| Group | Samples | p95 | Budget | State |
| --- | --- | --- | --- | --- |
| Staff key reads (phase A) | 480 | 1,088 ms | 800 ms | **over** |
| Core writes (phase B) | 160 | 159 ms | 1,500 ms | within |
| Portal overview (phase C) | 300 | 24 ms | NOT CONFIGURED | — |
| Exports (phase D) | 12 | 144 ms | NOT CONFIGURED | — |

**The real capability.** Staff key reads miss the 800 ms target at 10,000 jobs, and **My job packets** alone causes
it. That read runs 1,769 statements for a worker with 83 upcoming assignments: p50 990 ms, p95 2.8 s, and 3.4 s while
writes run. Every other key read has a p95 at or under 481 ms (the Owner Dashboard). Core writes are an order of
magnitude inside their budget.

Phase A (staff key reads):

| Operation | p50 | p95 | Statements |
| --- | --- | --- | --- |
| Action queue | 43 ms | 174 ms | 6 |
| Owner Decisions | 8 ms | 65 ms | 5 |
| Schedule board, day | 86 ms | 150 ms | 22 |
| Schedule board, week | 153 ms | 275 ms | 22 |
| Customer search | 147 ms | 298 ms | 10 |
| Customer list | 33 ms | 89 ms | 10 |
| Customer record | 78 ms | 173 ms | 28 |
| Request list | 25 ms | 72 ms | 6 |
| Request summary | 18 ms | 41 ms | 7 |
| Job packet | 56 ms | 105 ms | 36 |
| Owner Dashboard (30 days) | 320 ms | 481 ms | 44 |
| Dashboard records | 369 ms | 388 ms | 44 |
| My Day | 12 ms | 56 ms | 7 |
| My job packets | 990 ms | 2,770 ms | 1,769 |

Phase B (core writes, with 16 staff reading at the same time):

| Operation | p50 | p95 | Answer |
| --- | --- | --- | --- |
| Request submission (guest) | 38 ms | 101 ms | 201 |
| Estimate acceptance | 51 ms | 117 ms | 201 |
| Plan a visit | 84 ms | 191 ms | 201 |
| Confirm a visit | 98 ms | 162 ms | 200 |
| Start Work | 35 ms | 137 ms | 409 (see below) |

The Start Work number measures the full gate evaluation under the visit's and job's row locks, and its recorded
refusal. A passing start needs a briefing, a packet acknowledgment and site checks on the visit's own day; the
dataset's visits are all on future days. Phase C (portal overview): p50 17 ms, p95 24 ms, 23 statements. Phase D
(exports, 365 days): dashboard CSV 144 ms, accounting payments 25 ms, invoices 3 ms, visit timestamps 4 ms. The last
two had no rows: the dataset has no invoices and no time stamps.

### Hot spots found and fixed (separate commits, each with a test)

1. **Schedule board, N+1.** The board ran four statements per confirmed visit to build its cancellation previews: the
   work markers, the job, the deposit requirement and its payments. At 1,000 jobs that was 163 statements for a day and
   739 for a week, with a week p95 of 1.16 s.
   - Fix: these are now read for all visits at once (`cancellationFactsOf`), with the same rules.
   - Result: 22 statements whatever the number of visits. At 10,000 jobs the week p95 is 275 ms.
   - CI test: no key read may run more statements when the data doubles. Against the old board this test reports
     `schedule_day: 49 -> 94`.
2. **Missing index on `work.work_packages.job_id`** (migration 0134). The job packet, its loadout pins and its SOP pins
   scanned every work package. They were the three most expensive statements of the read load, at 2.8 ms each.
   - With the index they take 0.8 ms each.
   - Staff key reads p95 at 10,000 jobs went from 1,565 ms to 1,088 ms (raw results:
     [`results/2026-10-26-10000-jobs-before-0134.json`](results/2026-10-26-10000-jobs-before-0134.json)).

### Found and not fixed (proposals in OQ-PERF-BUDGET-DETAILS)

- **My job packets runs about 21 statements per assigned job.** Before listing them, the route brings each assigned
  job's packet up to date: it pins loadouts, composes the packet, and compares it with the latest version. This is
  the remaining reason staff reads miss the budget at 10,000 jobs.
  - It is exempt from the CI N+1 check, and the exemption is named in the test.
  - The fix would change how packets are composed (several jobs at once) or what the list shows (the last generated
    version, refreshed when a packet opens). Either is a design change, so it is PROPOSED.
- **Customer search** is a `%text%` match across every customer and contact: 19 ms on its own at 12,000 customers.
  It stays well inside the budget. A trigram index is PROPOSED for when the customer count grows.
- **Public site layout shift.** CLS is 0.52 on mobile and 0.27 on desktop on `/services`, and 0.15 on mobile on
  `/account`. The services list is read when the page runs, so a draft is never listed, and the cards then grow into
  place. The account page is drawn by its script. A fix that keeps drafts unlisted is PROPOSED.
- **The staff app ships a single 2.2 MB script (530 KB gzip).** About 930 KB of it (raw) is the English and Spanish
  staff catalogs together, plus 112 KB of the customer catalog. Loading only the signed-in person's language, and
  splitting by route, is PROPOSED.
- **Source maps are in the portal and staff builds** (`*.js.map`) and are served with them. Whether to keep them is
  for the security review.

## Pages (lab, 2026-10-26)

Pages are served by the built server on loopback. The main columns are measured behind a local gzip proxy, because
Render's load balancers compress every response with Brotli or gzip
([Render docs](https://render.com/docs/native-runtimes)) and the server itself does not. The "without" columns show
the server alone. Raw results: [`results/2026-10-26-lab-pages.json`](results/2026-10-26-lab-pages.json) and
[`results/2026-10-26-lab-pages-uncompressed.json`](results/2026-10-26-lab-pages-uncompressed.json). The machine is the
same shared Mac; TBT read 0 ms on every page.

| Profile | Page | LCP | CLS | FCP | Transfer | LCP without compression | Transfer without |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mobile | `/` | 484 ms | 0.001 | 484 ms | 325 KB | 592 ms | 604 KB |
| mobile | `/services` | 524 ms | **0.516** | 524 ms | 210 KB | 616 ms | 242 KB |
| mobile | `/services/interior-painting` | 532 ms | 0.000 | 532 ms | 212 KB | 608 ms | 247 KB |
| mobile | `/request` | 2,276 ms | 0.022 | 456 ms | 366 KB | 4,396 ms | 738 KB |
| mobile | `/areas` | 492 ms | 0.001 | 492 ms | 325 KB | 596 ms | 614 KB |
| mobile | `/account` | 2,088 ms | **0.152** | 468 ms | 328 KB | 3,840 ms | 631 KB |
| mobile | `/portal/` | 1,436 ms | 0.001 | 1,228 ms | 325 KB | 3,480 ms | 732 KB |
| desktop | `/` | 164 ms | 0.002 | 156 ms | 325 KB | 184 ms | 604 KB |
| desktop | `/services` | 172 ms | **0.270** | 172 ms | 210 KB | 176 ms | 242 KB |
| desktop | `/services/interior-painting` | 168 ms | 0.001 | 168 ms | 212 KB | 180 ms | 247 KB |
| desktop | `/request` | 508 ms | 0.007 | 148 ms | 366 KB | 868 ms | 738 KB |
| desktop | `/areas` | 156 ms | 0.000 | 156 ms | 325 KB | 172 ms | 614 KB |
| desktop | `/account` | 484 ms | 0.052 | 148 ms | 328 KB | 784 ms | 631 KB |
| desktop | `/portal/` | 352 ms | 0.000 | 288 ms | 325 KB | 676 ms | 732 KB |

**Compared with the field targets, used here only as a lab proxy:**

- With compression, every page's lab LCP is under 2.5 s.
- Without compression, the mobile LCP of `/request`, `/account` and `/portal/` is over 2.5 s. Those pages depend on
  the compression Render applies.
- CLS is over 0.1 on `/services` and on mobile `/account`.

None of this is field data. Field measurement needs consent- and privacy-appropriate collection (HH-NFR-01), and
that is not built.

## Bundles (2026-10-26 build)

Raw results: [`results/2026-10-26-bundles.json`](results/2026-10-26-bundles.json).

| App | JS raw | JS gzip | CSS gzip | Heaviest first visit (gzip, fonts included) |
| --- | --- | --- | --- | --- |
| Public site | 512 KB (all pages) | 146 KB | 6.5 KB | `/request`, 302 KB (JS 138 KB, fonts 157 KB) |
| Portal | 534 KB | 143 KB | 4.7 KB | 305 KB |
| Staff app | 2,164 KB | 530 KB | 6.3 KB | 692 KB |

The site has no hero images and no map; the two web fonts (157 KB) are the largest part of a first visit to a simple
page.

## Running it

```sh
# CI (every pull request): small fixed dataset, the decided budgets and the N+1 check
pnpm --filter @handyhub/server exec vitest run test/integration/performance-budgets.test.ts

# The large measurement (writes docs/perf/results/<date>-<jobs>-jobs.json); about 5 minutes for 10,000 jobs
TEST_DATABASE_URL=postgres://… PERF_JOBS=10000 PERF_NOTE="machine and what else ran" pnpm --filter @handyhub/server perf
#   PERF_ROUNDS (5), PERF_WRITES (40 per lane), PERF_LANES (6 generation lanes), PERF_KEEP_DB=1 keeps the database

# Bundles and page weight (after pnpm build; CI writes it to the e2e job summary)
node tools/perf-bundles.mjs [--json docs/perf/results/<date>-bundles.json]

# Pages (after pnpm build, with the built server running on a free port, e.g. as the e2e config starts it)
cd apps/e2e && LAB_COMPRESS=1 node lab/page-vitals.mjs http://127.0.0.1:<port> ../../docs/perf/results/<date>-lab-pages.json
```

Run the large measurement on a quiet machine, or on a staging-like host, and name the machine in `PERF_NOTE`. The
measurement on representative staging that HH-NFR-01 asks for has not been done: staging is Render's free plan
([OWN-DEC-25](../../kg/decisions/OWN-DEC-25.md)), and loading 10,000 synthetic jobs into it would replace the Owner's
test data. That run stays an Owner decision.
