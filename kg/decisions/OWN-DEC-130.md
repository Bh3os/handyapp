---
id: OWN-DEC-130
type: decision
title: Rebuild in the new repo Bh3os/handyapp from a knowledge graph; reuse the Render staging service
status: active
area: platform
source: "owner answers 2026-10-20"
links:
  supersedes: ["[[OWN-DEC-21]]", "[[OWN-DEC-24]]", "[[OWN-DEC-30]]"]
---
Owner, 2026-10-20: all the requirements, tasks and docs live in an Obsidian-style knowledge graph in the new repository `Bh3os/handyapp`. AI agents traverse the graph and load only the related nodes, to keep token use low. The app is then rebuilt from the graph.

- **Old repo:** `Bh3os/handyhub-app` is frozen and used only as source material.
- **Graph sources:** all owner decisions, the vault's business facts, and the 204 launch requirements from the functionality guide.
- **Node size:** each node holds all of its content, however long that is.
- **Hosting:** the existing Render staging service (`handyhub-staging`) will point at the new repo once it is ready.
- **Stack:** chosen by Claude as the most efficient option, recorded in [[ARCH-STACK]].
