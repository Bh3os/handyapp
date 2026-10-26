---
id: HH-PRIV-02
type: requirement
title: "Documentation, customer sharing and marketing publication are separate permissions"
status: active
priority: P0
area: privacy
links:
  decided_by: ["[[OWN-DEC-109]]", "[[OWN-DEC-113]]", "[[OWN-DEC-50]]"]
  depends_on: ["[[HH-DATA-07]]"]
  uses: ["[[ENT-Photo]]", "[[ENT-ConsentPreference]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T57]]"]
  part_of: ["[[C09]]", "[[C11]]"]
source: "guide 25.2 HH-PRIV-02"
---
- Job documentation (internal photos), customer sharing and marketing publication are three different permissions.
- Publication permission is recorded per asset, purpose, channel and notice version ([[ENT-ConsentPreference]]), only with the customer's evidenced consent; sharing with the customer never implies it.
- Withdrawal stops new use at once and opens a review of copies already published; the platform never promises deletion from every third-party copy.

**Limitation (owner input; reviewer: Owner):** The publication notice is NOT CONFIGURED (`media.publication_notice`, [[OQ-FIELD-PHOTO-DETAILS]]): no marketing or website photo permission can be recorded until the owner supplies it.
