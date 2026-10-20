---
id: OWN-DEC-94
type: decision
title: Receipt page "Your request is in."
status: active
area: intake
links:
  related: ["[[OWN-DEC-35]]", "[[OWN-DEC-93]]", "[[OWN-DEC-97]]", "[[HH-INT-12]]", "[[HH-INT-14]]", "[[HH-INT-07]]", "[[HH-ID-03]]"]
  uses: ["[[FACT-RESPONSE-TARGET]]", "[[FACT-HOURS]]"]
source: "owner-answers-verbatim 2026-10-12T18:42:00.779Z [3.1 Receipt]; decision-briefs 2026-10-12T18:43:44"
---
Owner, 2026-10-12, journey Step 3.1, right after sending.

Question asked:
> Step 3.1 - Right after sending: the customer sees 'Request received' with a reference number (e.g. HH-7K3Q), a summary of what they sent, which photos uploaded or failed, and next steps: 'We aim to reply within an hour, every day. This is not an appointment or a price yet.' OK?

Owner wording:
> Yes—make the confirmation reassuring and useful:
>
> **Your request is in.**  
> Thank you for choosing HandyHub.
>
> **Request reference: HH-7K3Q**  
> Show the actual reference, with a Copy button.
>
> **Your project at a glance**  
> Summarize selected services, description, property address, preferred timing, and contact details.
>
> **Your photos**  
> Show received, processing, and failed photos separately. Let customers retry failed uploads without submitting another request. A photo failure must not lose the request.
>
> **What happens next?**  
> “We’ll review your project and contact you using your preferred method. We aim to respond within one hour during our daily hours, 8 AM–10 PM. Requests received outside those hours are reviewed when we reopen.”
>
> “Your request is received. Pricing and your appointment will be confirmed separately.”
>
> Provide:
> - **View My Request** through verified, secure project access.
> - **Create an Account** as an optional action for guests.
> - **Return Home**.
>
> Show success only after the request is saved. Keep account creation optional and never expose existing customer history before verification.
>
> Implement, test, and publish this on private staging.

Effect:
- The receipt shows only after the request is saved, with the exact headings and sentences above and the actual reference (format like HH-7K3Q) with a Copy button.
- "Your project at a glance" summarizes services, description, property address, preferred timing and contact details.
- "Your photos" lists received, processing and failed photos separately; failed uploads can be retried from the receipt without a new request, and a photo failure never loses the request.
- The response-hours sentence uses [[FACT-RESPONSE-TARGET]] and [[FACT-HOURS]] as configured copy, not scattered literals. It replaces the earlier "We aim to reply within an hour, every day." wording of [[OWN-DEC-35]].
- Actions: "View My Request" (verified secure project access, [[OWN-DEC-97]]), "Create an Account" (optional, guests only) and "Return Home". No existing customer history is shown before verification.

Links: uses [[FACT-RESPONSE-TARGET]], [[FACT-HOURS]].
