---
id: OQ-OFFLINE-DETAILS
type: question
title: The offline-copy and offline-draft details no decision gives
status: open
area: field
links:
  related: ["[[HH-OFF-01]]", "[[HH-OFF-02]]", "[[HH-OFF-03]]", "[[HH-OFF-04]]", "[[OWN-DEC-171]]", "[[TSK-0079]]", "[[TSK-0080]]", "[[T49]]", "[[T50]]"]
source: "TSK-0079 (2026-10-23): HH-OFF-01 to HH-OFF-04 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the staff app's offline use?

- **Who answers:** the owner.
- **Decided, in use:** a minimal offline copy of assigned work shows its version and last sync. Offline caches hold no access codes, finance or restricted records. Offline drafts keep device timestamps and say "Not yet synchronized". Start Work, approvals, financial and final actions need the server ([[HH-OFF-01]] to [[HH-OFF-04]]). The copy drops the address, site contact and visit-day data at the end of the property's local service day ([[OWN-DEC-171]]).
- **PROPOSED, in use on private staging:**
  - What is copied: the job packets listed on My Day ("my job packets": assigned jobs with a visit today or later), each with its pinned SOP checklists. A copy is taken each time My Day loads online.
  - What the copy leaves out, beyond what the server already hides: the access-code entries (not even their kind and label), the short-lived photo links and the deposit state.
  - "Ready for offline use" is shown only after the copy is written to the phone and read back unchanged (same version, content digest, packet and checklists). Otherwise the phone says the copy failed or was not stored.
  - Where: the browser's IndexedDB on the signed-in phone, treated as unprotected storage. Without IndexedDB the copy lives only while the page is open, and nothing claims otherwise.
  - Purge: at the end of the last assigned visit's local service day, when the job is no longer assigned to the worker, and at sign-out (copies and drafts both).
  - Offline drafts: an On my way / Arrived / Finished tap made without a connection is saved on the phone with the device time and shown as "Saved on this phone · Not yet synchronized". Sending drafts to the server is [[TSK-0080]]; until then they stay on the phone.
  - Sign-in while offline: the phone keeps what the signed-in session showed (name, email, roles, language and menu; never the security token, in the browser's local storage until sign-out) so a page reloaded without a connection can show the offline copy. Any action still needs the server, which checks the session itself.
  - The app shell (the page and its scripts) is kept by a service worker so the app opens with no connection. API answers are never cached by it.
  - Offline, the Start Work page says Start Work needs an online check and shows no Start button. Completion, deposits, payments, Ready after a Hold and in-person change-order approvals are disabled with "Needs a connection".
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
