---
id: OWN-DEC-162
type: decision
title: "Customer side English only; staff side in Spanish for Spanish-speaking employees"
status: active
area: i18n
links:
  related: ["[[OWN-DEC-45]]", "[[OWN-DEC-79]]", "[[RULE-LANGUAGES]]", "[[HH-LANG-01]]", "[[OWN-DEC-208]]"]
source: "owner answers 2026-10-21 R4-Q1"
---
Owner answer (round 4, question 1), option chosen "Keep English only" for all customer-facing experiences:

> Choose **Keep English only** for all customer-facing experiences.
>
> Clarification of HandyHub's language requirements:
>
> **1. Customer-facing systems — English only**
> - Public website
> - Service pages
> - Estimate request forms
> - Customer accounts and dashboard
> - Customer project portal
> - Appointments and scheduling
> - Estimates, invoices, receipts, and documents
> - All 21 customer/staff notification templates where customer-facing
> - Customer emails and SMS
> - Customer-facing terms and policies
>
> Do not implement Spanish translations or language-switching features on the customer side at this stage.
>
> **2. Staff portal — Spanish support required**
> - Provide the employee-facing interface in Spanish for Spanish-speaking employees.
> - Translate navigation, job assignments, schedules, buttons, instructions, alerts, and operational workflows.
> - Provide complete Spanish SOPs, hazards, safety instructions, emergency procedures, tools, and materials guidance.
> - Preserve original technical terminology where necessary for clarity and safety.
> - Require properly reviewed and validated safety translations before relying on them for field operations.
>
> **3. Customer communication**
> - All messages sent to customers must be in professional English.
> - Spanish-speaking employees should be able to draft messages in Spanish, but the system must convert them into clear, professional English for staff review before release.
> - Never automatically send unreviewed AI translations to customers.
> - Preserve the employee's original draft and the final released English version for the communication audit trail.
>
> **4. Architecture**
> - Keep the system structured so additional customer languages can be added in the future without a major redesign.
> - Do not spend development time translating customer-facing functionality that is not currently required.
> - Prioritize reliability, security, staff usability, and correct workflow implementation.
>
> Apply these requirements consistently across the existing application and update any conflicting documentation or implementation plans.
>
> Test both the English customer experience and Spanish employee experience in private staging.

Effect:
- Every customer-facing surface is English only: public site, service pages, request form, accounts and dashboard, project portal, appointments, estimates, invoices, receipts and documents, all customer-facing templates, emails and texts, terms and policies. No customer-side Spanish or language switch is built now; the structure keeps room for more customer languages later ([[RULE-LANGUAGES]]).
- The staff portal is in Spanish for Spanish-speaking employees: navigation, assignments, schedules, buttons, instructions, alerts and workflows, and complete Spanish SOPs, hazards, safety instructions, emergency procedures, tools and materials guidance, keeping technical terms where clarity and safety need them. Safety translations are reviewed and validated before field use ([[OWN-DEC-79]], [[HH-LANG-04]]).
- Customer messages are professional English. Converting Spanish staff drafts into English for staff review is an AI feature deferred to wave 2 ([[OWN-DEC-166]]); unreviewed AI translations never reach customers; the original draft and the released English version are both kept.
- Both experiences are tested on private staging. Built by [[TSK-0102]] and [[TSK-0103]].

**Confirmed by [[OWN-DEC-208]] (2026-10-22):** reading 13 is final: the customer side (including the registered customer's dashboard) and the Owner Dashboard are English; worker-side screens, including safety text and the emergency instruction, are available in Spanish. English-only customer content was retained again in round 14 ([[OWN-DEC-212]]).
