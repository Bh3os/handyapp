---
id: OWN-DEC-182
type: decision
title: "Payment handles are not ready yet"
status: active
area: payments
links:
  uses: ["[[FACT-PAYMENT-INSTRUCTIONS]]"]
  related: ["[[OWN-DEC-126]]"]
source: "owner answers 2026-10-21 R9-Q1"
---
Owner answer (round 9, question 1, the Zelle, Cash App and Chime details and the check payee): "Not ready yet".

Effect:
- The four labelled placeholders of [[FACT-PAYMENT-INSTRUCTIONS]] stay; they are never shown as usable destinations ([[HH-FIN-10]]).
- [[OQ-PAYMENT-HANDLES]] stays open. RISK: until the owner supplies them, real customers can pay only by the methods actually configured (for example an invoice's Square link); the handles are needed before invited production ([[OWN-DEC-191]]).
