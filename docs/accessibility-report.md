# Accessibility report (2026)

Release evidence for [OWN-DEC-85](../kg/decisions/OWN-DEC-85.md) and [OWN-DEC-181](../kg/decisions/OWN-DEC-181.md):
the automated and browser-based accessibility checks of the public site, the customer portal and the staff app, what
they found, what was fixed, and what no tool here can check. Task: TSK-0104. Requirements: HH-A11Y-01, HH-A11Y-02,
HH-A11Y-03. Acceptance test: T69. The PROPOSED details (thresholds, focus rules, the post-launch plan) are in
[OQ-A11Y-DETAILS](../kg/questions/OQ-A11Y-DETAILS.md).

## Who tested, and what is not claimed

- **AI testing only.** The checks were written and run on 2026-10-26 by an AI agent (Claude, in Claude Code), as
  OWN-DEC-85 decides, with Playwright 1.56.1 driving Chromium (headless), axe-core through `@axe-core/playwright`
  4.13.0, and Lighthouse 13.5.0. No person tested, and no person's test is claimed.
- **No screen reader was used.** Keyboard and browser testing is never reported as screen-reader testing.
- **No conformance claim.** These results do not show full WCAG 2.2 AA or ADA conformance; automated checks find only
  part of the barriers a person meets. See [Not verified](#not-verified).

## How it is checked

Every e2e spec checks the screen states it reaches with one shared sweep (`apps/e2e/a11y.ts`, `expectAccessible`);
the specs' `axe()` helper runs it. So every route and state reachable in e2e (199 tests across the three apps, run in
full twice while fixing) is checked the same way, and a new state is covered as soon as its spec checks it. One sweep
runs, on the page as it is:

