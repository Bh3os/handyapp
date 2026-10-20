# HandyApp

Rebuild of HandyHub's two websites: the public site with the customer portal, and the staff app. One pnpm monorepo on
Node 24, served by one Fastify server.

## For agents

- Start every piece of work from the graph: `node tools/kg.mjs ctx <TSK-id>`. Read `CLAUDE.md` and
  `docs/build-brief.md` first.
- Never commit secrets, personal data or `.env` files. Test data is synthetic; secret-looking test values are built at
  runtime.

## Layout

| Path              | What                                                         |
| ----------------- | ------------------------------------------------------------ |
| `apps/server`     | Fastify server: API and host for the site and both apps      |
| `apps/site`       | Public website (Astro, static HTML)                          |
| `apps/portal`     | Customer portal (React + Vite)                               |
| `apps/staff`      | Staff app (React + Vite)                                     |
| `apps/e2e`        | Playwright end-to-end tests with axe scans                   |
| `packages/money`  | Integer-cents money                                          |
| `packages/policy` | Authorization decisions                                      |
| `packages/i18n`   | ICU message catalogs                                         |
| `packages/domain` | State machines                                               |
| `packages/db`     | PostgreSQL access and migrations                             |
| `packages/ui`     | Design system                                                |
| `kg/`, `tools/`   | Knowledge graph and its query tool; `tools/trace.mjs` report |

Workspace packages export their TypeScript source under the `@handyhub/source` condition (used by `tsc`, Vitest and
Vite) and their built `dist/` otherwise (used by the built server).

## Commands

```sh
pnpm install
pnpm lint        # ESLint and Prettier
pnpm typecheck   # strict TypeScript in every package
pnpm test        # unit tests (Vitest) and the tools tests
pnpm test:int    # integration tests; needs TEST_DATABASE_URL pointing at PostgreSQL 16
pnpm db:migrate  # apply pending packages/db/migrations to DATABASE_URL (forward-only, checksummed)
pnpm db:types    # regenerate packages/db/src/schema.ts from the migrations (uses TEST_DATABASE_URL)
pnpm db:seed     # synthetic records; HANDYHUB_ENV must be local, ci or staging (refused in production)
pnpm build       # build every package and app
pnpm e2e         # Playwright against the built server (run pnpm build first)
pnpm kg          # graph index and lint
pnpm trace       # requirement-to-evidence report in reports/
```

Locally, `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres`; CI uses the `postgres:16` service
as `handyhub`. Each integration test file calls `createTestDatabase()` from `@handyhub/db/testing` and gets its own
database cloned from a migrated template (`hh_tpl_<migrations hash>`); a new migration file needs a new
`NNNN_name.sql`, never an edit to an applied one, followed by `pnpm db:types`.

CI (`.github/workflows/ci.yml`) runs the required checks `secrets`, `test` and `e2e`, plus `kg`.
