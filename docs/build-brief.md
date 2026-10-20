# Brief for build agents (one task = one pull request)

1. **Load your task**
   - Run `node tools/kg.mjs ctx TSK-<n>`. Build exactly what the task and its linked nodes say.
   - For a linked node you need in detail, run `node tools/kg.mjs show <id>`.
   - Read `sources/` only for a section a node cites.
2. **Reusing old code**
   - The old repo `Bh3os/handyhub-app` is checked out at `/home/user/handyhub-app` (branch main). It holds proven code for most features, on the same stack.
   - You may copy and adapt code from it when it matches the graph. The graph wins on every difference.
   - Never copy: ZITADEL, Telnyx, Stripe, price-book activation, the $150 minimum, or settings-activation steps.
3. **Branch and commits**
   - Work in your own git worktree on the branch `task/TSK-<n>`, created from `origin/main` (`git fetch origin && git worktree add -b task/TSK-<n> /home/user/hx-<n> origin/main`).
   - Commit messages name the task and the HH-/T ids, and end with:
     `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
     `Claude-Session: https://claude.ai/code/session_01EVqSLgnUH5GuXYR9SoT99h`
   - Run gitleaks on the staged changes before each commit.
4. **Checks before you push:** run the fast local checks for what you changed:
   - lint, typecheck, unit tests and integration tests of the changed packages;
   - e2e only if the task touches UI flows.

   The full suite runs in GitHub CI.
5. **Finish the task**
   - In the task node set `status: done`, then run `node tools/kg.mjs lint`.
   - Push the branch. Don't open or merge pull requests: the coordinator does.
6. **Report:** what was built, its tests, the commit ids, and any PROPOSED choice or missing fact you hit.

Environment:
- `export PATH=/opt/node24/bin:$PATH`;
- PostgreSQL 16 local: `pg_ctlcluster 16 main start` if down; `postgres://postgres:postgres@127.0.0.1:5432/postgres`;
- `E2E_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` (never run `playwright install`);
- the machine has 4 cores shared with other agents, so avoid long local suites.
