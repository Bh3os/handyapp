---
id: HH-OPS-06
type: requirement
title: "Owner Acceptance Testing before invited production; explicit approval for each launch phase"
status: active
priority: P0
area: ops
links:
  decided_by: ["[[OWN-DEC-191]]", "[[OWN-DEC-181]]"]
  depends_on: ["[[HH-OPS-05]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[INT-Render]]", "[[ENT-StaffUser]]", "[[ENT-CustomerAccount]]"]
  part_of: ["[[S11]]"]
source: "OWN-DEC-191 (new behaviour; no guide id)"
---
- Phase 1 runs on protected staging with test accounts for Customer, Guest Customer, Staff (Worker), Estimator, Office and Owner (credentials handed to the Owner privately, never in the repository), a realistic test journey from request to project history, an Owner Acceptance Testing checklist with direct links, expected outcomes and instructions, and a direct way for the Owner to report issues.
- Real customers, public submissions, real payments, real customer data and uncontrolled email or text are impossible in phase 1.
- Phase 2 (only after the Owner's explicit approval): production with invitation-only customer access, public submissions and search indexing off, monitoring of requests, messages, scheduling, approvals, invoices and payments, and no Reset Test Data.
- Phase 3 (only after the Owner's explicit approval of phase 2): public form, indexing, SEO and service-area pages on; domain, TLS, sign-in, forms and notifications verified; production texting only after A2P 10DLC approval.
- Each phase switch is a configuration change the Owner approves and that is audited; manual accessibility tests stay UNVERIFIED; the readiness report separates critical blockers from optional improvements.
