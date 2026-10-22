# Owner Acceptance Testing (phase 1)

This is your checklist for testing HandyHub on staging before any real customer is invited (TSK-0142; HH-OPS-06,
OWN-DEC-191, OWN-DEC-212, OWN-DEC-210). It walks the customer journey from the estimate request to the project
history. Each step gives the page to open, what to do and what you should see.

**Ground rules for phase 1**

- Staging only, behind the access gate. No real customers, real payments, real customer details or uncontrolled email
  or text.
- Use only the fictional test accounts below (example.test addresses, 555-01xx numbers).
- Nothing in this phase invites anyone or opens anything to the public. The launch-phase switches stay at phase 1
  until you approve the next phase yourself (Section 5).
- Manual accessibility checks (screen reader, physical devices) stay **UNVERIFIED** (OWN-DEC-181). Ticking a step here
  does not change that.

## 1. Before you start (one time)

**Staging address.** `https://handyhub-staging.onrender.com/` (named in the source guide; the staff app is under
`/staff/`). The links below use `<staging>` for that address. Staging must first run this repository (TSK-0112).

**Render settings.** You set these in Render; the repository never holds their values.

- `ACCESS_GATE_USERS`: your tester name and password for the access gate.
- `STAGING_TOOLS=on`: already in `render.yaml`.
- `EMAIL_PROVIDER=log`, and `TEST_EMAIL_DESTINATIONS` listing the six test addresses below (comma separated). Each
  email to one of them is then written to the private service log as `STAGING_EMAIL_LOGGED`. That is where you read
  the invite links and sign-in codes. Nothing is really sent.
- `STAFF_APP_URL=https://handyhub-staging.onrender.com/staff` (for the links in staff emails).
- `MFA_ENCRYPTION_KEY` and `CODE_HASH_KEY` (staff sign-in and customer codes need them).

**Test accounts.** Open `<staging>/staff/dashboard` → **Staging Tools** → **Test accounts** → **Create the test
accounts**. You will be asked to re-enter your password.

| Role                         | Sign-in address              | How you get in                                                        |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| Customer (registered)        | `oat-customer@example.test`  | `<staging>/account`: a one-time code is emailed (read it in the log)  |
| Guest Customer (no account)  | `oat-guest@example.test`     | Type it into the request form; the project link is emailed (log)      |
| Staff (Worker)               | `oat-worker@example.test`    | Invite link emailed (log): set a password, then set up an authenticator |
| Estimator                    | `oat-estimator@example.test` | Same as Worker                                                        |
| Office                       | `oat-office@example.test`    | Same as Worker                                                        |
| Owner                        | `oat-owner@example.test`     | Same as Worker                                                        |

How the credentials reach you privately:

- No password is shown on screen, stored in the repository or written in this document.
- Each staff account gets a single-use invite link by email. You set the password and enrol an authenticator app at
  the first sign-in, because MFA is mandatory (OWN-DEC-202).
- An invite link that expired can be sent again from `<staging>/staff/staff` (password link).
- The Customer is kept through every **Reset Test Data**. The Guest's requests are removed like any test record.
- For the guest form, use a fictional phone number such as `(502) 555-0142`.

**Fresh test data (optional).** **Reset & Create Fresh Test Data** on the same screen creates labelled fictional
records for each stage of the journey. Use it if you want to start from a given stage. See HH-OPS-05.

## 2. How to report a problem

Open a GitHub issue with the **Owner Acceptance Testing issue** template (repository Bh3os/handyapp → Issues → New
issue). Give the step number below, what you did, what you expected and what happened. A screenshot is welcome. Never
paste a password, code, invite link or real personal details. Each reported problem is fixed on a branch, and the
affected tests are run again before you retest.

## 3. The journey checklist

Mark each step **Pass**, **Fail** (report it, Section 2) or **Not available yet**. Steps marked _not built yet_ cannot
be tested until the named task is done.

### A. The customer asks for an estimate

