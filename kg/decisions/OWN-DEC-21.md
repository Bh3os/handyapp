---
id: OWN-DEC-21
type: decision
title: Build the software in app/ inside the vault repository on the planned stack
status: superseded
area: platform
links:
  superseded_by: ["[[OWN-DEC-130]]"]
source: "vault-own-decisions.md OWN-DEC-21; owner message 2026-10-04 (HANDOFF section 2)"
---
Owner wording (project chat, 2026-10-04): "build the software in app/ on the planned stack (TypeScript strict, Node.js LTS, Fastify, PostgreSQL, Kysely, React/Vite PWA, Astro, English and Spanish)".

Recorded approach (2026-10-04): the application was built under `app/` of the vault repository on the planned stack.

Amended by [[OWN-DEC-30]] (2026-10-04: the code moved to the private repository `Bh3os/handyhub-app`). Superseded by [[OWN-DEC-130]] (2026-10-20): the app is rebuilt in `Bh3os/handyapp` from this knowledge graph, on a stack Claude chooses ([[ARCH-STACK]]); the old repository is frozen source material.
