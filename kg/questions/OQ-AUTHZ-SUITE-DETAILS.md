---
id: OQ-AUTHZ-SUITE-DETAILS
type: question
title: How the server reads the matrix's limited cells, as the authorization suite pins them
status: open
area: security
links:
  related: ["[[TSK-0108]]", "[[ROLE-MATRIX]]", "[[HH-TEST-02]]", "[[HH-STAFF-04]]", "[[HH-ARC-03]]", "[[OQ-ORGANIZATION-ACCOUNTS-DETAILS]]", "[[OQ-WORKER-ACCESS-DETAILS]]", "[[RULE-SERVER-AUTHZ]]"]
source: "TSK-0108 (2026-10-26): ROLE-MATRIX and the policy data decide every cell; the readings below are PROPOSED and pinned by the suite"
---
**Question:** does the owner approve, or change, these PROPOSED readings of the permission matrix that the authorization suite now holds the server to?

- **Who answers:** the owner.
- **Decided, in use:** every route is decided by the one policy point from [[ROLE-MATRIX]]; a customer or guest outside their scope gets the same NOT_FOUND as a missing record, kept as a security event ([[T19]]); fresh sign-in and a written reason where a cell says F ([[T64]]).
- **PROPOSED, built:**
  - A caller of a kind the route never serves, and a staff member none of whose roles has any rule for the route's action, is refused before the route reads its input or any record (UNAUTHENTICATED without a staff session; FORBIDDEN for a staff role and for the disabled AI module), so a Worker asking for an Owner-only record learns nothing about whether it exists. Customers and guests keep the record-level NOT_FOUND above.
  - Worker "A site facts only" (View customer and property records): the site facts come with the assigned job's packet; the full customer and property record routes refuse the Worker.
  - Worker "A, balance on jobs with collect (P)" (View balances and payments): the balance comes with the on-site collection view of an assigned job, with the collect grant; the full deposit, invoice and adjustment views refuse the Worker.
  - Estimator "estimating scope (P)" (View job packet): a job's field photos are outside it.
  - The previews of a customer merge and of a request relink open only for who may make that change.
  - An organization member reads a project's privacy requests and its repeat-service schedule nowhere: both stay the project customer's own ([[OQ-ORGANIZATION-ACCOUNTS-DETAILS]]); selecting estimate options needs the approve privilege.
- **Until answered:** the readings above stay as built; each is a small change to the route that applies it, and the suite's list of narrowed routes (`apps/server/test/integration/authz-records.test.ts`).
