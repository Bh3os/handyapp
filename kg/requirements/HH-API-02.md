---
id: HH-API-02
type: requirement
title: Semantic operation contracts for both websites, with the sample request and approval contracts
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-63]]", "[[OWN-DEC-67]]", "[[OWN-DEC-102]]", "[[OWN-DEC-103]]", "[[OWN-DEC-110]]", "[[OWN-DEC-114]]", "[[OWN-DEC-120]]", "[[OWN-DEC-121]]", "[[OWN-DEC-125]]", "[[OWN-DEC-129]]"]
  depends_on: ["[[HH-API-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-MONEY-CENTS]]"]
  uses: ["[[INT-Bird]]", "[[INT-Resend]]", "[[INT-Square]]", "[[INT-R2]]"]
  tested_by: ["[[T11]]", "[[T17]]", "[[T33]]"]
source: "guide 24.1-24.3; OWN-DEC ids as linked"
---
The operations below are semantic contracts. Paths are proposals; what matters is one domain handler per operation, shared by every client.

| Operation | Proposed endpoint | Critical rules and returned data |
| --- | --- | --- |
| Active services | `GET /api/v1/services` | Public English fields only; no internal rates or eligibility detail |
| Coverage check | `POST /api/v1/coverage/check` | General location; outcome and reason; never a capacity, price or booking claim |
| Create draft | `POST /api/v1/request-drafts` | Expiring draft capability; quotas; no access to old records |
| Issue upload | `POST /api/v1/uploads` | Authorized draft or project owner; MIME, size and visibility checks; private object key |
| Finalize upload | `POST /api/v1/uploads/{id}/complete` | Validate object, hash and state; processing result |
| Submit request | `POST /api/v1/requests` | Idempotency; canonical IDs; durable receipt; generic contact response |
| Send verification | `POST /api/v1/access/challenges` | Rate limits; no enumeration; intended contact and grant |
| Verify/exchange | `POST /api/v1/access/exchange` | Single use, expiry- and attempt-bound, creates a project session; no side effects on GET |
| Account enrollment | `POST /api/v1/customer/accounts` | Verified identity by one-time code ([[OWN-DEC-63]]) and explicit consent; safe record links |
| Account project list | `GET /api/v1/customer/projects` | Account-owned, scoped results only |
| Project view | `GET /api/v1/projects/{id}` | Account or project-grant authorization; customer field projection |
| Project messages | `GET/POST /api/v1/projects/{id}/messages` | Audience and attachment validation; idempotent send |
| Estimate review | `GET /api/v1/estimates/{id}/revisions/{revision}` | Authorized project; current, superseded or expired information |
| Approve estimate | `POST /api/v1/estimates/{id}/acceptances` | Exact revision, options, total and terms version; fresh verification; transaction and job dedupe ([[OWN-DEC-103]]) |
| Ask estimate change | `POST /api/v1/estimates/{id}/change-requests` | No direct editing of an accepted revision |
| Request reschedule or cancellation | `POST /api/v1/visits/{id}/reschedule-requests` | Current authorized visit; a request only, the confirmed visit stays until staff confirm |
| Invoice view | `GET /api/v1/invoices/{id}` | Customer or finance scope; correct allocation and pending state |
| Staff sign-in, sign-out, password reset, MFA enrolment | staff auth routes | Email and password, optional TOTP, rate limits, generic errors ([[OWN-DEC-114]]) |
| Staff intake | `GET /api/v1/staff/requests` | Role-scoped filtering and pagination; restricted fields masked |
| Qualify request | `POST /api/v1/staff/requests/{id}/qualification` | Policy, evidence, reason, version |
| Draft/revise estimate | `POST /api/v1/staff/estimates/{id}/revisions` | Written or uploaded estimate ([[OWN-DEC-102]]); exact totals; prior history immutable |
| Publish estimate | `POST /api/v1/staff/estimates/{id}/publish` | Pre-publish validation, publish permission, notification outbox |
| Confirm visit | `POST /api/v1/staff/visits/{id}/confirm` | Capacity and eligibility lock, version, unique assignments |
| Reassign/reschedule | `POST /api/v1/staff/visits/{id}/changes` | Current version, reason, reservations and access update |
| Job packet | `GET /api/v1/staff/jobs/{id}/packet` | Assigned-role projection; access secret excluded |
| Reveal access secret | `POST /api/v1/staff/visits/{id}/access/reveal` | Assigned worker, visit date, online check ([[OWN-DEC-121]]); audited; not cacheable |
| Readiness | `GET /api/v1/staff/jobs/{id}/readiness` | Current gates, version and missing items |
| Start/pause/resume | `POST /api/v1/staff/jobs/{id}/actions` | Explicit allowed action; assignment, version and gates; no arbitrary status |
| Stop/report issue | `POST /api/v1/staff/jobs/{id}/issues` | Task and hold semantics, restricted evidence, outbox escalation |
| Sync field events | `POST /api/v1/staff/jobs/{id}/field-events` | UUID dedupe, identity and assignment recheck, safe conflict handling |
| Propose change | `POST /api/v1/staff/jobs/{id}/change-orders` | Proposal only unless an authorized review/issue operation |
| Accept change | `POST /api/v1/change-orders/{id}/acceptances` | Verified customer, exact issued revision; packet refreshed |
| Submit completion | `POST /api/v1/staff/jobs/{id}/completion-submissions` | Required evidence, QA state; never an automatic final close |
| Review QA | `POST /api/v1/staff/jobs/{id}/qa-reviews` | Reviewer permission, results and punch items; failures never deleted |
| Issue invoice | `POST /api/v1/staff/invoices/{id}/issue` | Approved scope and deltas, balances, quality review passed; staff-entered Square link validated ([[OWN-DEC-110]]) |
| Record payment | `POST /api/v1/staff/payments` | Collection permission, exact amount in cents, method, reference (Square payment ID for cards), collector, receipt and reconciliation |
| Reconcile/correct | `POST /api/v1/staff/payments/{id}/actions` | Specific privilege, action and reason; source evidence immutable |
| Unified inbox | staff inbox routes | Linking, Needs Linking, reply via permitted channel, drafts ([[OWN-DEC-120]]) |
| Provider callbacks | `POST /api/v1/webhooks/{provider}` | Bird (inbound texts, delivery status) and Resend (inbound email, delivery status) only ([[OWN-DEC-129]]); raw-body signature verification per the provider's current documentation; unique event receipt; replay window; size limits; bounded handling |
| Reports/export | `GET/POST /api/v1/staff/reports/...` | Role and field scope, fresh authentication for sensitive bulk export, audit; CSV totals match the dashboard ([[OWN-DEC-125]]) |

