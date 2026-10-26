---
id: OQ-A11Y-DETAILS
type: question
title: The accessibility checks, thresholds and post-launch plan no decision gives
status: open
area: a11y
links:
  related: ["[[HH-A11Y-01]]", "[[HH-A11Y-02]]", "[[HH-A11Y-03]]", "[[T69]]", "[[OWN-DEC-85]]", "[[OWN-DEC-181]]", "[[FACT-PUBLIC-CONTACT]]", "[[TSK-0104]]"]
source: "TSK-0104 (2026-10-26): HH-A11Y-01, HH-A11Y-02, HH-A11Y-03, OWN-DEC-85 and OWN-DEC-181 state the target; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of how accessibility is checked and what is done after launch?

- **Who answers:** the owner.
- **Decided, in use:** WCAG 2.2 AA is the target; testing and fixes are done by AI with automated scans and browser tools; screen-reader and physical-device checks stay UNVERIFIED and are never claimed; no full WCAG or ADA conformance is claimed; Lighthouse joins the automated checks; a critical barrier disables the affected feature or holds the launch ([[OWN-DEC-85]], [[OWN-DEC-181]]). The results and the "Not verified" record are in `docs/accessibility-report.md`.
- **PROPOSED, in use on private staging:**
  - **What every e2e screen state is checked for.** axe-core with the WCAG 2.0, 2.1 and 2.2 A and AA tags in the light and the dark theme and at 320 px; no horizontal page scrolling at 320 px (the reflow width, which stands for 400% zoom of a 1280 px window) and with the text at 200% (the root font size doubled at 1280 px, as a browser's text-size setting does); buttons, form controls and button-styled links at least 44 px on the phone ([[HH-A11Y-03]]); no animation or transition longer than 10 ms when reduced motion is asked for. Every spec's `axe()` runs this sweep (`apps/e2e/a11y.ts`), so a new screen state is covered when its spec checks it.
  - **Focus on a screen change.** In the staff app and the portal, an in-app screen change moves focus to the main region (unless the new screen put it inside the main region itself) and the page title names the screen: "<menu name> – HandyHub staff" and "<page heading> – HandyHub customer portal", built from catalog text that already exists.
  - **Focus after an action that removes its own control.** Approve Estimate and Start Work move focus to the answer that replaced the form or the button; a refused staff sign-in or password moves focus to the field to correct; a dialog gives focus back to the control that opened it.
  - **Lighthouse.** Run by hand on the public pages and recorded in the report; it is not in CI (the axe sweep in CI covers the same rules). Adding it to CI is a follow-up.
  - **The accessible alternative contact method ([[OWN-DEC-181]] item 7).** The footer of every public page carries the public phone and email; they are placeholders until the owner provides them ([[FACT-PUBLIC-CONTACT]]), so no alternative contact exists today. A sentence pointing a customer who cannot complete a web form to that contact needs the owner's wording: NOT CONFIGURED.
  - **Post-launch plan, in order.** (1) A person tests the request form, the secure link, the estimate approval, the deposit payment link and the customer account with NVDA on Windows and VoiceOver on iOS; (2) the staff My Day, Start Work, Stop Work and job packet with TalkBack on an Android phone and VoiceOver on an iPhone, outdoors, with gloves where the crew uses them; (3) the scheduling board, the estimate builder and the Owner screens with JAWS or NVDA; (4) Windows High Contrast (forced colours), Firefox and Safari; (5) switch access and voice control. Each finding is fixed and rechecked, and the report records who tested what.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
