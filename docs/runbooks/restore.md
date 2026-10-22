# Restore runbook: isolated restore, integrity checks, replay, controlled resume

Source of truth: HH-NFR-03 ("Restore needed: isolated restore, integrity checks, deletion and suppression replay, provider reconciliation, controlled resume"), T72, HH-PRIV-03 ("deletions and suppressions are re-applied after any backup restore"), HH-NFR-01 (recovery targets are proposals, not promises), OWN-DEC-185 (production hosting). Built by TSK-0106.

A restore is a disaster procedure, never a routine rollback: restoring an older backup over live data loses every request, approval and payment recorded since. For a bad release, see `release.md` (roll back the code, or correct forward).

## What exists and what does not

| Item | State |
| --- | --- |
| Staging database | Render free PostgreSQL `handyhub-staging-db` (render.yaml). Synthetic data only. The current database expires **2026-11-21** (coordinator, 2026-10-22; the graph's 2026-11-03 was the earlier database's date). OWNER ITEM: whether the free plan keeps any backup is not recorded here; treat staging as having none. Its data is recreated with Reset & Create Fresh Test Data. |
| Production database | Not created. Decided (OWN-DEC-185): the smallest paid Render PostgreSQL with point-in-time recovery, created only when the owner approves phase 2. The recovery window ("3 days on the Hobby workspace") and the prices are ESTIMATES not rechecked on Render: OWNER ITEM, confirm on Render before buying. |
| Nightly logical backup to R2 | Decided (OWN-DEC-185) but NOT BUILT. Until it is, a logical backup is a manual `pg_dump` (below). Remaining deficiency before phase 2. |
| Photos and documents (R2) | Not in the database backup. Object versioning is NOT CONFIGURED. A restore brings back rows; their objects must still exist in R2. |
| Restore tooling | `apps/server/dist/cli/restore.js` (`export`, `fingerprint`, `check`, `reapply`) and `apps/server/dist/cli/deletions.js`. Run where `DATABASE_URL` and `HANDYHUB_ENV` are set (the Render shell of the service, or a trusted machine). |
| Rehearsal | Automated in CI against a real `pg_dump` (`apps/server/test/integration/restore-rehearsal.test.ts`), and once by hand on a disposable local database (`rehearsals.md`). **Never rehearsed on Render.** System health keeps showing the restore drill as `unknown`. |

## Keep outside the backups
The deletion log and the consent withdrawals recorded after a backup are lost with it. Re-applying them needs a copy kept elsewhere:

```sh
node apps/server/dist/cli/restore.js export --since <ISO time of the oldest backup you might restore> > replay-<date>.json
```

- PROPOSED cadence: after every session of retention or privacy deletions, and at least weekly, the owner keeps the latest file in private storage. When the damaged database is still readable, the export is taken from it at restore time instead (the best case: nothing is missed).
- The file holds deletion references (no deleted content) and the destinations of consent withdrawals (email addresses and phone numbers: personal data). Keep it as privately as a backup; delete old files once a newer one exists.
- RISK: deletions and STOPs recorded after the last export, on a database that is lost, cannot be replayed. Mitigation: point-in-time recovery to just before the failure (little to replay), and the cadence above.

## Manual logical backup (until the nightly R2 backup exists)
From a trusted machine with PostgreSQL 16 client tools and the database's external connection string (owner; never committed, never pasted in chat):

```sh
pg_dump --format=custom --no-password --file=handyhub-<env>-<UTC time>.dump --dbname="$DATABASE_URL"
node apps/server/dist/cli/restore.js fingerprint > handyhub-<env>-<UTC time>.fingerprint.json   # same DATABASE_URL
```

Keep both files together. A production dump holds real customer data: store it encrypted and private (RULE-SYNTHETIC-DATA: never restore it into staging or a laptop test database).

## Restore procedure
Roles: the owner performs every Render action; Claude may run the CLI steps in a shell the owner opens, and prepares the report. Record the time of each step.

1. **Decide and pause.** The owner decides a restore is needed. Pause writes: suspend the web service in Render, or stop it from taking traffic. Note the time of the failure and the backup or point in time to restore.
2. **Export from the damaged database** (if it still answers):
   - `restore.js export --since <restore point minus 1 hour> > replay.json` (an overlap is harmless: entries already in the restored database report `absent` or `present`);
   - `restore.js fingerprint > damaged.json`.
3. **Isolated restore.** Restore into a **new, empty** database, never over the live one:
   - point-in-time recovery in Render creates a new database (exact steps: Render's documentation for the plan in use; OWNER ITEM to confirm once production exists); or
   - `createdb` / a new Render database, then `pg_restore --exit-on-error --no-password --dbname="$NEW_URL" <file>.dump`.
4. **Integrity checks** on the new database: `restore.js check --compare damaged.json`
   - `ok: true` needs: the migration ledger matches the release's migrations (a backup from before a migration reports `pending <file>`: deploying the release migrates it forward, as rehearsed), every constraint validated, every sequence ahead of its column, the append-only triggers present;
   - `differences` against the damaged database is the **missing data**: every table whose rows or content differ. Save the output with the report. Compare with the backup's own fingerprint (`--compare <backup>.fingerprint.json`) to prove the restore itself lost nothing (expected: no differences).
5. **Replay deletions and suppressions**: `restore.js reapply replay.json --operator <name>`. Each deletion prints `reapplied`, `absent` (already gone) or `blocked` (something in the restored data now protects it: the owner reviews it again in Retention reviews); each withdrawal prints `reapplied`, `present` or `already_withdrawn`. Run it a second time to confirm nothing changes. PROPOSED: only withdrawals are replayed, never an opt-in; a person who opted in again after the backup opts in again.
6. **Things the replay does not cover** (check by hand against the damaged database or the audit log export):
   - staff disabled, password or MFA resets, and role changes after the backup: disable or reset again in Staff management before anyone signs in;
   - customer sessions and access links issued after the backup do not exist in the restored data (customers request a new link: safe);
   - requests, approvals, visits and payments after the backup (the missing data): re-enter from the customer's own receipts, the providers' records and Square, each through the normal screens, never by editing the database.
7. **Provider reconciliation.** The restored database may hold messages and jobs as still pending that already ran after the backup:
   - point the service at the new database with `JOB_WORKER=off` first (no automatic message or job runs);
   - compare pending jobs and deliveries (System health → jobs and deliveries) with Resend's and Bird's dashboards and with Square; cancel or resolve what already happened;
   - stored files: objects uploaded after the backup have no rows (harmless, they stay private); rows whose objects were erased after the backup are removed by the deletion replay, and their erasure jobs run once the worker is on.
8. **Controlled resume.** Set `DATABASE_URL` to the new database, keep `JOB_WORKER=off`, deploy, check `/healthz` and `/readyz`, sign in as the owner, check System health and the queue; then set `JOB_WORKER=on`. Resume public traffic last.
9. **Report.** Times, the backup used, the check output, the missing-data list, the replay output, what was re-entered by hand, and anything still open. Keep the old database until the owner confirms the report; then remove it in Render.

## Proposed recovery targets
HH-NFR-01 lists RPO ≤ 15 minutes and RTO ≤ 4 hours for core records "if the infrastructure supports it": PROPOSED targets, not measured and never promised. OWN-DEC-185 ESTIMATE: minutes of data loss inside the point-in-time window, otherwise up to a day from a nightly backup, restore by hand within hours. Not a guarantee.