No in-software payment session or Square webhook exists: Square is not integrated ([[OWN-DEC-67]]).

Sample request contract (synthetic values; service IDs and schemas come from the registry):

```json
{
  "serviceIds": ["existing-service-id"],
  "description": "Patch the damaged wall in the hallway.",
  "serviceAnswers": {
    "damageCount": 1,
    "approximateWidth": { "value": 12, "unit": "inch", "source": "customer_report" },
    "moistureCauseKnown": "unknown"
  },
  "location": { "postalCode": "40208", "state": "KY" },
  "visitPreferences": ["mornings", "weekends"],
  "estimatePreference": "let_handyhub_decide",
  "contact": { "name": "Example Customer", "email": "customer@example.invalid" },
  "attachmentIds": [],
  "privacyNoticeVersion": "configured-current-version"
}
```

The request form's full field set (address, property type, phone, timing, contact preference, marketing permission) is in the intake requirements. An accepted request response contains the committed request and project reference, `received` status, the verification-required state, an attachment processing summary and English next-step text. It never contains earlier projects, private historical customer data, a computed final price or a confirmed appointment.

Sample approval contract:

```json
{
  "estimateRevisionId": "authorized-published-revision-id",
  "expectedVersion": 3,
  "selectedOptionIds": [],
  "expectedTotalMinor": 42500,
  "currency": "USD",
  "agreementVersionId": "reviewed-agreement-version-id"
}
```

`expectedTotalMinor` is the total the customer saw, never an authorized input price. The server recalculates the published options, compares, checks access and freshness, and commits acceptance, job and outbox in one transaction. It rejects an altered total, an expired or superseded revision and IDs from another project. A retry returns the same logical acceptance and job reference.
