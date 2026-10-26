---
id: OQ-OFFLINE-DETAILS
type: question
title: The offline-copy, offline-draft and sync details no decision gives
status: open
area: field
links:
  related: ["[[HH-OFF-01]]", "[[HH-OFF-02]]", "[[HH-OFF-03]]", "[[HH-OFF-04]]", "[[HH-OFF-05]]", "[[HH-OFF-06]]", "[[HH-OFF-07]]", "[[ENT-FieldEvent]]", "[[T27]]", "[[T51]]", "[[T52]]", "[[OWN-DEC-171]]", "[[TSK-0079]]", "[[TSK-0080]]", "[[T49]]", "[[T50]]"]
source: "TSK-0079, TSK-0080 (2026-10-23): HH-OFF-01 to HH-OFF-07 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the staff app's offline use and sync?

- **Who answers:** the owner.
- **Decided, in use:** a minimal offline copy of assigned work shows its version and last sync. Offline caches hold no access codes, finance or restricted records. Offline drafts keep device timestamps and say "Not yet synchronized". Start Work, approvals, financial and final actions need the server ([[HH-OFF-01]] to [[HH-OFF-04]]). The copy drops the address, site contact and visit-day data at the end of the property's local service day ([[OWN-DEC-171]]).
- **PROPOSED, in use on private staging:**
  - What is copied: the job packets listed on My Day ("my job packets": assigned jobs with a visit today or later), each with its pinned SOP checklists. A copy is taken each time My Day loads online.
  - What the copy leaves out, beyond what the server already hides: the access-code entries (not even their kind and label), the short-lived photo links and the deposit state.
  - "Ready for offline use" is shown only after the copy is written to the phone and read back unchanged (same version, content digest, packet and checklists). Otherwise the phone says the copy failed or was not stored.
  - Where: the browser's IndexedDB on the signed-in phone, treated as unprotected storage. Without IndexedDB the copy lives only while the page is open, and nothing claims otherwise.
  - Purge: at the end of the last assigned visit's local service day, when the job is no longer assigned to the worker, and at sign-out (copies and drafts both). A copy taken during the visit-day access loses the address, directions, site-access details, site contact and first name when that access ends ([[TSK-0128]], [[OQ-WORKER-ACCESS-DETAILS]]).
  - Offline drafts: an On my way / Arrived / Finished tap made without a connection is saved on the phone with the device time and its own event ID, and shown as "Saved on this phone · Not yet synchronized".
  - Sign-in while offline: the phone keeps what the signed-in session showed (name, email, roles, language and menu; never the security token, in the browser's local storage until sign-out) so a page reloaded without a connection can show the offline copy. Any action still needs the server, which checks the session itself.
  - The app shell (the page and its scripts) is kept by a service worker so the app opens with no connection. API answers are never cached by it.
  - Offline, the Start Work page says Start Work needs an online check and shows no Start button. Completion, deposits, payments, Ready after a Hold and in-person change-order approvals are disabled with "Needs a connection".
- **PROPOSED sync details ([[TSK-0080]]), in use on private staging:**
  - Uploads: each draft is uploaded on its own, oldest first, when the app opens, when the connection returns, and every 30 seconds while anything waits. The server keeps each event under the phone's event ID, so an event sent again is never recorded twice.
  - States on the phone: "Saved on this phone", "Pending upload" (no answer yet), "Synced", "Needs review" (the server kept it for the Owner, not applied) and "Upload failed" (the server refused the upload itself; the draft stays on the phone). Synced and in-review drafts leave the phone 12 hours after the server answered; the others never leave without the worker's choice.
  - Checks on arrival: the worker must have been assigned to the visit at the time on the phone, and still be assigned now. Otherwise the event goes to the Owner's review and is not applied. A visit canceled, expired or ended since, or a tap the visit's newer state refuses (for example Finished before Arrived), is also a conflict for the Owner's review. Nothing is applied over the newer state.
  - A disabled worker's phone cannot upload (the account's sessions are revoked). The Owner, signed in on that phone, may upload another account's drafts for review only; they are never applied. Anyone else signed in on that phone is told to give it to the Owner.
  - The Owner's review: the staff queue item "Phone update to review" opens the event (who recorded and uploaded it, the phone's time and the server's, why it was not applied). The Owner corrects the worker's times on the visit when needed, then records what was done, once. The queue item is seen by the Owner (the role that corrects timestamps).
  - Late On my way: one uploaded later still moves the visit as an online tap would. The customer's on-the-way notice is sent only if the visit is still on the way when the notice goes out.
  - Sign-out with work not uploaded: a warning offers "Upload now", "Sign out and keep them on this phone" or "Stay signed in". Offline copies of packets are always removed at sign-out; drafts already on the server are removed; unsynced drafts are kept only after that choice.
  - App update: a new version waits until the person taps "Update now". With work not uploaded, the banner says so and offers "Upload first". The update keeps the drafts.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
