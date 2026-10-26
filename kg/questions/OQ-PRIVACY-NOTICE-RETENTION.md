---
id: OQ-PRIVACY-NOTICE-RETENTION
type: question
title: The privacy notice's retention list leaves out the periods of OWN-DEC-177
status: open
area: privacy
links:
  related: ["[[HH-PRIV-04]]", "[[HH-PRIV-01]]", "[[OWN-DEC-177]]", "[[FACT-RETENTION-SCHEDULE]]", "[[OQ-ATTORNEY-PRIVACY]]", "[[OQ-RETENTION-REVIEW]]", "[[OQ-RETENTION-DEFAULTS-DETAILS]]", "[[HH-AUD-02]]", "[[TSK-0110]]"]
source: "TSK-0110 (2026-10-26): contract review of the published privacy notice (privacy-notice-1, `legal.privacy.retention.*`) against the configured retention periods"
---
**Question:** should the privacy notice name the retention periods the owner decided on 2026-10-21, and in which words?

- **The difference.** Privacy notice v1 lists how long each kind of record is kept (requests, estimates, customer and property details, accepted agreements, financial, operational and safety records, access details, sessions and links, audit records). The provisional defaults of [[OWN-DEC-177]], configured and applied since [[TSK-0138]] (`retention.consent_records`, `retention.technical_logs`, `retention.settings_history`), are not in it: consent records (5 years after their last relevant use) and technical logs (90 days). The notice mentions security and reliability logs without a period and says nothing of how long consent records are kept.
- **Not resolved by choosing one.** The software applies the configured periods; the published notice was not changed, because customer legal wording needs the owner's and the attorney's approval ([[OQ-ATTORNEY-PRIVACY]]) and the periods themselves wait for the CPA and the attorney ([[OQ-RETENTION-REVIEW]]).
- **Who answers:** the owner with the attorney.
- **Until answered:** privacy notice v1 stays published as drafted, marked as a draft not reviewed by an attorney; the configured retention periods keep applying, and nothing is deleted without the Owner's review.
