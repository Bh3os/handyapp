---
id: HH-CUS-05
type: requirement
title: Functional public pages, truthful contact details and private routes kept out of search
status: active
priority: P0
area: site
links:
  decided_by: ["[[OWN-DEC-43]]", "[[OWN-DEC-47]]", "[[OWN-DEC-126]]", "[[OWN-DEC-72]]", "[[OWN-DEC-73]]", "[[OWN-DEC-45]]", "[[OWN-DEC-11]]", "[[OWN-DEC-131]]"]
  depends_on: ["[[HH-PRIV-04]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]", "[[RULE-SYNTHETIC-DATA]]"]
  uses: ["[[FACT-PUBLIC-CONTACT]]", "[[FACT-BUSINESS-NAME]]"]
  tested_by: ["[[T08]]", "[[T68]]", "[[T75]]"]
  part_of: ["[[C01]]"]
source: "guide 5.1 HH-CUS-05; OWN-DEC-43, OWN-DEC-47, OWN-DEC-126, OWN-DEC-72, OWN-DEC-73, OWN-DEC-45"
---
- The public site keeps working request and contact controls, the FAQ, help, the privacy notice and website terms ([[HH-PRIV-04]]), and useful not-found and error pages.
- Business contact details come only from [[FACT-PUBLIC-CONTACT]]: the public phone and the public email are both clearly labelled placeholders until the owner provides real values. A placeholder is never a working link, and the structured data has no telephone or email until a real value is set.
- Portfolio photos and reviews appear only if genuine; work photos only with the customer's recorded publication permission. Nothing is fabricated.
- Customer private routes (`/access/...`, `/project/...`, `/account...`) are excluded from search indexing and the sitemap, and they require server-side authorization regardless of indexing settings.
- Staging is behind the access gate for the owner and authorized testers and is excluded from search indexing; only a minimal health check is public.
- Customer pages are English only; former Spanish public URLs answer 301 to the English page.
