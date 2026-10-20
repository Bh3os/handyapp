---
id: OWN-DEC-121
type: decision
title: Worker My Day and offline use
status: active
area: field
links:
  related: ["[[OWN-DEC-40]]", "[[OWN-DEC-109]]", "[[OWN-DEC-119]]", "[[HH-OFF-01]]", "[[HH-OFF-02]]", "[[HH-OFF-03]]", "[[HH-OFF-04]]", "[[HH-OFF-05]]", "[[HH-OFF-06]]", "[[HH-OFF-07]]", "[[HH-PKT-01]]", "[[HH-PKT-02]]", "[[HH-PKT-07]]", "[[HH-CRM-03]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
source: "owner-answers-verbatim 2026-10-12T19:31:46.613Z [S7 My Day]; decision-briefs 2026-10-12T19:32:17"
---
Owner, 2026-10-12, staff journey S7, My Day and offline use.

Question asked:
> Staff S7 - Worker 'My Day' and offline use: workers see today's visits in order, with address, access notes, preparation, readiness and the next action. The day's job packet downloads to the phone, so checklists, photos and notes work without signal and sync when back online (photos marked 'pending upload' until confirmed). Access codes show only on the day of the visit, to the assigned worker, and are removed from the phone after the visit. OK?

Owner wording:
> Yes, with these adjustments:
>
> - **My Day:** show today’s assigned visits in order, with arrival window, address, directions, access notes, preparation, readiness, and a clear next action.
> - Download each assigned job packet while online. Show its last update and “Ready for offline use” only after the required content is saved.
> - Support offline checklists, notes, before/after photos, and Arrived/Finished timestamps. Preserve unfinished work when the app closes.
> - Clearly show **Saved on this phone / Pending upload / Synced**. Automatically retry syncing without duplicate records or photos; flag conflicting changes for review.
> - Follow the job sequence: **safety checks → before photos → operation checklist → after photos → walkthrough → submit for quality review**. Pending uploads remain visibly incomplete.
> - Require an online readiness check before starting. Offline use cannot bypass safety holds or approve additional work.
> - Show access codes only to the assigned worker on the visit date, after an online permission check. Keep them out of offline downloads and remove the displayed copy after the visit.
> - Warn before signing out or clearing data when unsynced work remains. Show schedule changes and reassignment when connectivity returns.
>
> Test offline use, reopening the app, upload failures, sync conflicts, permissions, and reassignment. Implement and publish on private staging for me to check.

Effect:
- My Day lists today's assigned visits in order with arrival window, address, directions (a plain link to a maps app), access notes, preparation, readiness and the next action.
- Each assigned job packet downloads while online; "Ready for offline use" shows only after the required content is verified as saved on the device, with its last update time.
- Offline: checklists, notes, before/after photos and Arrived/Finished timestamps; unfinished work survives closing the app.
- Each item shows "Saved on this phone", "Pending upload" or "Synced". Sync retries automatically without duplicate records or photos (client idempotency keys); conflicting changes are flagged for review, never overwritten.
- The sequence safety checks → before photos → operation checklist → after photos → walkthrough → submit for quality review holds offline too; pending uploads keep the job visibly incomplete ([[OWN-DEC-109]]).
- Starting needs an online readiness check; offline use never bypasses safety holds and never approves additional work ([[RULE-SAFETY-GATES]]).
- Access codes show only to the assigned worker on the visit date after an online permission check; they are never in offline downloads and the displayed copy is removed after the visit or on reassignment ([[OWN-DEC-40]]).
- Signing out or clearing data with unsynced work warns first. Schedule changes and reassignments appear when connectivity returns; a reassigned visit's packet leaves the old worker's phone.

Links: constrained by [[RULE-SAFETY-GATES]].
