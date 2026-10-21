---
id: HH-OPS-05
type: requirement
title: "Staging-only Reset Test Data in the Owner Dashboard"
status: active
priority: P0
area: ops
links:
  decided_by: ["[[OWN-DEC-191]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-AuditEvent]]", "[[ENT-StaffUser]]", "[[ENT-Message]]"]
  part_of: ["[[S11]]"]
source: "OWN-DEC-191 (new behaviour; no guide id)"
---
- Owner Dashboard → Staging Tools → Test Data Management shows "Reset Test Data" and "Reset & Create Fresh Test Data" with a visible STAGING / TEST MODE indication.
- Only an authenticated Owner may use them, checked on the server; the feature runs only when the environment is positively identified as staging or an isolated test environment, refuses otherwise, never exists in production (no route, no endpoint), and cannot reach production databases, storage, payment accounts or messaging.
- Reset removes test customers (except designated reusable test accounts), requests, estimates and revisions, appointment windows and bookings, jobs, assignments and visits, change orders, invoices, payments, deposits and receipts, conversations and notifications, attachments, photos and generated documents, pending messages and scheduled reminders, test sessions and project links, and test-only workflow records. It preserves the Owner and reusable test accounts, roles and permissions, the service catalog and descriptions, pricing and service-area configuration, SOPs, hazards, tools and safety guidance, message templates, application settings, schemas and migrations.
- Before running: a dialog explains what will be deleted, shows the record counts and requires typing RESET TEST DATA. Concurrent resets are refused; partial failures are reported; repeated resets are safe.
- Fresh data is clearly labelled fictional (guest and registered customers, requests, estimates awaiting approval and approved, estimate visits, confirmed work visits, jobs in progress and completed, change orders, test invoices and payments, conversations, project history), with sandbox payments and test destinations only.
- Afterwards: cleanup, preserved configuration, integrity and relationships are verified, no obsolete reminder can send, reusable accounts still work, and a summary with any errors shows in the Owner Dashboard. Every reset is recorded in a protected staging audit trail.
