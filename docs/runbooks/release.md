# Release runbook: deploy, migrate, verify, roll back

Source of truth: HH-NFR-03 (release and rollback, guide 29.2 and 29.3), OWN-DEC-22 and OWN-DEC-191 (production and every launch phase only on the owner's explicit approval), OWN-DEC-212 (merge checks beyond CI; passing CI alone is not production readiness), OWN-DEC-185 (production hosting), INT-Render, render.yaml, Dockerfile. Built by TSK-0111. Rehearsed once on a disposable local database: `rehearsals.md` (not on Render).

**Production releases stay with the owner.** Claude prepares, tests, merges to `main` (which deploys staging once TSK-0112 is done) and writes the release record; only the owner creates production, approves a launch phase or presses deploy on production. Owner constraint, verbatim: "Do not invite real customers or launch publicly until I explicitly authorize the appropriate release stage."

## How a deploy works (FACT)
- One Render web service built from the `Dockerfile`. The container starts with `node packages/db/dist/cli/migrate.js && exec node apps/server/dist/main.js`: pending migrations are applied first, then the server starts. A refused migration plan stops the container before the server listens.
- Migrations are forward-only numbered SQL files (`packages/db/migrations`), each in its own transaction, with checksums. The run refuses before applying anything when an applied file changed, an applied file is missing (older code against a newer database), or a new file is numbered below the latest applied one.
- Render polls `/healthz` (liveness, no database). `/readyz` (behind the staging gate) reports `database` and `migrations`.
- Staging (render.yaml): `handyhub-staging`, `autoDeployTrigger: commit`, `HANDYHUB_ENV=staging`, `STAGING_TOOLS=on`, the access gate required. Pointing it at this repository is TSK-0112 (todo): until then nothing in render.yaml has been applied to Render, and the steps below that depend on staging cannot be run yet.
- Production: not created. PROPOSED: a separate Render service and database with automatic deploys off, so each production deploy is the owner's manual action. Production refuses `ACCESS_GATE_USERS`, `STAGING_TOOLS`, `EMAIL_PROVIDER=log` and provider fakes; it records the production mark on its database at every start and refuses to start if it cannot.

## 1. Before a release
- [ ] Required CI checks green on the pull request: `secrets`, `test` (lint, typecheck, unit, integration), `e2e`; `kg` (graph lint, traceability).
- [ ] OWN-DEC-212 merge checks: security and migration effects reviewed; interactions with merged features tested; no duplicate messaging, conflicting rule versions or incompatible database changes; the change matches the final owner decisions; integration tests rerun after related branches merged.
- [ ] The release record (below) is filled in, including the rollback constraint.
- [ ] A release with a migration: a backup exists from just before the deploy (production: confirm point-in-time recovery is on and take a manual `pg_dump`, `restore.md`); the migration was applied to a copy first (the CI template database and a disposable restore of the latest backup).

## 2. Deploy
- **Staging:** merge the pull request into `main`; Render builds and deploys the commit (after TSK-0112). Watch the deploy log until the server listens.
- **Production (owner only, after the phase approval):** in Render, deploy the exact commit that passed staging. Never a commit staging has not run.

## 3. Migrate
Nothing to run by hand: the container migrates at start. The deploy log shows the applied files. If the log shows `MigrationError`, the server did not start and the previous deploy keeps serving only if Render kept it running; go to section 5.

## 4. Verify (smoke checks)
Run in this order, and write the results in the release record:
1. `GET /healthz` → `200 {"status":"ok"}`.
2. `GET /readyz` with a gate login (staging) → `200`, `database: ok`, `migrations: ok`. Without the login → `401` (staging stays private).
3. `GET /robots.txt` on staging → `User-agent: *` / `Disallow: /`. Every staging response carries `X-Robots-Tag: noindex`.
4. Owner sign-in to the staff app with MFA; **System health**: no failed jobs, every provider in the state expected for this environment (NOT CONFIGURED is truthful, not a failure), queue age normal.
5. The public request form loads; on staging submit one request with a test address from `TEST_EMAIL_DESTINATIONS` and check the receipt page and the staff queue item.
6. For the release's own feature: its acceptance steps (from the pull request).
7. Production only, additionally: the domains `handyhub247.com` and `staff.handyhub247.com` answer with valid certificates, each with its own host-only cookies; no debug tools, sample credentials, test staff, fake reviews or seed records are reachable.

## 5. Roll back
Decide by what the release changed:

| The release... | Do this | Rehearsed |
| --- | --- | --- |
| changed code only (no new migration) | Redeploy the previous good commit in Render. It starts against the same schema. | Yes, `rehearsals.md` step 5 |
| added a migration | **Do not** redeploy older code: its migration run refuses ("Applied migration ... is missing from the migrations folder") and the server never starts. Correct forward: disable the broken action while keeping read access (a configuration or policy change, or a small fix), then release the fix. | Yes, step 6 (refusal) |
| broke an automation (messages, reminders, jobs) | Set `JOB_WORKER=off` in Render and redeploy: the site and staff app keep working, nothing automatic runs. Reconcile external effects (provider dashboards, Square) before turning it back on; then `JOB_WORKER=on`. | No (switch exists in config) |
| damaged data | `restore.md`, never as a routine rollback. | Automated in CI and locally; never on Render |

Never: drop new finance tables, restore an older backup over live transactions, or edit the database by hand to undo a release. Accepted and paid records created after the release stay.

## Release record (copy into the pull request or the release note)
```
Release: <date, UTC time>            Environment: staging | production
Commit: <sha>                        Previous commit: <sha>
Schema: latest migration <NNNN_name> (new in this release: <files or none>)
Configuration changed: <variables, policy versions, feature switches; or none>
Migrations / backfills: <done | in progress | none>
Providers and templates affected: <Resend, Bird, R2, Square, templates; or none>
Smoke checks: healthz <>, readyz <>, robots <>, owner sign-in <>, system health <>, request form <>, feature <>
Rollback constraint: code-only, redeploy <sha> | has a migration: correct forward only
Approved by (production only): <owner, date>
```

## Staging database expiry
The free staging database expires **2026-11-21** (coordinator, 2026-10-22). OWNER ITEM before that date: create the replacement (a new free database or a paid one) and update `DATABASE_URL`; Render appends a new 4-character suffix to the database name, which Staging Tools accept (`handyhub_staging_db_<4 letters or digits>`). The data is synthetic: recreate it with Reset & Create Fresh Test Data. If the replacement's name does not follow that pattern, Reset Test Data refuses to run until render.yaml and the pattern are updated.