| #   | Open                         | Do                                                                                                       | Expect                                                                                                                         |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A1  | `<staging>/`                 | Pass the access gate with your tester name.                                                              | The home page loads. Contact details show as placeholders until they are configured.                                          |
| A2  | `<staging>/services`         | Open a service page, then **Request this service**.                                                      | The request form opens with that service selected.                                                                             |
| A3  | `<staging>/request`          | As the Guest, fill in the steps with fictional details (`oat-guest@example.test`) and send.              | A receipt with a reference such as `HH-XXXXXXXX`. "What happens next" states only the configured facts.                        |
| A4  | The receipt                  | Verify the email with the code from the log; decline or accept **Create an Account**.                    | The email is shown as verified. Declining changes nothing else.                                                                |
| A5  | The access-link email (log)  | Open the secure project link.                                                                            | The project opens on Overview at `<staging>/portal/p/<reference>`.                                                             |
| A6  | `<staging>/account`          | Sign in as the Customer (`oat-customer@example.test`) with the emailed code.                             | The account page and its projects; **Sign Out** works.                                                                        |

### B. Staff take the request

| #   | Open                                  | Do                                                                                        | Expect                                                                                                    |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| B1  | `<staging>/staff/sign-in`             | Sign in as Office, then as Worker.                                                        | Each role sees only its own menu.                                                                         |
| B2  | `<staging>/staff/queue`               | As Office, open the new request from the queue.                                           | The request with its original answers.                                                                    |
| B3  | `<staging>/staff/requests`            | Qualify the request and choose **Online estimate**, **Estimate visit** or **Ask a question**. | The action is recorded. A question appears in the customer's Messages tab.                                |
| B4  | `<staging>/staff/inbox`               | Reply to the customer.                                                                    | The reply shows in the customer's Messages tab.                                                           |
| B5  | `<staging>/staff/customers`           | Open the customer and the property.                                                       | Contact and property records; access codes are hidden until revealed (audited).                          |

### C. Estimate and approval

| #   | Open                                     | Do                                                                                          | Expect                                                                                                                       |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C1  | `<staging>/staff/estimates`              | As Estimator, write an estimate with a fictional line amount and publish it.                | Published, or sent to you for approval if it is over the Owner approval threshold.                                           |
| C2  | `<staging>/staff/dashboard`              | As Owner, approve or reject a publication that needs your approval.                         | The decision is recorded with your comment; the estimate publishes only after approval.                                      |
| C3  | `<staging>/portal/p/<reference>/documents` | As the customer, open the estimate.                                                       | The exact published version, its terms (when configured) and the TEST marking.                                               |
| C4  | Same page                                | Approve the estimate (a fresh code is asked).                                                | An approval receipt. One job is created; a second approval of the same version is refused.                                  |

### D. Deposit, scheduling and the visit

| #   | Open                               | Do                                                                                    | Expect                                                                                                         |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D1  | The job (from the queue)           | Where a deposit is required, record a test payment as cash (no real payment).         | The deposit shows as paid; scheduling is blocked until then (or until the Owner waives it).                   |
| D2  | `<staging>/staff/schedule`         | Offer appointment windows and confirm the visit.                                      | A visit is confirmed only when every precondition is met (the deposit, any hold).                             |
| D3  | `<staging>/staff/my-day`           | As Worker, open the job packet, acknowledge it and confirm the loadout.               | The packet with its SOP and safety information; the loadout is confirmed.                                     |
| D4  | Same screen                        | Tap **On my way**, **Arrived**, **Finished**.                                         | Each time is recorded; corrections are the Owner's.                                                            |

### E. Work, change orders, invoice, payment and history

| #   | Step                                                              | Status                                                                                                  |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| E1  | Start Work gate and work in progress                              | _Not built yet_ (TSK-0073). The Start Work gate is never bypassed for testing.                           |
| E2  | Change orders                                                     | _Not built yet_ (TSK-0081).                                                                              |
| E3  | Completion, quality checks and walkthrough                        | _Not built yet_ (TSK-0083).                                                                              |
| E4  | Invoice issued after quality review                               | _Not built yet_ (TSK-0085).                                                                              |
| E5  | Payment and payment receipt (Square links, cash, checks)          | _Not built yet_ (TSK-0086, TSK-0087, TSK-0088). Only the deposit test payment of D1 exists.              |
| E6  | Project history in the portal (`<staging>/portal/p/<reference>`) | Test what exists: Overview, Messages, Documents, Photos, Appointments and Payments tabs show the journey so far. |

