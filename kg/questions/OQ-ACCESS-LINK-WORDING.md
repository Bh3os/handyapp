---
id: OQ-ACCESS-LINK-WORDING
type: question
title: Wording of the automatic secure project-access message
status: open
area: messaging
links:
  related: ["[[OQ-ACCESS-RECOVERY]]", "[[OWN-DEC-97]]", "[[OWN-DEC-95]]", "[[HH-INT-21]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[OQ-RECEIPT-EMAIL-WORDING]]", "[[TSK-0034]]"]
source: "TSK-0034 (2026-10-21): OWN-DEC-97 says secure project-access instructions are sent automatically, not their text"
---
**Question:** which exact email subject and body, and which text message, should the automatic secure access message (`project.access_link`, [[FACT-AUTOMATIC-MESSAGES]] #3) use?

- **Who answers:** the owner (approve a wording, as for the code message in [[OWN-DEC-150]]).
- **Known:** [[OWN-DEC-97]] decides that the instructions are sent automatically when the request is saved and that private information shows only after contact verification; [[FACT-AUTOMATIC-MESSAGES]] says automatic bodies carry no private details and no amounts. The one value the software fills in at send time is `{accessLink}`: `<public site>/access#<token>`, a single-project link that opens nothing by itself (the page asks for Open, then a one-time code). It goes by email, and by text as well when the request gave the SMS opt-in.
- **PROPOSED wording for the owner to approve or change (not used by the software):** email subject "View your HandyHub request"; email body "Use this secure link to view your HandyHub request. We'll send you a one-time code before showing anything. {accessLink} If you did not send a request to HandyHub, you can ignore this message."; text "HandyHub: view your request securely. We'll send a one-time code first. {accessLink}".
- **Until answered:** no version of the `project.access_link` template is released. The automation still runs once per saved request and records each delivery as failed with `template_not_configured`; staff see one delivery issue per destination with Retry, and the request and its access grant stay saved. Nothing is shown as sent. Guests can still open the project from the receipt (View My Request after entering a code there).
- **Until answered (TSK-0035):** asking for a new link on the recovery page answers NOT CONFIGURED for every visitor alike (no grant is issued and nothing claims a link is on its way); see [[OQ-ACCESS-RECOVERY]].
