---
id: OQ-STAFF-AMENDMENT-DETAILS
type: question
title: The reactivation, cash-collection training and owner-override details no decision gives
status: open
area: staff
links:
  related: ["[[OWN-DEC-200]]", "[[OWN-DEC-202]]", "[[HH-STAFF-02]]", "[[HH-STAFF-03]]", "[[HH-FIN-11]]", "[[ROLE-MATRIX]]", "[[TSK-0151]]", "[[OQ-CASH-CHECK-DETAILS]]"]
source: "TSK-0151 (2026-10-24): OWN-DEC-200 H1, H3, H4 and H7 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of reactivation, cash-collection training and owner overrides?

- **Who answers:** the owner.
- **Decided, in use:** offboarding revokes every session and invalidates previous credentials; reactivation sends a single-use reset link, needs a new authenticator and the Owner's permission review, and never restores outdated access by itself; disabled employees keep their role history ([[OWN-DEC-200]] H1, H3, [[OWN-DEC-202]]). Cash collection needs an explicit Owner authorization for a trained Worker; the Worker role alone is not enough (H4). The Owner may resolve a discretionary operational issue, such as a working-hours or equipment flag, with a recorded reason; no general override waives a mandatory safety, legal, licensing, qualification or employee-protection restriction (H7, [[RULE-SAFETY-GATES]]).
- **PROPOSED, in use on private staging:**
  - **Reactivation.** Re-enabling ends every role and permission the account still held. They are ended by the Owner who re-enables it and kept as history. Each one is listed in a permission review, which waits in Owner Decisions as "Permission review" until every one is restored or declined.
    - Until then the person can set a password and enrol an authenticator, but reaches no staff screen.
    - Restoring is a new grant that names the earlier one: Owner only, with a fresh sign-in and a reason, never for oneself.
    - Declining is protective: no fresh sign-in, and the reason is optional.
    - Giving the same role directly while the review is open counts as restoring it.
    - The last role cannot be declined while the person holds none: give a role, or disable the account instead.
    - Disabling the account again closes the review. Undecided items stay undecided, as history.
    - Accounts re-enabled before this change keep what the Owner left them.
  - **Cash-collection training.** The collect grant records the date the worker completed the training (not after today, in the business time zone) and what it covered, up to 2,000 characters. The staff record shows it.
    - Collect grants made before this change without a training record were ended; the Owner grants them again with the training.
    - Restoring an earlier collect grant in a permission review asks for the training again; the earlier record is shown.
  - **Owner overrides.** Each restriction an override could be asked to waive is classified. Anything not listed is treated as mandatory.
    - Working-hours and equipment flags are discretionary.
    - Approved time off is employee protection.
    - A disabled account is legal: the person no longer works for HandyHub.
    - The Start Work gate and critical holds are safety.
    - Licensed-trade and permit holds are licensing.
    - A qualified reviewer of a hazard is qualification.
  - **Dismissing a flag.** The Owner dismisses a discretionary flag from the visit record ("Keep the appointment as it is"), with a reason of up to 2,000 characters. The action sits in the availability row of [[ROLE-MATRIX]].
    - The dismissal removes every open flag of that cause on the reservation, and the visit's queue item updates or resolves.
    - Nothing else changes: the appointment, the Start Work gate and any hold stay as they are.
    - A later availability change that flags the appointment again is a new flag.
    - Dismissed flags are no longer shown as flags; the dismissal, its reason and who made it are kept and audited.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
