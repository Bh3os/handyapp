---
id: HH-API-05
type: requirement
title: Bounded cursor pagination, role filters, no dump endpoints, private caching and an index plan
status: active
priority: P0
area: platform
links:
  depends_on: ["[[HH-API-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  tested_by: ["[[T68]]", "[[T26]]"]
source: "guide 24.4, 22.3"
---
- Lists use a bounded page size with a stable sort and an opaque cursor, and apply the caller's role and record-scope filters before paging.
- There is no unrestricted dump or "export everything" endpoint; exports are separate, permissioned and audited ([[HH-SEC-06]]).
- Private endpoints default to `Cache-Control: private, no-store` (or the stack's equivalent). Any cache key includes the identity and scope it was built for. Every cache documents its key scope, invalidation and expiry, and is tested for cross-customer leakage.
- Indexes (guide 22.3): project/customer/property relationship lookups, role-scoped assignments, visit resource and time conflicts, current estimate revisions, unpaid invoices, queue owner/status/due date, messages by project and time, outbox and webhook receipt uniqueness, and attachment ownership. Broad lists and media are paginated. Query plans are profiled with realistic data before adding caches or a search service.
