---
id: HH-OFF-07
type: requirement
title: "Sync states visible; never silently erase unsynced work"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]"]
  uses: ["[[ENT-FieldEvent]]", "[[ENT-JobPacket]]"]
  tested_by: ["[[T52]]", "[[T27]]"]
  part_of: ["[[S07]]"]
source: "guide 17.2 HH-OFF-07; OWN-DEC-121"
---
- Items show pending, syncing, synchronized, failed or needs-review states (shown to workers as "Saved on this phone", "Pending upload", "Synced", plus failed and needs review).
- Before signing out, updating the app or clearing data while unsynced work remains, the app warns and offers upload or recovery; it never silently discards field evidence.
- A reassigned visit's packet is removed from the old worker's phone on next sync.
- Lost-device handling revokes the account's server sessions. An already-offline local copy cannot always be erased remotely at once, and the app says so.
