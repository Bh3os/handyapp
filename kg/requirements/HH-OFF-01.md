---
id: HH-OFF-01
type: requirement
title: "Minimal offline packet for assigned work, with version and last sync"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]"]
  depends_on: ["[[HH-SEC-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-JobPacket]]", "[[ENT-StaffUser]]"]
  tested_by: ["[[T49]]"]
  part_of: ["[[S07]]"]
source: "guide 17.1 HH-OFF-01; OWN-DEC-121"
---
- Each assigned job packet (with its SOP checklist) downloads while online, for assigned work only, on the worker's signed-in device. The app shows the packet's last update and version.
- "Ready for offline use" appears only after the required content is verified as stored on the device (IndexedDB), not merely requested.
- Offline storage is treated as unprotected: data is never called secure because it is encoded, or because a key sits beside it. Sensitive records are not cached until a deliberate protected-storage and device-control design exists ([[HH-OFF-02]]).
