---
id: OWN-DEC-84
type: decision
title: Service page content drafted by AI for all 26 services; published to private staging, owner approves for production
status: active
area: site
links:
  related: ["[[HH-CUS-02]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-BASE-04]]", "[[HH-BASE-06]]", "[[OWN-DEC-180]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  part_of: ["[[C01]]"]
source: "vault-own-decisions.md OWN-DEC-84; owner-answers-verbatim.md 2026-10-12T16:57 and 18:17 (journey Step 1 review); decision-briefs.md (OWN-DEC-84 as amended)"
---
Partly replaced by [[OWN-DEC-180]] (2026-10-21): service pages that pass the quality review are published, production included, without per-service owner approval.

Owner wording (project chat, 2026-10-12): "Draft content for all 26 services using the existing service files:
- A clear, short description of included work and key exclusions.
- Estimate approach: remote when sufficient details/photos are available; site visit when inspection or measurements are needed.
- Simple, service-specific preparation instructions for the customer.

Use plain English and the existing premium website style. Do not invent prices, completion times, credentials, or guarantees. Never ask customers to perform hazardous preparation. Keep drafts PROPOSED until I approve each service. Provide one review screen where I can edit, approve, and publish them individually or in a selected batch. Approved edits must preserve version history."

Amendment (journey Step 1 review, the same day): "Finish and publish all the latest homepage and service-page edits to the private staging website. I will review them directly on the website; do not leave completed content unpublished or waiting for individual approval. Complete all 26 service pages with descriptions, inclusions/exclusions, estimate approach, safe preparation instructions, relevant considerations, 3–5 service-specific FAQs with answers, and related services. Preserve the premium design and approved homepage wording. "Request a Free Estimate" must preselect the service and offer Continue as Guest, Create an Account, or Sign In, preserving selections throughout. Resolve implementation issues rather than hiding unfinished features. Flag uncertain business facts separately without inventing claims or blocking unrelated pages. Keep the staging password gate and test payments/messages active. Deploy the changes, verify the flows, and send me the review links. This authorizes private staging publication only; production remains unchanged."

Effect:
- Every one of the 26 service pages has, drawn only from the service files (`SVC-*`, `SOP-*` and the vault business facts): a short description of included work and key exclusions; the estimate approach (remote when details and photos suffice, a site visit when inspection or measurements are needed); safe, service-specific preparation steps; relevant considerations (for example the home-age limits of [[OWN-DEC-66]] and what may need a site visit); 3 to 5 service-specific FAQs with answers; and related services.
- Plain English in the premium style. No price, completion time, credential or guarantee is invented, and customers are never asked to do hazardous preparation.
- Uncertain business facts go on a separate flags list for the owner; they do not block other pages.
- Each page is a versioned draft. On private staging (and local or CI) the drafted content is shown directly, without per-page approval. Production shows only versions the owner approved and published; the environment rule is explicit and tested.
- One review screen lets the owner edit, approve and publish pages individually or in a selected batch; approved edits keep the version history.
- "Request a Free Estimate" on a service page preselects that service.
