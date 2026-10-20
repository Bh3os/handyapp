---
id: OWN-DEC-30
type: decision
title: The application code moves to its own private repository, Bh3os/handyhub-app
status: superseded
area: platform
links:
  superseded_by: ["[[OWN-DEC-130]]"]
source: "vault-own-decisions.md OWN-DEC-30; project chat 2026-10-04"
---
Owner wording (project chat, 2026-10-04), answering the offer to move the application code into a separate private repository so the hosting provider sees only code: "yes do this".

Recorded approach (2026-10-04): the code under `app/` moved with its history to the private repository `Bh3os/handyhub-app`; the vault kept the plans, decisions and business files; hosting providers got access to the code repository only, because business documents are not shared with hosting providers.

Superseded by [[OWN-DEC-130]] (2026-10-20): `Bh3os/handyhub-app` is frozen and used only as source material; the app is rebuilt in `Bh3os/handyapp`. The reason behind this decision still holds: hosting providers get access to the code repository only, never to the owner's vault.
