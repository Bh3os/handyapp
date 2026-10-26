---
id: MAP-BUSINESS-RULES-REGISTRY
type: map
title: "Business Rules Registry: every final owner rule with its decision, tasks and implementation status"
status: active
---
The registry the owner asked for in round 14 (2026-10-22): every final owner rule from the 2026-10-21 Rules Review (A1 to J2), the other owner decisions of 2026-10-21 (OWN-DEC-151 to 191) and the final decisions of 2026-10-22 (OWN-DEC-202 to 212, including the 13 readings of [[OQ-READINGS-2026-10-21]] with their amendments). Hand-maintained (not written by `node tools/kg.mjs maps`): update the Implementation column when a task changes status.

- **Status:** final = an active, owner-approved decision. The rule text is a short summary; the decision node holds the owner's wording.
- **Implementation:** from the task statuses (snapshot 2026-10-22): built = every listed task done; in progress = some done or doing; todo = none done yet. "Built (as reviewed on staging)" rules were approved as built; [[TSK-0153]] removes their PROPOSED flags in configuration and screens.

## Rules Review A1 to J2 (2026-10-21)

| Rule | Decision | Status | Tasks | Implementation |
| --- | --- | --- | --- | --- |
| A1 Intake review holds stay mandatory; only an Owner-authorized hazard-evaluation inspection (qualified person and safety conditions named) can be confirmed while the hold stays open | [[OWN-DEC-193]], [[OWN-DEC-208]] | final | [[TSK-0145]] (todo) | todo |
| A2 Estimate visits need no approved job; work visits need an approved estimate and job and every confirmation check | [[OWN-DEC-193]] | final | [[TSK-0145]] (todo) | todo |
| A3 Planning or moving a tentative visit is never blocked by holds; only confirming is | [[OWN-DEC-192]] | final | [[TSK-0064]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| A4 Follow-up visits on a completed job only under an existing obligation, warranty, punch list or return-work authorization; new paid work needs an estimate or change order | [[OWN-DEC-193]] | final | [[TSK-0145]] (todo) | todo |
| A5 The customer sees only the cannot-be-confirmed-yet (or deposit-due) message; holds and staff details never shown | [[OWN-DEC-192]] | final | [[TSK-0064]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| A6 Staff see missing items under "Not ready to confirm"; Confirm appears only when nothing blocks | [[OWN-DEC-192]] | final | [[TSK-0064]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| B1 The 24-hour offer period starts at successful publication; publication time and exact expiry recorded | [[OWN-DEC-194]] | final | [[TSK-0145]] (todo) | todo |
| B2 A choice at or after expiry is refused and staff get a queue item to offer new times | [[OWN-DEC-192]] | final | [[TSK-0063]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| B3 Crew capacity protected across all offered windows; unused reservations released on selection; atomic booking | [[OWN-DEC-194]] | final | [[TSK-0145]] (todo) | todo |
| B4 One active offer per visit, no overlapping windows; withdraw or replace only with a recorded reason and a customer notice | [[OWN-DEC-194]] | final | [[TSK-0145]] (todo) | todo |
| B5 Staff may withdraw an open offer with a written reason; holds released | [[OWN-DEC-192]] | final | [[TSK-0063]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| B6 The customer may ask for other times with an optional note (up to 500 characters) | [[OWN-DEC-192]] | final | [[TSK-0063]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| B7 Reviewed service-specific preparation instructions by default; unsafe customer instructions prevented | [[OWN-DEC-194]] | final | [[TSK-0146]] (todo) | todo |
| B8 A window that can no longer be kept is refused and nothing changes | [[OWN-DEC-192]] | final | [[TSK-0063]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| C1 A reason is required for every reschedule, reassignment, cancellation and declined customer request | [[OWN-DEC-192]] | final | [[TSK-0066]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| C2 Every reschedule records who initiated it (customer or HandyHub) and the reason | [[OWN-DEC-195]] | final | [[TSK-0140]] (done) | built |
| C3 24-hour cancellation notice measured from the customer's request to the start of the arrival window | [[OWN-DEC-192]] | final | [[TSK-0066]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| C4 Worker arrived, preparation started, contracted work started and work completed are separate; arrival is not the start of work | [[OWN-DEC-195]] | final | [[TSK-0140]] (done) | built |
| C5 Only a verified deposit counts toward the fee; an uncleared check is never counted | [[OWN-DEC-192]] | final | [[TSK-0066]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| C6 Office processes routine customer-authorized work-visit cancellations within policy; the Owner approves waivers, refunds, disputes and exceptions | [[OWN-DEC-195]] | final | [[TSK-0140]] (done) | built |
| C7 A reassignment keeps the window and reruns every confirmation check | [[OWN-DEC-192]] | final | [[TSK-0066]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| C8 One open customer request per visit at a time | [[OWN-DEC-192]] | final | [[TSK-0066]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| C9 A cancelled visit leaves the job's scheduling task open | [[OWN-DEC-192]] | final | [[TSK-0066]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| D1 New or materially changed hazards, SOPs, restrictions, site access or scope require worker re-review and acknowledgment before continuing | [[OWN-DEC-196]] | final | [[TSK-0147]] (todo), [[TSK-0072]] (todo) | todo |
| D2 Packets from the latest authorized information; prints carry revision, generation time, job reference and an outdated-copy notice | [[OWN-DEC-196]] | final | [[TSK-0147]] (todo), [[TSK-0073]] (todo) | todo |
| D3 Permissions, rate limits and privacy on packet prints; no access codes or unnecessary private data | [[OWN-DEC-196]] | final | [[TSK-0147]] (todo) | todo |
| D4 Earlier photos in the packet are internal or customer-shared ones, through 5-minute secure links | [[OWN-DEC-192]] | final | [[TSK-0069]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| D5 The directions button opens a maps app; nothing is sent until tapped | [[OWN-DEC-192]] | final | [[TSK-0069]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| D6 Packet scope shows description, quantity and unit only; never a price | [[OWN-DEC-192]] | final | [[TSK-0069]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| E1 Staff confirm a question does not ask the customer to inspect a hazardous area | [[OWN-DEC-192]] | final | [[TSK-0051]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| E2 "I'm not sure" offered for any appropriate question, not only measurements | [[OWN-DEC-197]] | final | [[TSK-0148]] (todo) | todo |
| E3 A reply answers its question; the request returns to review once every question is answered | [[OWN-DEC-192]] | final | [[TSK-0051]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| E4 "Closed—no response" 24 hours after the single reminder was actually sent; not after a failed delivery, a reply, an appointment, accepted work or a payment | [[OWN-DEC-197]], [[OWN-DEC-208]] | final | [[TSK-0148]] (todo), [[TSK-0121]] (todo) | todo |
| E5 The 30-day reopen period stays; afterwards an authorized reopen or a new request | [[OWN-DEC-197]] | final | [[TSK-0148]] (todo) | todo |
| E6 Reply and message limits: 5,000 characters; 30 reply-photo uploads and 60 portal messages per network per hour | [[OWN-DEC-192]] | final | [[TSK-0051]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| F1 Passwordless sign-in and guest access stay; projects never join an account on an unverified contact match | [[OWN-DEC-198]] | final | [[TSK-0149]] (todo), [[TSK-0124]] (todo) | todo |
| F2 Device sessions independent; a security event can revoke every session of the account | [[OWN-DEC-198]] | final | [[TSK-0149]] (todo) | todo |
| F3 Sign-in email change needs recent authentication and a verified new address; the old address is notified | [[OWN-DEC-198]] | final | [[TSK-0149]] (todo), [[TSK-0120]] (todo) | todo |
| F4 Phone recovery only with a verified phone and an available text channel; a secure alternative otherwise | [[OWN-DEC-198]] | final | [[TSK-0149]] (todo) | todo |
| F5 Project links valid 24 hours; rate limits with secure recovery; staff-revoked access never restored on request | [[OWN-DEC-198]] | final | [[TSK-0149]] (todo) | todo |
| F6 No account or project enumeration; links only to verified, authorized contacts | [[OWN-DEC-198]] | final | [[TSK-0149]] (todo) | todo |
| F7 An open project page refreshes every 30 seconds (paused while hidden) and on Refresh | [[OWN-DEC-192]], [[OWN-DEC-198]] | final | [[TSK-0034]] (done), [[TSK-0035]] (done), [[TSK-0036]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| G1 Customer portal wording, approved once checked against actual behaviour | [[OWN-DEC-199]] | final | [[TSK-0150]] (todo) | todo |
| G2 Appointment wording, approved once checked against actual behaviour | [[OWN-DEC-199]] | final | [[TSK-0150]] (todo) | todo |
| H1 The app's own email and password sign-in with MFA mandatory for every active staff account; immediate offboarding; reactivation by secure link and Owner permission review; no ZITADEL | [[OWN-DEC-200]], [[OWN-DEC-202]] | final | [[TSK-0151]] (todo), [[TSK-0154]] (todo) | todo |
| H2 The Owner cannot disable their own account; the last active Owner is never removed | [[OWN-DEC-192]] | final | [[TSK-0097]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| H3 Role history kept; reactivation never restores outdated access without the Owner | [[OWN-DEC-200]] | final | [[TSK-0151]] (todo) | todo |
| H4 Cash collection needs an explicit, recorded grant to a trained Worker | [[OWN-DEC-200]] | final | [[TSK-0151]] (todo) | todo |
| H5 A disabled worker's upcoming appointments and offers are flagged, never cancelled automatically | [[OWN-DEC-192]] | final | [[TSK-0097]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| H6 Requests still assigned to a disabled person appear in the queue for reassignment | [[OWN-DEC-192]] | final | [[TSK-0097]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| H7 Owner overrides of discretionary operational flags need a reason; mandatory restrictions are never waived | [[OWN-DEC-200]] | final | [[TSK-0151]] (todo) | todo |
| H8 Spanish role names: Propietario, Oficina / Despacho, Estimador, Trabajador | [[OWN-DEC-192]] | final | [[TSK-0097]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| H9 Sign-in audit entries visible to the Owner only; customers shown without contact details | [[OWN-DEC-192]] | final | [[TSK-0098]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| I1 Identity checks proportionate to the privacy request's risk | [[OWN-DEC-201]] | final | [[TSK-0152]] (todo) | todo |
| I2 Exports hold the requester's data; protected third-party and restricted records excluded or redacted | [[OWN-DEC-201]] | final | [[TSK-0152]] (todo) | todo |
| I3 Correction history kept; approval, accounting and audit records never silently rewritten | [[OWN-DEC-201]] | final | [[TSK-0152]] (todo) | todo |
| I4 Accounting checks before deletion; unresolved discrepancies escalated | [[OWN-DEC-201]] | final | [[TSK-0152]] (todo) | todo |
| I5 The staging data inventory and retention mappings audited before any destructive production deletion | [[OWN-DEC-201]] | final | [[TSK-0152]] (todo) | todo |
| J1 The week view runs Monday to Sunday | [[OWN-DEC-192]] | final | [[TSK-0065]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |
| J2 A worker with no working hours shows 0 free minutes; the board never assumes hours | [[OWN-DEC-192]] | final | [[TSK-0065]] (done), [[TSK-0153]] (todo) | built (as reviewed on staging); PROPOSED flags removed by TSK-0153: todo |

## Other owner decisions of 2026-10-21 (rounds 1 to 11)

| Rule | Decision | Status | Tasks | Implementation |
| --- | --- | --- | --- | --- |
| Customer and staff message wording: the 21 templates, the global design and the variable registry | [[OWN-DEC-151]], amended or confirmed by [[OWN-DEC-209]] | final | [[TSK-0119]] (todo), [[TSK-0120]] (todo) | todo |
| Message delivery: routine transactional messages send automatically; owner-released sensitive notices; status model, outbox, tests and staging | [[OWN-DEC-152]] | final | [[TSK-0119]] (todo), [[TSK-0120]] (todo), [[TSK-0077]] (todo), [[TSK-0082]] (todo), [[TSK-0084]] (todo), [[TSK-0085]] (todo), [[TSK-0087]] (todo), [[TSK-0092]] (todo) | todo |
| Routine reminders send automatically: one 3-day estimate reminder, one 3-day question reminder, the 24-hour appointment reminder | [[OWN-DEC-153]], amended or confirmed by [[OWN-DEC-197]], [[OWN-DEC-208]] | final | [[TSK-0121]] (todo) | todo |
| Staff replies: shown in the portal and emailed at once; texts wait for the recipient's permitted local hours | [[OWN-DEC-154]], amended or confirmed by [[OWN-DEC-207]] | final | [[TSK-0122]] (todo) | todo |
| Approval confirmation: link only, with an immutable approved-estimate PDF kept in the project | [[OWN-DEC-155]] | final | [[TSK-0120]] (todo), [[TSK-0058]] (done) | in progress |
| Automatic notice when work-appointment windows are published; separate estimate-visit and work-appointment workflows | [[OWN-DEC-156]] | final | [[TSK-0120]] (todo) | todo |
| Service-quality follow-up 48 hours after every completed job, released by staff | [[OWN-DEC-157]] | final | [[TSK-0092]] (todo) | todo |
| Messages may show the customer's first name and reference numbers; never amounts, addresses, codes or tokens | [[OWN-DEC-158]], amended or confirmed by [[OWN-DEC-208]] | final | [[TSK-0119]] (todo) | todo |
| Time zones: business time America/Kentucky/Louisville; appointments in the property's Eastern or Central zone | [[OWN-DEC-159]] | final | [[TSK-0123]] (todo) | todo |
| Guest access links last 24 hours; registered customers get a permanent dashboard; verified guest-to-account claiming | [[OWN-DEC-160]], amended or confirmed by [[OWN-DEC-208]] | final | [[TSK-0124]] (todo) | todo |
| Late cancellation of a work visit: a deposit under $50.00 is kept and nothing more is invoiced | [[OWN-DEC-161]] | final | [[TSK-0140]] (done), [[TSK-0089]] (todo) | in progress |
| Customer side English only; staff side in Spanish for Spanish-speaking employees | [[OWN-DEC-162]], amended or confirmed by [[OWN-DEC-208]] | final | [[TSK-0102]] (todo), [[TSK-0103]] (todo) | todo |
| Estimate visits are never charged, even when cancelled late | [[OWN-DEC-163]], amended or confirmed by [[OWN-DEC-208]] | final | [[TSK-0140]] (done) | built |
| Audit log: append-only during retention; owner-authorized deletion after 7 years only through a dedicated retention workflow | [[OWN-DEC-164]] | final | [[TSK-0135]] (todo) | todo |
| Discounts: 10% for service members, veterans and military spouses, seniors 60+ and returning customers; staff verify; one per job | [[OWN-DEC-165]] | final | [[TSK-0125]] (todo) | todo |
| AI translation of Spanish staff drafts deferred to wave 2 | [[OWN-DEC-166]], amended or confirmed by [[OWN-DEC-211]] | final | [[TSK-0117]] (todo) | todo |
| Three site checks at first-visit confirmation: verified address, authorized site contact, service-area coverage | [[OWN-DEC-167]] | final | [[TSK-0126]] (todo) | todo |
| Change orders are valid 7 days after publication | [[OWN-DEC-168]] | final | [[TSK-0081]] (todo), [[TSK-0082]] (todo) | todo |
| After acceptance every contractual change is a change order; the accepted estimate is immutable | [[OWN-DEC-169]], amended or confirmed by [[OWN-DEC-203]] | final | [[TSK-0081]] (todo), [[TSK-0082]] (todo) | todo |
| Preferred time windows: Mornings 8–12, Afternoons 12–5, Evenings 5–10 | [[OWN-DEC-170]] | final | [[TSK-0139]] (todo) | todo |
| Worker data access: first name and the address on the visit day only; owner-authorized extensions | [[OWN-DEC-171]] | final | [[TSK-0128]] (todo) | todo |
| Escalation: owner first, 911 immediately for emergencies; Call Owner and Call 911 in every job packet | [[OWN-DEC-172]], amended or confirmed by [[OWN-DEC-208]] | final | [[TSK-0129]] (todo), [[TSK-0077]] (todo) | todo |
| Owner approval before publishing estimates and change orders over $2,500.00 (configurable) | [[OWN-DEC-173]], amended or confirmed by [[OWN-DEC-204]] | final | [[TSK-0130]] (todo), [[TSK-0082]] (todo) | todo |
| PROPOSED rules already built: a summary page for the owner first | [[OWN-DEC-174]] | final | — (answered by the Rules Review page, [[OWN-DEC-192]]) | — |
| Privacy requests: acknowledged at once and substantively within 3 business days; internal target 30 days | [[OWN-DEC-175]], amended or confirmed by [[OWN-DEC-205]] | final | [[TSK-0136]] (todo) | todo |
| Erasing a request that never became a job keeps only its reference, dates and final status | [[OWN-DEC-176]] | final | [[TSK-0137]] (todo) | todo |
| Provisional retention defaults for staff accounts, consent records, settings history, technical logs and expired links | [[OWN-DEC-177]] | final | [[TSK-0138]] (todo) | todo |
| Phone verification: a separate SMS opt-in for verification codes offered on the receipt | [[OWN-DEC-178]] | final | [[TSK-0134]] (todo) | todo |
| Service-area ZIP dataset and the SERVED / EDGE / OUTSIDE / UNKNOWN coverage outcomes | [[OWN-DEC-179]], amended or confirmed by [[OWN-DEC-206]] | final | [[TSK-0127]] (todo) | todo |
| The 26 service pages and their care notes are approved for publication once they pass the quality review | [[OWN-DEC-180]] | final | [[TSK-0132]] (todo) | todo |
| No manual accessibility test before launch: screen-reader and device checks stay UNVERIFIED; launch as soon as it is safe | [[OWN-DEC-181]] | final | [[TSK-0104]] (todo) | todo |
| Payment handles are not ready yet | [[OWN-DEC-182]] | final | [[TSK-0087]] (todo), [[TSK-0111]] (todo) | todo |
| The business mailing address is given and is entered in Business settings, not in the repository | [[OWN-DEC-183]] | final | [[TSK-0144]] (todo) | todo |
| The domain handyhub247.com is not purchased yet | [[OWN-DEC-184]] | final | [[TSK-0111]] (todo), [[TSK-0133]] (todo) | todo |
| Production hosting: the cheapest paid setup that works | [[OWN-DEC-185]] | final | [[TSK-0111]] (todo) | todo |
| An attorney, a CPA, an insurance broker and a safety reviewer are available; one review packet for each | [[OWN-DEC-186]] | final | [[TSK-0143]] (todo) | todo |
| Estimate terms v1.0 approved by the owner | [[OWN-DEC-187]] | final | [[TSK-0144]] (todo) | todo |
| Subcontractors are paid outside the app | [[OWN-DEC-188]], amended or confirmed by [[OWN-DEC-208]] | final | [[TSK-0095]] (todo), [[TSK-0131]] (todo) | todo |
| Job costing: gross margin per job with an advisory flag below 30% | [[OWN-DEC-189]] | final | [[TSK-0131]] (todo) | todo |
| A2P 10DLC: prepare the complete registration now; SMS consent at the request form and on the receipt | [[OWN-DEC-190]] | final | [[TSK-0133]] (todo), [[TSK-0134]] (todo) | todo |
| Launch in three phases: Owner Acceptance Testing on staging, invited customers, public; staging-only Reset Test Data | [[OWN-DEC-191]], amended or confirmed by [[OWN-DEC-212]] | final | [[TSK-0141]] (todo), [[TSK-0142]] (todo), [[TSK-0111]] (todo) | todo |

## Final decisions of 2026-10-22 (rounds 13 and 14)

| Rule | Decision | Status | Tasks | Implementation |
| --- | --- | --- | --- | --- |
| Staff authentication final: the app's own email and password with MFA mandatory for every active staff account; immediate offboarding; controlled reactivation; no ZITADEL | [[OWN-DEC-202]] | final | [[TSK-0154]] (todo), [[TSK-0151]] (todo) | todo |
| Credit change orders reduce the effective contract total: positive-magnitude credit lines with a negative financial effect; charge lines stay nonnegative | [[OWN-DEC-203]] | final | [[TSK-0081]] (todo), [[TSK-0082]] (todo), [[TSK-0085]] (todo), [[TSK-0089]] (todo) | todo |
| Owner financial approval final: effective contract value plus proposed changes, splitting detected across the project history, substance over document type, audited reasons | [[OWN-DEC-204]] | final | [[TSK-0130]] (todo), [[TSK-0082]] (todo), [[TSK-0096]] (todo) | todo |
| Business days: Monday to Friday excluding the 11 US federal holidays with observed dates, as the configurable internal calendar; never overrides legal deadlines | [[OWN-DEC-205]] | final | [[TSK-0136]] (todo), [[TSK-0096]] (todo) | todo |
| ZIP coverage final: four outcomes, but a ZIP-only result is preliminary; staff verify the full address and county before eligibility and the first appointment | [[OWN-DEC-206]] | final | [[TSK-0127]] (todo), [[TSK-0126]] (todo) | todo |
| SMS time zone final: the recipient's verified zone; unknown zone falls back to 9 AM–9 PM Eastern for non-urgent texts; authentication codes never wait in the reminder queue | [[OWN-DEC-207]] | final | [[TSK-0122]] (todo), [[TSK-0123]] (todo) | todo |
| Readings 2, 3, 9, 10, 11, 12 and 13 approved as written: hazard-evaluation inspection, Closed—no response, free-estimates wording, owner-unreachable pause with 911 always, subcontractor cost, greeting, English customer side | [[OWN-DEC-208]] | final | [[TSK-0145]] (todo), [[TSK-0121]] (todo), [[TSK-0148]] (todo), [[TSK-0129]] (todo), [[TSK-0131]] (todo), [[TSK-0119]] (todo), [[TSK-0102]] (todo), [[TSK-0103]] (todo) | todo |
| Seven more automatic message templates approved (28 in all): verification code, question notice, estimate ready, invoice ready, not a fit, appointment changed, on the way | [[OWN-DEC-209]] | final | [[TSK-0119]] (todo), [[TSK-0120]] (todo) | todo |
| Unpaid invoices: automatic reminders 3 and 7 calendar days after the due date, once each; stop on payment, dispute, payment plan, refund or credit review, or collection hold | [[OWN-DEC-210]] | final | [[TSK-0091]] (todo), [[TSK-0142]] (todo) | todo |
| Spanish-speaking workers write notes and proposed replies in Spanish; Owner or Office reviews them and sends the customer an approved English message | [[OWN-DEC-211]] | final | [[TSK-0155]] (todo), [[TSK-0117]] (todo) | todo |
| Round 14 delivery rules: coordinated parallel work, merge checks beyond CI, protected staging and Owner Acceptance Testing before inviting customers, no claimed professional reviews | [[OWN-DEC-212]] | final | [[TSK-0142]] (todo), [[TSK-0111]] (todo) | todo |
