---
id: ARCH-STACK
type: architecture
title: Technology stack for the rebuild
status: active
area: platform
links:
  decided_by: ["[[OWN-DEC-130]]", "[[OWN-DEC-133]]"]
  uses: ["[[INT-Render]]", "[[INT-Bird]]", "[[INT-Resend]]", "[[INT-R2]]", "[[INT-Square]]", "[[FACT-DOMAIN]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]"]
source: "OWN-DEC-130 (owner delegated the choice to Claude); OWN-DEC-133 (domains); experience from Bh3os/handyhub-app"
---
The owner asked for the most efficient stack. Claude chose it to need the fewest moving parts and one deploy, and so the proven code from the old repo can be reused.

- **Language:** TypeScript everywhere, Node 24 LTS, pnpm workspace (monorepo).
- **Server:** Fastify, with JSON-schema validation and an OpenAPI contract generated from the routes. Kysely gives type-safe SQL, with plain numbered `.sql` migrations. PostgreSQL 16.
- **Public website:** Astro, rendered to static HTML for speed and SEO, served by the same server. The request form is a small island.
- **Staff app and customer portal:** React with Vite, two single-page apps served by the same server with separate sessions. The public site and the customer portal answer on `handyhub247.com`; the staff app answers on `staff.handyhub247.com` ([[OWN-DEC-133]], [[FACT-DOMAIN]]). The server routes by host, and each host sets its own host-only cookies, so no cross-origin API exists ([[HH-ARC-07]]).
- **Shared packages:**
  - `policy` (the one place authorization decisions are made);
  - `i18n` (ICU message catalogs: English customer-facing, English and Spanish staff);
  - `money` (integer-cents calculations);
  - `domain` (state machines).
- **Background work:** a Postgres-backed job queue (outbox pattern) inside the same service, for message sending, reminders and retention reviews. No extra infrastructure.
- **Files:** Cloudflare R2 through the S3 API, private buckets, signed URLs ([[INT-R2]]).
- **Messages:** Bird for SMS and the phone number ([[INT-Bird]]); Resend for email ([[INT-Resend]]).
- **Payments:** Square payment links entered by staff and Tap to Pay, both recorded manually; no payment API ([[INT-Square]]).
- **Tests:** Vitest for unit tests and integration tests (each run against a fresh database); Playwright for end-to-end tests, including axe accessibility scans.
- **CI:** GitHub Actions with jobs for secrets (gitleaks), test (lint, typecheck, unit, integration) and e2e.
- **Hosting:** one Render web service plus Render PostgreSQL, with both domains attached to it as custom domains. The existing `handyhub-staging` service is reused ([[INT-Render]]); until the domains are set up it serves the staff app under `/staff` on its own host.

Rejected:
- Next.js full-stack: more rewrite of proven code, and it couples the static public site to server rendering.
- Separate services per site: more deploys and cost for no benefit at this scale.
