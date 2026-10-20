---
id: OWN-DEC-29
type: decision
title: "Approval channel: chat; Claude records each approved decision with the date"
status: active
area: business
source: "vault-own-decisions.md OWN-DEC-29; owner start-decision brief item 8 (2026-10-04)"
---
Owner wording (project chat, 2026-10-04): "chat is the approval channel. I will answer approvals and decisions in chat, and Claude should record each approved decision in the decision log with the date."

Effect:
- The owner gives approvals and decisions in the chat.
- Claude records each one with its date and the owner's words; an AI proposal stays PROPOSED until the owner approves it.

Partly replaced by [[OWN-DEC-130]]: decisions are now recorded as `OWN-DEC-<n>` nodes in `kg/decisions/` of `Bh3os/handyapp` instead of the vault decision log.
