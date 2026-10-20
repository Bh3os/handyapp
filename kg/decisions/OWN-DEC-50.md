---
id: OWN-DEC-50
type: decision
title: Stock photos per service now; photos from real jobs later
status: active
area: site
links:
  related: ["[[HH-CUS-05]]", "[[HH-PRIV-02]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  part_of: ["[[C01]]"]
source: "vault-own-decisions.md OWN-DEC-50; project chat 2026-10-06"
---
Owner wording (project chat, 2026-10-06): "use stock that shows each service and in our latest projects we gonna use the pictures from our jobs".

Effect:
- Each service page shows a free stock photo of that kind of work, served from the site. The recorded source is Pexels (free to use, no attribution required), because Unsplash refused the build servers.
- A photo the owner adds for a service replaces its stock photo. A service without a suitable stock photo shows a designed fallback block.
- No stock photo is presented as HandyHub's own work.
- "Latest projects" shows only photos from real jobs, each with the customer's permission to publish; the section is absent until such photos exist ([[OWN-DEC-54]]).
- A photo fetch problem never fails a build.
