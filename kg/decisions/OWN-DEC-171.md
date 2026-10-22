---
id: OWN-DEC-171
type: decision
title: "Worker data access: first name and the address on the visit day only; owner-authorized extensions"
status: active
area: field
links:
  supersedes: ["[[OWN-DEC-40]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  related: ["[[OWN-DEC-121]]", "[[HH-CRM-03]]", "[[HH-PKT-08]]"]
source: "owner answers 2026-10-21 R6-Q2"
---
Owner answer (round 6, question 2), option chosen "First name, address on visit day (Recommended)", with field-worker access controls:

> Choose **First name, address on visit day (Recommended)**, with the following field-worker access controls.
>
> **1. Before the visit**
> - Show assigned workers the job type, scheduled date, arrival window, required tools, materials, SOPs, hazards, and safety guidance.
> - Show the general service area for route planning.
> - Keep the customer's full address, personal phone numbers, and property access codes hidden until authorized.
>
> **2. On the visit day**
> - Show the customer's first name only.
> - Reveal the verified service address to workers assigned to that visit.
> - Show the authorized site contact's phone number only when needed for visit coordination.
> - Reveal property access codes only through an explicit, authenticated action, with an audit record.
> - Never show payment information, private account information, or unrelated customer records.
>
> **3. Access expiration**
> - Automatically remove access to the full address, site contact phone, and access codes at the end of the property's local service day.
> - Immediately revoke access when the worker is removed from the job, offboarded, or the visit is cancelled.
> - When a visit is rescheduled, recalculate access based on the new confirmed visit date.
> - Allow owner-authorized temporary access extensions for legitimate operational needs, with a recorded reason and automatic expiration.
> - Never allow workers to bypass safety, legal, or authorization controls.
>
> **4. Operational security**
> - Use role-based and visit-assignment-based access controls.
> - Enforce access restrictions on the server, not just by hiding fields in the interface.
> - Do not include access codes in push notifications, SMS, emails, or application logs.
> - Prevent sensitive data from being retained in offline caches beyond its authorized access period, to the extent technically enforceable.
> - Where data may have been stored or viewed on a device, acknowledge that access revocation cannot erase screenshots or information already copied.
> - Keep access history and security audit records.
>
> **5. Customer communications**
> - Let workers contact the designated site contact through an authorized call or message action.
> - Prefer privacy-preserving communication methods where available.
> - Keep customer communications associated with the project.
> - Do not permit workers to use customer contact information for personal purposes.
>
> **6. Testing**
> - Test access before, during, and after visits.
> - Test worker reassignment, cancellation, rescheduling, and offboarding.
> - Test access-code visibility and audit logging.
> - Test unauthorized API requests and expired sessions.
> - Test Eastern and Central local service-day boundaries.
> - Test temporary access extensions and automatic expiration.
>
> Implement and test these requirements in private staging.

Effect:
- Before the visit day, assigned workers see the job type, date, arrival window, tools, materials, SOPs, hazards, safety guidance and the general service area; never the full address, personal phone numbers or access codes.
- On the visit day, the workers assigned to that visit see the customer's first name only, the verified address, the site contact's phone only when needed to coordinate, and access codes only through an explicit, authenticated, audited action; never payment, account or unrelated customer information.
- Access to the address, site-contact phone and codes ends at the end of the property's local service day ([[OWN-DEC-159]]); it ends at once when the worker is removed, offboarded or the visit is cancelled; a reschedule moves it to the new date; the Owner may grant a temporary extension with a recorded reason and automatic expiry. Nothing bypasses safety, legal or authorization controls.
- Enforced on the server; codes never in push notifications, texts, emails or logs; offline copies kept no longer than the access period as far as technically possible ([[HH-OFF-02]]); revocation cannot erase screenshots or copied information, and the app says so; access history is audited.
- Workers contact the site contact through an authorized call or message action, privacy-preserving where available, kept with the project, never for personal use.
- Replaces [[OWN-DEC-40]] (address from confirmation through the service day); partly replaces [[OWN-DEC-121]].
- Answers [[OQ-WORKER-DATA-ACCESS]]. Built by [[TSK-0128]].
