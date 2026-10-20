---
id: OWN-DEC-44
type: decision
title: "Website rebuild for local search and quote requests: goals, steps and rules"
status: active
area: site
links:
  related: ["[[HH-BASE-01]]", "[[HH-BASE-04]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  part_of: ["[[C01]]"]
source: "vault-own-decisions.md OWN-DEC-44; project chat 2026-10-06"
---
Owner wording (project chat, 2026-10-06, as recorded): "You are rebuilding an existing website, HandyHub, in this repo." Goals in order: "Rank on Google for local searches", "More quote requests and calls", "Look premium and trustworthy", "Fix anything broken or unfinished". An audit first: "Stop and wait for my approval before editing". Rules: "Work on a new git branch. Commit after each step", "Never invent reviews, prices, licenses, addresses, or photos. Where content is missing, insert \[\[PLACEHOLDER: what is needed\]\]", "Do not deploy. Verify each step in the browser at mobile and desktop widths".

Effect:
- The public website's goals, in order: local search ranking, more estimate requests and calls, a premium and trustworthy look, nothing broken or unfinished.
- Reviews, prices, licenses, addresses and photos are never invented.
- Each change is verified at mobile and desktop widths.

Partly replaced by [[OWN-DEC-53]]: deployment to staging is allowed. [[OWN-DEC-54]]: no placeholder is visible on the public site; sections that need missing content are not rendered until it exists.
