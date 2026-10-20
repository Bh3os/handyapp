---
id: OWN-DEC-23
type: decision
title: Claude Code reviews and merges pull requests once CI is green
status: active
area: platform
links:
  related: ["[[HH-TEST-01]]"]
source: "vault-own-decisions.md OWN-DEC-23; owner start-decision brief item 7 (2026-10-04)"
---
Owner wording (project chat, 2026-10-04): "I wanna you edit the start-desicion and make Claude Code , review and merge".

Effect:
- Claude Code opens each pull request, reviews it against the agent development guide and the Definition of Done, and merges it once every required CI check is green on the head being merged.
- It never merges with a required check red or skipped, and never changes branch protection.
- Still with the owner or named professionals: each production release and the go decision ([[OWN-DEC-22]]), the security review before the first production release, every human-review boundary, and real-use approval of terms and SOPs. A merge is not an approval of business content.
- RISK: the same kind of agent writes and reviews the code; mitigated by blocking CI gates and the unchanged release controls.

Open:
- The qualified security review before the first production release: [[OQ-SECURITY-REVIEW]].
