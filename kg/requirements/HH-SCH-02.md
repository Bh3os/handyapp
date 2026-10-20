---
id: HH-SCH-02
type: requirement
title: "UTC instants with an explicit IANA zone; DST handled"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-125]]"]
  depends_on: ["[[HH-DATA-06]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Property]]", "[[FACT-TIMEZONE]]"]
  tested_by: ["[[T41]]"]
  part_of: ["[[S05]]", "[[C07]]"]
source: "guide 14.1 HH-SCH-02"
---
- Instants are stored in UTC; local scheduling uses an explicit IANA zone stored on the property and the visit. The business time zone is [[FACT-TIMEZONE]]; each property's actual zone is verified rather than assumed for every Kentucky or Indiana address.
- The local date and arrival window chosen are stored with the zone, so moving across a daylight-saving change keeps the chosen local window.
- A local time that does not exist (spring-forward gap) is refused with a clear message; a repeated local hour (fall-back) is stored unambiguously with its offset.
- Customers always see the appointment's zone. Server time zone is never relied on; conversions are tested at both DST boundaries.