### F. Unpaid-invoice reminders (OWN-DEC-210)

_Not built yet_ (TSK-0091, which depends on invoices, TSK-0085). When it is built, test each scenario. The expected
outcome comes from OWN-DEC-210.

| #   | Scenario                        | Expected outcome                                                                                               |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| F1  | Unpaid invoice at day 3         | One reminder email 3 calendar days after the due date ("HandyHub \| ..." subject, signed "The HandyHub Team"). |
| F2  | Unpaid invoice at day 7         | One second reminder 7 calendar days after the due date; then "Overdue—owner decision".                         |
| F3  | Payment before the reminder     | No reminder: the status is checked again just before sending.                                                  |
| F4  | Partial payment                 | The sequence stops; it never restarts by itself. Staff confirm the next step.                                  |
| F5  | Disputed invoice                | No automatic reminder.                                                                                         |
| F6  | Approved payment plan           | No automatic reminder.                                                                                         |
| F7  | Revised due date                | Reminders count from the revised date.                                                                         |
| F8  | Voided invoice                  | No reminder.                                                                                                   |
| F9  | Duplicate scheduled events      | Still only one email per invoice and stage.                                                                    |
| F10 | Failed delivery and retry       | The failure is logged and retried; it is never shown as delivered.                                             |

### G. Owner tools

| #   | Open                         | Do                                                                    | Expect                                                                                                    |
| --- | ---------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| G1  | `<staging>/staff/dashboard`  | **Reset Test Data** (type RESET TEST DATA).                           | Counts before, a summary after; staff, configuration and the reusable Customer are kept.                 |
| G2  | `<staging>/staff/settings`   | Look at **Launch phase**.                                             | Phase 1, all three switches Off, and "This is not production".                                            |
| G3  | `<staging>/staff/audit`      | Open the audit log.                                                   | Your sign-ins, approvals, resets and phase changes are listed and cannot be edited or deleted.            |
| G4  | `<staging>/staff/health`     | Open System health.                                                   | Providers that are not set up show NOT CONFIGURED, never "working".                                       |

## 4. Results

| Walk                                    | Date | By  | Result                                                                                          |
| --------------------------------------- | ---- | --- | ----------------------------------------------------------------------------------------------- |
| Claude, on staging                      | —    | —   | **Not done.** Staging does not run this repository yet (TSK-0112). It is walked once it does.    |
| Automated end-to-end suite (ci server)  | —    | CI  | The steps of sections A to D and G each have an end-to-end test in `apps/e2e/tests`.            |
| You (the Owner), on staging             |      |     |                                                                                                 |

The automated suite runs on an isolated ci server, not on staging. It does not replace your walk or the staging walk.

## 5. Launch phases: your switches

Open `<staging>/staff/settings` (in production: the production staff app) → **Launch phase**.

| Phase                         | Invited customers | Public submissions | Search indexing | Starts                                                  |
| ----------------------------- | ----------------- | ------------------ | --------------- | ------------------------------------------------------- |
| 1. Owner Acceptance Testing   | Off               | Off                | Off             | Default on every database                               |
| 2. Invited customers          | On                | Off                | Off             | Only after you approve phase 1, in production           |
| 3. Public launch              | (everyone)        | On                 | On              | Only after you approve phase 2                          |

- Nothing moves a phase by itself. Only you can move it, one step forward, or back to any earlier phase.
- Each move needs your written approval, the typed words shown (for example `APPROVE PHASE 2`) and a fresh sign-in.
  It is recorded with your name, the time and your words, in the configuration history and in the audit log.
- In production the phase decides whether the public request form takes requests and whether search engines may index
  the site. On staging it changes nothing public: the access gate keeps staging closed and unindexed whatever the
  phase. A move there only tests the switch.
- **NOT CONFIGURED: customer invitations.** This build has no way to invite a customer yet. In phase 2 the public
  form therefore takes no request from anyone. Admitting invited customers needs a follow-up task before phase 2 is
  useful.
- Phase 3 still needs the verifications OWN-DEC-191 lists: domain, TLS, sign-in, forms and notifications. Production
  texting waits for A2P 10DLC approval (OWN-DEC-190).
