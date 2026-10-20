---
id: HH-PRIV-04
type: requirement
title: "Privacy notice and website terms describe actual practice"
status: active
priority: P0
area: privacy
links:
  decided_by: ["[[OWN-DEC-72]]", "[[OWN-DEC-129]]", "[[OWN-DEC-114]]", "[[OWN-DEC-127]]", "[[OWN-DEC-134]]", "[[OWN-DEC-135]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-PolicyVersion]]", "[[INT-Render]]", "[[INT-R2]]", "[[INT-Bird]]", "[[INT-Resend]]", "[[INT-Square]]", "[[FACT-CANCELLATION-RULES]]", "[[FACT-WARRANTY]]"]
  tested_by: ["[[T74]]"]
  part_of: ["[[C02]]", "[[S08]]"]
source: "guide 25.2 HH-PRIV-04; OWN-DEC-72 (vendor list updated by OWN-DEC-114, OWN-DEC-129)"
---
- A complete English privacy notice and website terms are drafted now and shown on staging marked "Draft - not reviewed by an attorney"; there are no empty "pending review" pages.
- They name only services actually used, verified in the implementation, each with its purpose: Render hosting, Cloudflare R2 photo storage, Bird texts and phone number, Resend email, Square payments taken outside the software. Staff sign in through the app's own login (no external identity provider).
- The privacy notice covers collected information, purposes, authorized staff and vendor access, photo handling, retention, customer requests and contact details. Marketing consent and photo-publication permission stay separate from service requests.
- The terms reflect the actual process: guest requests, optional accounts, estimates needing approval, separately confirmed appointments, approved scope changes, the configured payment and deposit policies, no minimum charge. The decided cancellation and refund rules ([[FACT-CANCELLATION-RULES]]) and the 90-day workmanship warranty ([[FACT-WARRANTY]]) are described as decided; no other fees, warranties, liability waivers or refund rules are invented.
- An attorney review checklist goes with the drafts. Production needs the reviewed pages, verified practices and the owner's documented approval. The policy version presented is recorded with each request and acceptance.
- The software never certifies Kentucky or Indiana legal compliance.
