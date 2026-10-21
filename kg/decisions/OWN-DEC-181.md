---
id: OWN-DEC-181
type: decision
title: "No manual accessibility test before launch: screen-reader and device checks stay UNVERIFIED; launch as soon as it is safe"
status: active
area: a11y
links:
  related: ["[[OWN-DEC-85]]", "[[HH-A11Y-01]]", "[[OWN-DEC-191]]"]
source: "owner answers 2026-10-21 R8-Q4"
---
Owner answer (round 8, question 4), option chosen "Skip, keep unverified", with an ASAP launch strategy:

> Choose **Skip, keep unverified**, with an ASAP launch strategy.
>
> My priority is to launch HandyHub as soon as possible without compromising critical security, safety, payment integrity, or essential customer functionality.
>
> I cannot personally conduct manual accessibility testing, and I do not want the entire website development process to remain blocked while waiting to hire a tester.
>
> Implement the following:
> 1. Complete all feasible automated accessibility checks using Playwright, axe-core, and Lighthouse.
> 2. Use WCAG 2.2 Level AA as the technical accessibility target.
> 3. Fix all known critical accessibility barriers before enabling affected features for real customers.
> 4. Perform code-based and automated keyboard accessibility checks for navigation, forms, dialogs, scheduling, and payments.
> 5. Keep real screen-reader and physical-device testing marked as `UNVERIFIED`. Never claim these tests were performed.
> 6. Do not claim full WCAG or ADA compliance based solely on automated tests.
> 7. Provide an accessible alternative contact method for customers who cannot complete a website workflow.
> 8. Ensure customer requests, estimates, payments, accounts, and security-sensitive workflows pass their required functional and security tests.
> 9. Deploy all completed and validated functionality to private staging immediately.
> 10. Prepare production deployment without requesting unnecessary approvals or reopening previously resolved business decisions.
> 11. Do not allow unrelated unfinished features or manual accessibility testing to block safe, independently usable functionality.
> 12. Identify any remaining accessibility risks and create a prioritized post-launch testing and remediation plan.
> 13. If critical accessibility, security, or transaction-processing issues remain, disable the affected feature or hold production launch until resolved.
> 14. Provide the final production-readiness report and exact remaining blockers.
>
> I authorize you to complete the implementation and staging deployment without further routine approval requests.
>
> Prioritize a safe, functional launch over nonessential features and cosmetic improvements. Do not invent test results or mark unverified requirements as passed.

Effect:
- Nobody tests with a real screen reader or physical devices before launch; those checks stay recorded as UNVERIFIED and are never claimed as done ([[OWN-DEC-85]]).
- All feasible automated checks run (Playwright, axe-core and Lighthouse) against WCAG 2.2 AA, with code-based and automated keyboard checks of navigation, forms, dialogs, scheduling and payments; known critical barriers are fixed before the affected feature is enabled for real customers; no full WCAG or ADA compliance is claimed.
- An accessible alternative contact method is offered for customers who cannot complete a website workflow. RISK: the public phone and email are still placeholders ([[FACT-PUBLIC-CONTACT]]).
- Requests, estimates, payments, accounts and security-sensitive workflows must pass their functional and security tests; validated work goes to private staging immediately; production is prepared without unnecessary approvals or reopening settled decisions; unrelated unfinished features and the manual test do not block safe, independently usable functionality; a critical accessibility, security or payment issue disables the affected feature or holds the launch.
- A prioritized post-launch accessibility testing and remediation plan and a production-readiness report with the exact blockers are delivered; no test result is invented.
- Answers [[OQ-A11Y-MANUAL-TEST]]. Built by [[TSK-0104]].