| Check | How | Criterion |
| --- | --- | --- |
| axe, light theme | axe-core with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, `wcag22aa` | WCAG 2.2 A and AA rules axe covers |
| axe, dark theme | the colour rules (`color-contrast`, `link-in-text-block`) with `prefers-color-scheme: dark` emulated, after the colour transitions end | 1.4.1, 1.4.3 in both themes |
| 200% text | root font size doubled at 1280 px wide (a browser's text-size setting); the page must not scroll sideways | 1.4.4 |
| 320 px | the viewport at 320 × 640 px (the reflow width, the same as 400% zoom of a 1280 px window); the page must not scroll sideways; axe again at that width | 1.4.10, 2.5.8 |
| 44 px targets | at 320 px, buttons, form controls, button-styled links and disclosure summaries at least 44 × 44 px; inline text links are exempt | HH-A11Y-03 (2.5.8 needs 24 px; axe checks that) |
| Reduced motion | with `prefers-reduced-motion: reduce`, no animation or transition longer than 10 ms (pseudo-elements included) | 2.3.3, HH-A11Y-01 |

Keyboard, focus and announcement checks are written per workflow (below). Each keyboard step presses Tab (or
Shift+Tab) until the control has focus, then checks that a focus indicator is drawn and that the control is not covered
by other content (2.4.7, 2.4.11), and operates it with Enter, Space or the arrow keys. A wide table that scrolls inside
its own box is allowed at 320 px (two-dimensional content); the box is a named region in the tab order. A sandboxed
frame (the staff app's email preview) is left out of axe: it runs no script, and email content is outside this check.

The new specs:

- `apps/e2e/tests/accessibility.spec.ts`: every public page (home, services and all 26 service pages, service areas
  and every county page, the three legal pages, the secure-link and account pages, not found); the request form
  completed with the keyboard alone, each step and error state swept; the secure link and the portal pages.
- `apps/e2e/tests/staff-zz-accessibility.spec.ts`: the staff sign-in pages and their errors, every screen of the
  Owner's menu, search, a request's record and every record it links to, and a dialog.

## Results per workflow

"Pass" means every check above passed on every state the named tests reach, after the fixes listed. Each test is
tagged with the requirement it proves.

| Workflow | Sweep (axe both themes, 320 px, 200% text, targets, motion) | Keyboard and focus | Proving tests |
| --- | --- | --- | --- |
| Public pages | Pass | Pass: skip link moves focus to the main region | `accessibility.spec.ts`, `home`, `services`, `areas`, `legal` |
| Request form | Pass, every step and error state | Pass: completed with the keyboard alone (radio groups with the arrow keys, the date typed); each step's heading takes focus; the error summary takes focus and its links move to the field; the continue dialog keeps focus, and once dismissed focus is on the button that opens it again | `accessibility.spec.ts`, `request*.spec.ts` |
| Secure link and customer account | Pass | Pass: the code field takes focus when a code is sent; the link is opened with the keyboard | `accessibility.spec.ts`, `access-recovery`, `project-access`, `customer-*` |
| Portal workspace and tabs | Pass | Pass: tabs follow the tabs pattern (arrows, Home, End); a tab keeps focus as the page changes; each page is titled | `portal-tabs`, `portal`, `accessibility.spec.ts` |
| Estimate approval | Pass | Pass: options, terms box, name and Approve Estimate with the keyboard alone; focus moves to the answer that replaces the form | `estimate-approval`, `portal-estimate`, `approval-receipt` |
| Deposit and payments (portal) | Pass | Covered by the sweep; the payment link opens Square, outside this site | `deposit-gate`, `staff-invoices` |
| Staff sign-in, password, MFA | Pass | Pass: a refused sign-in or password puts focus on the field to correct | `staff-zz-accessibility`, `staff-auth` |
| Staff shell and menu | Pass | Pass: skip link; a menu entry opens with Enter; a screen change titles the page and moves focus to the main region; Back works | `staff-zz-accessibility`, `staff-shell` |
| Every Owner menu screen and record | Pass | Covered by the sweep | `staff-zz-accessibility` and every `staff-*` spec |
| My Day | Pass | Pass: On my way, Arrived and Finished with the keyboard; focus stays on the next action; what was recorded is announced in a status region | `staff-my-day` |
| Start Work | Pass | Pass: the briefing link, the site check and Start Work with the keyboard; focus moves to the refusal or to "Work started" | `staff-start-work` |
| Scheduling board | Pass | Forms and buttons are the alternative to dragging (OWN-DEC-119); the board's keyboard path has its own test | `staff-board` |
| Dialogs | Pass | Pass: focus moves in and stays in, Escape closes, focus returns to the opener (also when the dialog is removed) | `staff-zz-accessibility`, `request.spec.ts`, `packages/ui/test/focus.test.tsx` |

Lighthouse (accessibility category), run by hand against the built server: see [Lighthouse](#lighthouse).

## What was found and fixed

| Finding | Where | Criterion | Fix | Proving test |
| --- | --- | --- | --- | --- |
| Staff screens scrolled sideways at 320 px and with 200% text: single-column grids grew to their widest content (a long select option, a heading) | Action queue, audit log, retention reviews, and others | 1.4.10, 1.4.4 | Inside the staff main region every implicit grid column is at most its grid's width; queue filters never exceed their row | `staff-zz-accessibility`, `staff-queue`, `staff-retention` |
| A long status badge did not wrap | Audit log, retention reviews | 1.4.10 | Badges wrap (shared component style) | `staff-zz-accessibility` |
| A select or input wider than a 320 px screen | Start Work, the Owner's review of holds | 1.4.10 | Form controls never exceed their column (shared base style) | `staff-start-work`, `staff-site-checks` |
| A wide table's scrolling box could not be reached with the keyboard | Job costs, job margin, labour rates, visit times, packet scope, SOP tables, Owner Dashboard records, estimate and change-order lines | 2.1.1 | New shared `ScrollArea`: a named region in the tab order | `staff-job-costs`, `packages/ui/test/focus.test.tsx` |
| A screen change in the staff app and the portal left focus on the old link and the title unchanged | Staff app, portal | 2.4.2, 2.4.3 | New shared `useRouteFocus`: the title names the screen; focus moves to the main region unless the new screen put it inside | `staff-zz-accessibility`, `accessibility.spec.ts`, unit tests |
| A dialog removed while open did not give focus back | Staff Staging Tools, retention, launch phase | 2.4.3, HH-A11Y-02 | The shared `Dialog` returns focus to its opener when closed or removed | `staff-zz-accessibility`, `packages/ui/test/focus.test.tsx` |
| Pressing Approve Estimate or Start Work removed the focused control: focus fell to the page | Portal estimate, Start Work | 2.4.3 | Focus moves to the answer (approved, started, refused) | `estimate-approval`, `staff-start-work` |
| Dismissing the request form's continue dialog left focus at the top of the page (its opener is replaced while it is open) | Request form | 2.4.3 | Focus moves to "Choose how to continue" | `accessibility.spec.ts` |
| A refused staff sign-in or password left focus on the button; the field error was not read | Staff sign-in, set password | 3.3.1 | Focus moves to the first field with an error (its message is linked) | `staff-zz-accessibility` |
| My Day's recorded tap was not announced | My Day | 4.1.3 | The "On my way at …" line is in a status region | `staff-my-day` |
| Two `main` landmarks on one page | Start Work, the Owner's review, job photos | 1.3.1 | The page sections are sections inside the app's one main region | `staff-start-work` |
| Controls under 44 px | The staff app name link, the skip links, disclosure summaries, narrow "Edit" buttons on the request review, unstyled selects, text areas and file pickers (Start Work, the Owner's review of holds, loadouts) | HH-A11Y-03 | 44 px minimum in the shared base and button styles | every spec (the sweep) |
| Loading and pending spinners kept turning with reduced motion | Every app | 2.3.3, HH-A11Y-01 | The markers stand still with reduced motion; their words say what is happening | every spec (the sweep) |

No contrast violation was found in either theme once colours were measured after the theme transition ended (the
design tokens are checked pair by pair in `packages/ui/test/tokens.test.ts`).

## Lighthouse

Lighthouse 13.5.0, accessibility category only, mobile form factor, run by hand on 2026-10-26 against the built
server with an e2e database (chrome-headless-shell 1228). Lighthouse needs no sign-in, so it covered the pages a visitor
reaches without one:

| Page | Score | Failed audits |
| --- | --- | --- |
| `/` | 100 | none |
| `/services` and one service page | 100 | none |
| `/areas` | 100 | none |
| `/request` | 100 | none |
| `/privacy`, `/terms`, `/sms-terms` | 100 | none |
| `/access`, `/account` | 100 | none |
| `/staff/sign-in` | 100 | none |
| `/portal/` (signed out) | 100 | none |

A second run passed Chromium's dark-mode flags and also scored 100 on every page; whether each page switched to its
dark theme in that run was not confirmed separately, so dark-theme contrast rests on the axe sweep above. Lighthouse's
accessibility audits are axe rules too, so the score repeats, not extends, the sweep; a score of 100 is not a
conformance claim. Lighthouse is not in CI (PROPOSED follow-up in OQ-A11Y-DETAILS).

## Not verified

These checks need a person, assistive technology or hardware that the tools here do not have. They are **UNVERIFIED**
and are never reported as passed (OWN-DEC-85, OWN-DEC-181):

- **Screen readers:** NVDA and JAWS on Windows, VoiceOver on macOS and iOS, TalkBack on Android. The accessibility
  tree (names, roles, states, live regions) is checked by axe and by the tests' role-based queries, which is not the
  same as hearing a screen reader read the page. Limitation: reading order, announcement wording, verbosity and live
  region timing in real screen readers are unknown.
- **Physical devices:** iPhone and Android phones, tablets, the crew's phones outdoors and with gloves. Phone widths
  are emulated in desktop Chromium. Limitation: real touch targets, on-screen keyboards covering fields, OS text
  scaling and zoom gestures are unknown.
- **Switch access and voice control** (Switch Control, Voice Access, Voice Control, Dragon). Limitation: unknown.
- **Other browsers and engines:** Firefox and Safari (WebKit) were not run; only Chromium was.
- **Browser zoom** itself: 200% text is emulated by doubling the root font size and 400% zoom by a 320 px viewport;
  a browser's page zoom and minimum-font-size settings were not used.
- **Windows High Contrast / forced colours** and custom user style sheets.
- **Cognitive and plain-language review** of the wording (owner-approved wording was not changed).
- **Content not reachable in e2e:** real Square payment pages (Square's own site), emailed and texted messages
  (including the staff app's sandboxed email preview), and PDFs (estimates, receipts, invoices): their tagging for
  screen readers is not checked.

RISK: screen-reader and physical-device behaviour stays unverified until a person tests it. The order in which a
person should test after launch is PROPOSED in [OQ-A11Y-DETAILS](../kg/questions/OQ-A11Y-DETAILS.md).

## Remaining risks

- **No accessible alternative contact yet.** OWN-DEC-181 asks for one for customers who cannot complete a website
  workflow. The footer of every public page has the public phone and email, but both are placeholders until the owner
  provides them (FACT-PUBLIC-CONTACT, OWN-DEC-131), and a sentence pointing to them needs the owner's wording (NOT
  CONFIGURED in OQ-A11Y-DETAILS).
- **Lighthouse is not in CI.** The axe sweep in CI covers the same rules; Lighthouse was run by hand (above), on
  the pages reachable without signing in.
- **Suite time.** The sweep makes the serial e2e suite about 40% longer (about 32 minutes locally); the CI job limit
  is raised to 90 minutes and the per-test limit to 90 seconds.
- **States not reached in e2e** are not swept: they are listed by the specs that exist. A new screen needs its spec to
  call `axe()` for the sweep to cover it.
