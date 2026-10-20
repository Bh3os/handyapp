---
id: HH-AUD-01
type: requirement
title: Inspect the graph and the frozen source material before building; keep secrets out
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-130]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "guide 2.1; OWN-DEC-130"
---
Before changing code, an agent inspects what governs the change:
- the repository instructions (`CLAUDE.md`, `AGENTS.md` if present), README, manifests and lockfiles, routes, schemas and migrations, identity and session code, server permissions, pricing logic, tests, deployment configuration, approved content and the existing design components of `Bh3os/handyapp`;
- the knowledge graph for the task, through `node tools/kg.mjs ctx <id>` rather than reading files one by one;
- where useful, the frozen old repository `Bh3os/handyhub-app`, used only as source material ([[OWN-DEC-130]]); it is never changed.

Secret values (environment variables, keys, tokens, passwords, access codes) never appear in outputs, logs, commits, chat or reports.
