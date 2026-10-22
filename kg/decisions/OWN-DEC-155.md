---
id: OWN-DEC-155
type: decision
title: "Approval confirmation: link only, with an immutable approved-estimate PDF kept in the project"
status: active
area: approval
links:
  related: ["[[OWN-DEC-105]]", "[[HH-EST-12]]", "[[OWN-DEC-160]]"]
source: "owner answers 2026-10-21 R1-Q2; R2-Q1 (specification section 11)"
---
Owner answer (round 1, question 2, "Approval receipt"), option chosen "Link only":

> Choose **Link only**.
>
> Send the customer an automatic approval confirmation email with a secure link to their project, where they can view and download the approved estimate receipt as a PDF.
>
> Requirements:
> 1. Never attach PDFs containing private project details or pricing to outgoing emails by default.
> 2. Generate an immutable PDF snapshot of the exact approved estimate, including scope, pricing, terms, approval date, and applicable customer acceptance details.
> 3. Preserve the original approved document even if future change orders modify the project.
> 4. Use short-lived, secure, revocable access links.
> 5. Allow customers to request a new secure link or access documents through their account.
> 6. Keep an audit record of the approval, document version, and confirmation email delivery status.
> 7. Automatically send the approval confirmation after a valid approval is recorded, with duplicate-send protection.
> 8. Make the PDF professionally formatted with HandyHub branding.
> 9. Ensure the customer can access their approved documents even after the original email link expires.
>
> Implement and test this workflow before enabling it in production.

Round 2 specification, section 11:

> # 11. DOCUMENT AND APPROVAL SECURITY
>
> The customer approval email must use **Link Only**.
>
> Do not attach the approved estimate PDF by default.
>
> The customer should be able to securely download:
>
> - The exact approved estimate
> - The approval receipt
> - Applicable accepted terms
> - Approved change-order documents
> - Relevant invoices and receipts
>
> Approved estimate versions must remain immutable.
>
> Do not overwrite historical approvals with revised estimates or change orders.
>
> Use expiring access tokens and authenticated access controls as applicable.
>
> Expiring email links must not permanently prevent customers from retrieving their records.
>
> Provide secure reauthentication or link reissuance.
>
> Never expose storage bucket credentials or unrestricted document URLs.

Effect:
- The approval confirmation (MESSAGE 08, [[OWN-DEC-151]]) sends automatically after a valid approval is recorded, once (duplicate-send protection), and carries only a secure link into the project. No PDF with private details or prices is attached by default.
- An immutable, professionally formatted HandyHub PDF snapshot of the exact approved estimate (scope, pricing, terms, approval date and acceptance details) is generated once and kept unchanged even when later change orders modify the project ([[OWN-DEC-169]]).
- Links are short-lived, secure and revocable; the customer can ask for a new link or open the documents through an account, so an expired email link never locks them out of their records ([[OWN-DEC-160]]).
- Recorded: the approval, the document version and the confirmation delivery status.
- Section 11 lists what the customer downloads (approved estimate, approval receipt, accepted terms, approved change orders, invoices and receipts); storage credentials and unrestricted document URLs are never exposed.
- Partly replaces [[OWN-DEC-105]] and [[HH-EST-12]] (the PDF attachment). Answers [[OQ-APPROVAL-RECEIPT-MESSAGE]] with [[OWN-DEC-151]]. Built by [[TSK-0120]] on the receipt of [[TSK-0058]].
