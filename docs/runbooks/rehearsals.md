# Rehearsals: what actually ran

A record of the rehearsals of `release.md` and `restore.md`, exactly as run. Nothing here happened on Render, on staging or on any database holding real data. Add a new section for every rehearsal; never edit an old one.

## 2026-10-22: local release and restore rehearsal (TSK-0106, TSK-0111)

- **Where:** a Claude Code cloud container, PostgreSQL 16.14 on `127.0.0.1`, Node 24. Disposable databases `hx0106_rehearsal` and `hx0106_rehearsal_restored`, created for the run and dropped at its end. No real data: the database held only what the migrations seed (configuration, services, templates). No provider was configured (no message was sent anywhere).
- **Releases:** PREV `fdc0f95` (migrations up to 0073), MAIN `dd1cca1` (adds `0074_start_work_gate.sql`), NEW branch `task/TSK-0106` (no new migration), each built in its own worktree with `pnpm --filter '@handyhub/server...' run build` (NEW with `pnpm build`).
- **How each release was started:** as the Dockerfile does, `node packages/db/dist/cli/migrate.js && exec node apps/server/dist/main.js`, with `HANDYHUB_ENV=staging`, a synthetic `ACCESS_GATE_USERS` tester and `PORT=5031`.

| Step | What ran | Result |
| --- | --- | --- |
| 1. Deploy PREV | migrate + start; `curl /healthz`, `/readyz` with and without the gate login, `/robots.txt`, `/api/v1/staff/auth/session` | Started. healthz 200; readyz 401 without login, 200 `{"database":"ok","migrations":"ok"}` with it; robots `Disallow: /`; staff session 401. Latest migrations 0070, 0071, 0073 |
| 2. Backup before the deploy | `pg_dump --format=custom`; `restore.js fingerprint` | Dump 842,158 bytes; fingerprint of 127 tables |
| 3. Deploy MAIN | migrate (applies 0074) + start; same probes | Started; same answers; latest migrations 0071, 0073, 0074 |
| 4. Deploy NEW | migrate (nothing to apply) + start; same probes | Started; same answers |
| 5. Routine rollback NEW → MAIN | MAIN started against the same database | Started and ready (code-only rollback works) |
| 6. Rollback past a migration MAIN → PREV | PREV's migrate against the database at 0074 | Refused: `MigrationError: Applied migration 0074_start_work_gate.sql is missing from the migrations folder`; the server never started (correct forward instead) |
| 7. Isolated restore | `createdb` + `pg_restore --exit-on-error` of the step 2 dump; `restore.js check --compare <step 2 fingerprint>` | Restore ok. Check exit 1: `migrations pending 0074_start_work_gate.sql` (the backup predates 0074), 0 differences from the backup's fingerprint. After `migrate.js` (applied 0074): check exit 0, `migrations`, `constraints_validated`, `sequences_ahead`, `append_only_triggers` all true |
| 8. Replay | `restore.js export --since <1 hour before>` on the live database, `restore.js reapply` on the restored one | Export exit 0 (0 deletions, 0 withdrawals: none had happened); reapply exit 0 with nothing to apply |
| 9. Clean up | `DROP DATABASE ... WITH (FORCE)` | Both databases dropped |

What this rehearsal did **not** cover: Render itself (deploy, rollback button, point-in-time recovery, the shell), the custom domains and certificates, real providers, the nightly R2 backup (not built), and a restore with deletions and STOPs to replay (that is the automated rehearsal below).

## Automated restore rehearsal (CI, every pull request)
`apps/server/test/integration/restore-rehearsal.test.ts` runs in the `test` job against PostgreSQL 16 (it needs the PostgreSQL 16 client tools `pg_dump` and `pg_restore` on the runner, or `PG_BIN_DIR`): fresh test data with customers, projects, estimate versions, photos, visits, payments and customer questions; fingerprint and `pg_dump`; after the backup a confirmed deletion, a STOP and a new request; the replay export; `pg_restore` into an empty database; integrity checks and no difference from the backup's fingerprint (relationships included); the missing-data list against the source; before the replay the deleted estimate is back and the STOP is lost; the replay re-applies both; a second replay changes nothing.

## Automated outage drills (CI, every pull request)
`apps/server/test/integration/outages.test.ts`: Resend refusing connections and never answering, Bird refusing connections and coming back between attempts, R2 refusing connections during upload and processing, and the database refusing connections (see `outages.md` for what each shows).
