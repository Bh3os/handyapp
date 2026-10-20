---
id: HH-INT-08
type: requirement
title: Unfinished request drafts kept in the same browser with Resume and Clear Draft
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-93]]", "[[OWN-DEC-87]]", "[[OWN-DEC-90]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Request]]"]
  tested_by: ["[[T10]]"]
  part_of: ["[[C02]]"]
source: "guide 7.2 HH-INT-08; OWN-DEC-93"
---
- All entered details survive normal navigation: going back, switching steps, and switching between guest, create account and sign in.
- Unfinished text drafts are saved temporarily in the same browser. On return the form offers **Resume** and **Clear Draft**. Old drafts expire, and the draft is cleared after a successful submission. The form explains what is saved, for how long, and how to clear it.
- Browser storage never holds passwords, verification codes, payment information, access secrets or complete sensitive project data.
- Switching identity (sign-in, sign-out, another account) never exposes the previous person's draft or cached data.
