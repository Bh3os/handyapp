---
id: OWN-DEC-24
type: decision
title: "Development repository: app/ in the vault repository on the current GitHub repository"
status: superseded
area: platform
links:
  superseded_by: ["[[OWN-DEC-130]]"]
source: "vault-own-decisions.md OWN-DEC-24; owner start-decision brief item 2 (2026-10-04)"
---
Owner wording (project chat, 2026-10-04): "app/ in this repository. Keep using the current GitHub repository for development; repository/account ownership can be moved to a business-owned GitHub organization later if needed."

Recorded approach (2026-10-04): the code stayed in `app/` of the vault repository; a move to a business-owned GitHub organization stayed possible later; business-owned accounts were a launch requirement.

Amended by [[OWN-DEC-30]] (code moved to `Bh3os/handyhub-app`). Superseded by [[OWN-DEC-130]]: development happens in `Bh3os/handyapp`. A later move to a business-owned GitHub organization is still possible.
