---
id: OQ-ACCOUNT-CONTACT-NOTICE
type: question
title: The notice to the old email after a customer account's sign-in email changes
status: open
area: identity
links:
  related: ["[[HH-ID-11]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[ENT-CustomerAccount]]", "[[OWN-DEC-150]]", "[[TSK-0036]]"]
source: "TSK-0036 (2026-10-21): HH-ID-11 says a sensitive contact change sends a notice to the old contact value; FACT-AUTOMATIC-MESSAGES does not list that notice and no wording exists"
---
**Question:** should the notice to the old email after a customer account's sign-in email changes send automatically (a fifteenth customer message on the automatic list), and which exact email subject and body should it use?

- **Who answers:** the owner.
- **Known:** [[HH-ID-11]]: "A sensitive contact change sends a notice to the old contact value." [[FACT-AUTOMATIC-MESSAGES]] lists the only customer messages that send without staff release; this notice is not among them, and everything else is a staff-released draft. A staff-released security notice would arrive only after a person released it.
- **What the software does now (TSK-0036):** the message type `account.contact_changed` exists (email; no variables, so it can carry no link, code or account detail), triggered by the committed `customer_account.contact_changed` event and sent only to the old email recorded with the change. Changing a sign-in email requires this notice to be possible: while `account.contact_changed` is not on `messages.automatic` or has no released English email wording, the account page says the change isn't available here yet and the API answers NOT CONFIGURED (503). Nothing changes and nothing claims a notice was sent.
- **PROPOSED wording for the owner to approve or change (not used by the software):** subject "Your HandyHub sign-in email was changed"; body "The email you use to sign in to your HandyHub account was just changed. If you made this change, you don't need to do anything. If you didn't, please contact HandyHub."
- **Until answered:** customer accounts, sign-in, Sign Out, enrollment and recovery through the other verified contact all work; only the sign-in email change waits.
