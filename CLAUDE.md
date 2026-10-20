# HandyApp: standing instructions for every Claude Code session

HandyApp is the rebuild of HandyHub's two websites:
- the public site plus customer portal;
- the staff app.

HandyHub is a home-services business in Kentuckiana with 26 services (handyman, drywall, painting, cleaning).

## Use the knowledge graph instead of reading files
Everything decided is in `kg/`, an Obsidian vault of small linked nodes: rules, owner decisions, requirements, acceptance tests, journey steps, facts, services, SOPs, entities, roles, integrations, architecture and tasks.

- **Don't read `kg/` or `sources/` file by file.** Query the graph and load only what is linked:
  - `node tools/kg.mjs ctx <TASK-or-node-id>` gives everything one piece of work needs.
  - `node tools/kg.mjs show <id> [--depth 2]` gives one node and its neighbours.
  - `node tools/kg.mjs find <text>` searches; `node tools/kg.mjs list task --status todo` lists the open tasks.
- **Read `sources/` only for the exact section a node cites in `source:`.** `sources/` holds the original documents, frozen.
- **After editing nodes, run `node tools/kg.mjs index && node tools/kg.mjs lint`.** Lint must report 0 problems.
- **Node format and edge types** are in `kg/README.md`.

## Non-negotiable rules
These rule nodes always apply:
- [[RULE-NO-INVENTED-FACTS]]
- [[RULE-DECIDED-VALUES-ACTIVE]]
- [[RULE-SAFETY-GATES]]
- [[RULE-HUMAN-REVIEW]]
- [[RULE-MONEY-CENTS]]
- [[RULE-SERVER-AUTHZ]]
- [[RULE-SYNTHETIC-DATA]]
- [[RULE-LANGUAGES]]
- [[RULE-AI-WAVE2]]

Read them with `node tools/kg.mjs show RULE-...`.

## How work is done
1. **Pick a task:** take one `todo` task, run `ctx` on it, and build only what its linked nodes say.
2. **Record changes in the graph:** a new owner decision becomes a new `OWN-DEC-<n>` node. If it replaces an older one, the older node gets `status: superseded` and a `superseded_by` link. Change the requirement nodes it affects and mark the task `done`, all in the same pull request.
3. **Branches and merging:** work on a branch and open a pull request. Claude merges it once the required CI checks pass. Production releases stay with the owner.
4. **No secrets:** never commit secrets or personal data.
