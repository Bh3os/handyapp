---
id: OQ-APPROVAL-RECEIPT-MESSAGE
type: question
title: Wording of the automatic approval receipt message, and whether the PDF is attached
status: open
area: messaging
links:
  related: ["[[OWN-DEC-105]]", "[[HH-EST-12]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[HH-COM-04]]", "[[TSK-0058]]"]
source: "TSK-0058 (2026-10-21): OWN-DEC-105 makes the approval receipt automatic and names its content, not its text"
---
**Question:** which exact subject and body should the automatic approval receipt use (email, and text when the customer gave a number), and should the email attach the receipt PDF or only link to it in the project?

- **Who answers:** the owner (approve a wording, as for the code message in [[OWN-DEC-150]]); the attachment choice also touches privacy ([[HH-COM-04]]: ordinary email and texts carry no amounts or private details).
- **Known:** the receipt PDF is issued once per approval and kept in the project's Documents (TSK-0058): the approved scope and amounts as recorded, the name typed, the time, the fingerprints the approval pinned and the full wording of the estimate terms accepted, marked "TEST — not a real invoice or estimate" outside production. The only value a message template may use is `{projectLink}`, the link into verified project access (no amount).
- **PROPOSED (not used by the software):** no attachment; the message links to the project, where the PDF downloads through a short-lived authorized link. Email subject "Your HandyHub approval receipt"; body "Thank you. Your estimate approval is recorded. Your approval receipt and the estimate terms you accepted are in your project: {projectLink}". Text: "HandyHub: your estimate approval is recorded. View your receipt: {projectLink}".
- **Until answered:** no version of the `approval.receipt` template is released. The message still runs once per approval and records each delivery (email, and text) as failed with `template_not_configured`; staff see one delivery issue per delivery with Retry and the delivery state on the estimate; the approval and its receipt PDF stay as they are. Nothing is shown as sent.
