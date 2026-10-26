---
id: FACT-MARGIN-TARGET
type: fact
title: "Target gross margin per job: 30% (advisory)"
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-189]]"]
source: "OWN-DEC-189; owner answers 2026-10-21 R10-Q4"
---
**Value:** 30% (3000 basis points), configurable by the Owner; an advisory flag, never a block.

- Gross margin = (net job revenue − direct job costs) / net job revenue × 100, computed from integer cents ([[RULE-MONEY-CENTS]]).
- A job below the target is flagged on the Owner Dashboard; incomplete cost data is shown as incomplete, never as a final margin.
- A provisional management target, not an industry benchmark; the CPA may refine the definitions ([[OQ-TAX-CPA]] packet, [[OWN-DEC-186]]).

**In use (TSK-0131, 2026-10-26):** configuration key `job_margin.target` (`{"targetBps": 3000}`, migration 0116), the Owner changes it with a fresh sign-in and a reason; a job is flagged only when its margin is final ([[OQ-JOB-MARGIN-DETAILS]]).
