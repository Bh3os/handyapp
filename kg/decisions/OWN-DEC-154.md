---
id: OWN-DEC-154
type: decision
title: "Staff replies: shown in the portal and emailed at once; texts wait for the recipient's permitted local hours"
status: active
area: messaging
links:
  uses: ["[[FACT-HOURS]]", "[[FACT-TIMEZONE]]"]
  related: ["[[OWN-DEC-120]]", "[[HH-COM-15]]"]
source: "owner answers 2026-10-21 R1-Q4"
---
Owner answer (round 1, question 4, "Replies outside 8 AM–10 PM"), option chosen "Email at once, text waits":

> Choose **Email at once, text waits**, with the following improvements:
>
> 1. Display staff replies immediately in the customer's secure project portal.
> 2. Send approved email replies immediately, regardless of the time.
> 3. Queue non-urgent SMS notifications outside the permitted messaging hours and send them at the next allowed time, normally 8 AM in the customer's local time zone.
> 4. Support both Eastern and Central time zones based on the customer's verified location.
> 5. Respect customer communication preferences, SMS consent, opt-outs, and applicable quiet-hours requirements.
> 6. Distinguish transactional messages from marketing messages and apply the appropriate compliance rules.
> 7. Allow critical safety-related communications to be escalated through an approved emergency communication procedure rather than automatically bypassing messaging restrictions.
> 8. Before sending queued messages, verify that the message is still relevant, has not already been delivered, and that the customer has not opted out.
> 9. Maintain complete delivery records, including queued time, actual sending time, delivery status, and failures.
> 10. Clearly show staff whether a message has been delivered, is scheduled, or has failed.
> 11. Keep SMS delivery disabled until A2P 10DLC registration and applicable consent requirements are complete.
>
> Implement and test these rules in staging before activating live messaging.

Effect:
- A staff reply appears in the customer's project portal immediately when staff press Send (Send stays the release, [[OWN-DEC-120]]); its email goes at once, at any hour.
- A non-urgent text outside the permitted hours is queued and sent at the next allowed time, normally 8 AM in the recipient's local time zone, Eastern or Central from the verified location ([[OWN-DEC-159]]). Before it goes, it is rechecked: still relevant, not already delivered, no opt-out.
- Transactional and marketing messages follow their own rules. Critical safety communication goes through the approved escalation procedure ([[OWN-DEC-172]]), never an automatic quiet-hours bypass.
- Staff see whether each message is delivered, scheduled or failed, with queued time, sent time, delivery status and failures ([[HH-COM-14]]).
- Texts stay disabled until A2P 10DLC registration and consent are complete ([[OWN-DEC-190]]).
- Answers [[OQ-REPLY-CONTACT-HOURS]]: the PROPOSED "waits" value of `replies.contact_hours` is replaced. Built by [[TSK-0122]].
