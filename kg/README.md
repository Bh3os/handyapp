# HandyHub knowledge graph

This folder is an Obsidian vault: open `kg/` in Obsidian to browse the graph view. It is the single source of truth for what the two websites must do: the public site plus customer portal, and the staff app.

**Agents never read this folder file by file.** Use the query tool, which returns only the nodes linked to what you are working on:

```sh
node tools/kg.mjs ctx TSK-0123      # everything a task needs: its requirements, decisions, rules, facts, tests
node tools/kg.mjs show OWN-DEC-104  # one node and its direct neighbours (titles only)
node tools/kg.mjs show HH-PAY-03 --depth 2
node tools/kg.mjs find "deposit"    # search titles and ids
node tools/kg.mjs list task --status todo
node tools/kg.mjs lint              # broken links, duplicate ids, missing fields
node tools/kg.mjs index             # rebuild kg/_index.json after editing nodes
```

## One node = one note
The file name is the node id: `<id>.md`, for example `OWN-DEC-104.md` or `HH-PAY-03.md`. Each note has YAML frontmatter followed by its full content. A node holds one thing (one requirement, one decision, one rule, one task) and everything needed to act on that thing, without repeating other nodes: it links to them instead.

```yaml
---
id: HH-PAY-03                      # unique; also the file name
type: requirement                  # see Types
title: Deposit of 20% on approved totals over $1,000.00
status: active                     # see Statuses
priority: P0                       # requirements and tasks: P0 | P1 | P2
area: payments                     # one of the Areas below
links:                             # typed edges; every target is a node id in [[ ]]
  decided_by: ["[[OWN-DEC-104]]"]
  depends_on: ["[[HH-EST-02]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
  tested_by: ["[[T38]]"]
  part_of: ["[[C05]]"]
source: "guide 12.3; OWN-DEC-104"  # where the content comes from (provenance)
---
Full content in plain sentences, bullets for lists. No filler.
```

## Types and folders
| type | folder | id pattern | what it holds |
| --- | --- | --- | --- |
| rule | `rules/` | `RULE-<NAME>` | Non-negotiable rules: safety gates, never invent facts, money in cents, human-review boundaries |
| decision | `decisions/` | `OWN-DEC-<n>` | One owner decision, the owner's wording kept, and what it changes |
| requirement | `requirements/` | `HH-<AREA>-<nn>` | One testable behaviour the software must have |
| acceptance | `acceptance/` | `T<nn>` | One acceptance test scenario |
| journey | `journeys/` | `C<nn>` customer, `S<nn>` staff | One step of the customer or staff journey, in order |
| fact | `facts/` | `FACT-<NAME>` | One business fact or configured value (hours, deposit rule, business name, service area) |
| service | `services/` | `SVC-<code>` | One of the 26 services with its approved description and its SOP |
| sop | `sops/` | `SOP-<code>` | The service's SOP steps, kept verbatim from the vault |
| entity | `entities/` | `ENT-<Name>` | A data entity (Customer, Property, Project, Estimate...) with its fields and states |
| role | `roles/` | `ROLE-<code>` | A staff or customer role and what it may do |
| integration | `integrations/` | `INT-<Name>` | An external service (Bird SMS/voice, Resend email, Square links, R2 photos, Render) |
| architecture | `architecture/` | `ARCH-<name>` | A stack or architecture choice |
| task | `tasks/` | `TSK-<nnnn>` | One rebuild task (a small, mergeable slice) |
| question | `questions/` | `OQ-<nn>` | An open question waiting on the owner or a professional |
| map | `maps/` | `MAP-<name>` | Overview note per area or type (Obsidian map of content), generated |

## Edge types (`links:`)
- `decided_by`: the decisions behind this node.
- `supersedes` / `superseded_by`: replaces an older node.
- `depends_on`: must exist first.
- `blocks`: the reverse of depends_on, used for tasks.
- `implements`: a task or requirement realises this node.
- `constrained_by`: rules or facts that limit this node.
- `uses`: entities, integrations or facts this node reads or writes.
- `tested_by`: acceptance tests.
- `part_of`: journey step, area map or parent node.
- `related`: weak link. Use it sparingly.

## Statuses
- `active`: current and binding.
- `superseded`: replaced. It keeps its text and links to the replacement.
- `proposed`: an AI proposal, not yet approved by the owner.
- `open`: unknown, waiting on the owner.
- Tasks only: `todo`, `doing`, `done`.

## Areas
`site`, `intake`, `identity`, `portal`, `messaging`, `estimates`, `approval`, `payments`, `scheduling`, `field`, `safety`, `quality`, `invoicing`, `records`, `privacy`, `staff`, `ops`, `security`, `a11y`, `i18n`, `platform`, `business`.

## Writing rules (token budget)
- Put each fact in exactly one node and link to it from everywhere else. Never copy text between nodes.
- Write the full content, but no preamble, no restating the title, no "this node describes".
- Keep owner wording verbatim inside decision nodes; requirement nodes state the resulting behaviour.
- Never invent business facts. A fact that is not known is a `question` node, or a fact node with `status: open`.
