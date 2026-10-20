---
id: HH-ARC-06
type: requirement
title: Separate customer and staff sessions with host-only cookies; staff sign-in never inherited
status: active
priority: P0
area: security
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-63]]", "[[OWN-DEC-73]]", "[[OWN-DEC-133]]"]
  depends_on: ["[[HH-ARC-05]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[FACT-DOMAIN]]"]
  tested_by: ["[[T22]]", "[[T27]]", "[[T68]]"]
  part_of: ["[[S00]]", "[[C03]]"]
source: "guide 3.2; OWN-DEC-114, OWN-DEC-63, OWN-DEC-73, OWN-DEC-133"
---
- The customer site and portal (`handyhub247.com`) and the staff app (`staff.handyhub247.com`) are separate origins ([[OWN-DEC-133]]); each talks to the shared backend through its own same-origin gateway.
- Each origin sets its own host-only session cookies (for example the `__Host-` prefix); customer and staff sessions never share a cookie. There are three separate session contexts:
  - staff session: email-and-password sign-in on the staff website ([[OWN-DEC-114]]);
  - customer session: account sign-in with a one-time code ([[OWN-DEC-63]]) or a verified, project-scoped guest session ([[OWN-DEC-97]]);
  - the staging access gate, which sits in front of everything on staging and is separate from both ([[OWN-DEC-73]]).
- No broadly scoped shared domain cookie is created to "connect" the two websites.
- Staff access is never inherited from, or created by, customer registration or a customer session. A customer session never reaches a staff route, and a staff session never acts as a customer.

Routes (adjust to keep working routes):

| Surface | Route | Access |
| --- | --- | --- |
| Public services and coverage | `/services/...`, `/service-areas` | Public, English |
| Request wizard | `/request-estimate` | Guest or customer |
| Verification landing | `/access/...` | Minimal page; private data only after verification |
| Guest project | `/project/{reference}` | Verified, project-scoped session |
| Customer account | `/account`, `/account/projects` | Verified customer account |
| Staff sign-in | `/sign-in` on `staff.handyhub247.com` (`/staff/sign-in` on the staging host until the domain is set up) | Invited staff only |
| Staff operations | Modules on `staff.handyhub247.com` | Active, role- and record-scoped staff session |
| Shared operations API | `/api/v1/...` through the gateway | Permission per endpoint |

A reference in a URL is an identifier, never an access grant. Readable URLs never contain addresses, access codes, customer names or long-lived bearer credentials; a one-time link token is removed from the URL after exchange ([[HH-SEC-04]]).
