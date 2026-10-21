---
id: OWN-DEC-120
type: decision
title: Unified inbox with real inbound email and text
status: active
area: messaging
links:
  related: ["[[OWN-DEC-129]]", "[[OWN-DEC-115]]", "[[HH-COM-01]]", "[[HH-COM-02]]", "[[HH-COM-03]]", "[[HH-COM-04]]", "[[HH-COM-05]]", "[[HH-PRIV-02]]", "[[OWN-DEC-154]]"]
  uses: ["[[INT-Bird]]", "[[INT-Resend]]", "[[ENT-Message]]"]
source: "owner-answers-verbatim 2026-10-12T19:31:46.613Z [S6 Inbox]; decision-briefs 2026-10-12T19:32:35"
---
Partly replaced by [[OWN-DEC-154]] (2026-10-21): a staff reply shows in the portal and is emailed at once; texts wait for the recipient's permitted hours.

Owner, 2026-10-12, staff journey S6, messages inbox.

Question asked:
> Staff S6 - Messages inbox: all customer conversations (email, text, project messages) in one inbox, each linked to its project. Inbound emails and texts to the HandyHub address/number are matched to the customer and project; unmatched ones go to a 'Needs linking' list (never auto-attached by name alone). Staff reply from the project; the reply goes out through the customer's preferred permitted channel. Replies to customer messages send right away when a staff member presses Send (this counts as the staff release). OK?

Owner wording:
> Yes, with these refinements:
>
> - Use one inbox for project messages and supported inbound/outbound email and texts, linked to the correct customer and project.
> - Match using reliable conversation references and contact records—not names alone. If several projects could match, put the message in **Needs Linking** for staff review.
> - Keep unmatched messages private to authorized office staff. Record linking corrections and preserve the original message.
> - Staff reply from the project. Pressing **Send** is the release action; no second approval is needed.
> - Use the customer’s preferred permitted channel. If unavailable, show another permitted option rather than silently switching channels.
> - Show queued, sent, delivered where supported, and failed states. Preserve reply drafts and prevent duplicate sends on retries.
> - Keep internal notes separate from customer messages. Validate attachments and apply project-access permissions.
> - Require actual inbound email/text integrations. Outbound sending alone does not provide a working unified inbox. Flag unsupported channels clearly rather than pretending messages were received.
>
> Test matching, ambiguous/unmatched messages, replies, attachments, permissions, and delivery failures. Deploy on private staging with approved test destinations.

Effect:
- One inbox for project messages and supported inbound/outbound email and texts, each linked to the right customer and project.
- Matching uses reliable references, never names: for email a per-project reply token or In-Reply-To/References headers, then a verified contact email; for texts the verified phone number plus the latest open conversation. Several possible projects send the message to "Needs Linking".
- Unmatched messages are private to authorized office staff; linking corrections are recorded and the original message stays immutable.
- Staff reply from the project; pressing Send is the release, no second approval.
- The customer's preferred permitted channel is used; when it is unavailable (no permission, unverified, opted out) another permitted option is offered, never a silent switch.
- States: queued, sent, delivered where the provider reports it, failed. Reply drafts are kept; retries never send twice.
- Internal notes stay separate; attachments are validated and project-access permissions apply.
- Real inbound integrations are required: inbound texts from [[INT-Bird]] ([[OWN-DEC-129]] replaces the Telnyx webhook of the original brief) and inbound email through [[INT-Resend]], each with signature verification, replay protection and size limits. While a channel's webhook secret is unset the inbox shows "Inbound not configured" and never pretends messages arrived.
- STOP and opt-out keywords update channel permissions. Unsupported channels are flagged.

Links: uses [[INT-Bird]], [[INT-Resend]], [[ENT-Message]].
