---
title: "13 - Privacy and Data Governance"
doc_id: HH-PLAN-13
status: draft
owner_domain: "Privacy / data responsibility"
expert_skills:
  - business-privacy-data-owner
  - business-it-security-administrator
  - legal-compliance-administrator
human_review:
  - "attorney licensed in KY and/or IN (law applicability, breach notification, notice and consent wording, retention minimums, vendor terms, legal holds)"
  - "CPA (financial and tax record retention, check images)"
  - "employment attorney licensed in KY and/or IN and payroll professional (worker data, monitoring, workforce records)"
  - "licensed insurance broker (insurer notice after a privacy incident, cyber coverage)"
  - "qualified bilingual reviewer (Spanish notices and consent text)"
last_updated: 2026-10-03
related_requirements:
  - REC-002
  - REC-003
  - REC-004
  - REC-005
  - REC-006
  - COM-004
  - NFR-007
  - NFR-009
  - NFR-014
  - AIC-006
---

# 13 - Privacy and Data Governance

> **Status:** Draft - AI-generated planning document, not approved · **Owner/domain:** Privacy / data responsibility · **Last updated:** 2026-10-03
> **Human review required:** Attorney licensed in KY and/or IN (which privacy, breach-notification, marketing and text-message rules apply; every notice, consent and request-response text; retention minimums for contract, consent, safety and privacy records; data-processing terms with vendors; legal holds); CPA (financial and tax record retention; whether check images are required records); employment attorney licensed in KY and/or IN and payroll professional (worker and employee data, any monitoring, workforce record retention); licensed insurance broker (insurer notice after a privacy incident; whether any cyber coverage exists); qualified bilingual reviewer (Spanish notices, consent text and request responses); owner acting as privacy owner OWN-007 (data map, business-need retention values, vendor approvals, privacy requests).
> **Related:** [05 Domain model](05-domain-model.md) · [27 Roles and permissions](27-roles-and-permissions.md) · [32 Website and customer experience](32-website-and-customer-experience.md) · [33 AI and automation governance](33-ai-and-automation-governance.md) · [12 Security threat model](12-security-threat-model.md) · [08 Data model](08-data-model-and-database.md) · [15 DevOps](15-devops-infrastructure.md) · [17 Observability](17-observability-and-operations.md) · [30 Service agreement standards](30-service-agreement-standards.md) · [Requirements spec](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Master prompt](../HandyHub%20Master.md)

## 1. Purpose, scope and evidence

### 1.1 What this document governs

This is the single source of truth for how HandyHub collects, uses, shares, keeps and disposes of personal data. It answers master §5 file 13 ("Data collected", "purpose", "legal/business justification", "consent where required", "photo handling", "marketing consent", "retention", "deletion", "employee access", "admin access", "vendor access", "exports", "backups", "incident response") and the spec's privacy owner duty, OWN-007: "Data minimization, access, retention, customer/photo/marketing consent, vendor review and privacy-request workflow."

It owns:

- the data inventory and data-flow map (Section 3);
- the final sensitivity classes, adopting and amending the classes PROPOSED in [05](05-domain-model.md) §2.4 (Section 2.3), and the retention schedule built on the [05](05-domain-model.md) §2.5 retention classes (Section 7);
- consent policy (Section 4), photo handling (Section 5) and the retention of field access secrets (Section 6);
- retention periods, legal holds, privacy requests and erasure (Sections 7 and 8);
- the REC-005 sensitive-read scope (Section 9.2), the vendor register (Section 10), privacy rules for exports and backups (Sections 11 and 12), privacy incident handling (Section 13) and privacy-notice content (Section 16);
- the open legal-applicability questions for the attorney (Section 14), the AI data rules that [33](33-ai-and-automation-governance.md) hands to this document (Section 15), and the PROPOSED `PRIV-` requirements (Section 17).

Owned elsewhere and linked instead of repeated:

| Topic | Owner document |
|---|---|
| Entity names, attributes, relationships and immutability classes | [05 Domain model](05-domain-model.md) |
| Who may read or change each resource; field classes; note classes; worker access window; step-up levels | [27 Roles and permissions](27-roles-and-permissions.md) |
| Columns, encrypted fields, retention-clock fields, indexes | [08 Data model and database](08-data-model-and-database.md) |
| Encryption design, key custody, session lifetimes, signed-URL lifetime, device baseline, audit tamper evidence | [12 Security threat model](12-security-threat-model.md) |
| Backup mechanics, recovery targets, environments, secrets | [15 DevOps and infrastructure](15-devops-infrastructure.md) |
| Incident severity scale, alert routing, the operational incident record, log hygiene | [17 Observability and operations](17-observability-and-operations.md) |
| Public form fields, analytics implementation, placement of notices on the site | [32 Website and customer experience](32-website-and-customer-experience.md) |
| AI task policies, retrieval broker, redaction filters, decision log, AI provider checklist, automation registry | [33 AI and automation governance](33-ai-and-automation-governance.md) |
| Consent and privacy clauses in customer agreements | [30 Service agreement standards](30-service-agreement-standards.md) |
| SOP wording for photo capture and for credentials and access codes | [31 SOP standard](31-sop-standard.md) |

**Precedence.** Requirement text in the [requirements spec](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) wins. Owner facts recorded 2026-10-02 in the [operating context](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md) bind. Everything else here is a **PROPOSED DECISION** until the owner approves it. This document is not legal advice and does not state that HandyHub complies with any law ("Do not promise legal compliance or substitute boilerplate for actual practices.", [privacy playbook](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-privacy-data-owner/references/playbook.md)). No control described here is implemented; the vault holds no code (owner facts L13 "Custom phased application with AI coding").

### 1.2 Evidence baseline

- **FACT** (spec §10, §11, §15): REC-002 "Every photo must be internal-only or customer-shareable. Default visibility should minimize accidental disclosure." · REC-003 "Customer/property photos used for marketing require separate permission from photos needed to estimate/document work." · REC-004 "Admin can configure/document retention rules by record type while preserving legal/accounting/safety needs; the application should avoid indefinite collection of data without purpose." · REC-005 "Administrative access to sensitive customer, employee, payment or incident records should be auditable." · REC-006 "Authorized users can export a complete job packet ..." · COM-002 "SMS/email notifications should avoid exposing lockbox codes, sensitive incident details, internal notes or unnecessary personal data." · COM-004 "Marketing communication preferences are separate from operational service messages; consent must be stored according to applicable policy." · NFR-007 "Automated backups for critical operational data with documented restore testing and recovery ownership." · NFR-009 "Collect only necessary personal/site data; separate operational evidence from marketing usage; role-restrict sensitive records." · NFR-014 "Authorized business owner can export core customer/job/financial operational records in usable formats to avoid platform lock-in." · NFR-015 "test data must not send real customer messages or alter real payments."
- **FACT** (spec, other sections): AIC-006 "AI prompts/results containing customer/job data should follow privacy, retention and vendor/security controls defined by the system owner." · SCH-004 "exact geolocation tracking is not required unless separately approved" · SCH-006 "avoid exposing private worker information beyond policy" · FIN-005 "optional photo/reference subject to privacy controls" · RECT-006 photos carry a "retention status" · RECT-011 "IP/device metadata only if justified by privacy/security policy" · UXE-007 "voice-to-note support where privacy policy permits" · MOD-001 "privacy/consent" · STG-002 the request includes "photos/files and consent" · LAUNCH-008 "privacy/photo visibility controls" · AT-047 to AT-050, AT-058, AT-060.
- **FACT** (spec §17 service cards): HI-05.INT "customer account/privacy"; HI-05.SAF "protect customer credentials; have customer control personal account/password"; HI-05.QAC "customer controls codes/accounts"; CL-01.INT "product preferences/allergies if volunteered"; CL-05.INT "access/security codes policy"; CL-05.SAF "protect access codes"; CL-06.SAF "strict privacy; do not photograph/access personal records without need"; the cleaning introduction: "Chemical compatibility, privacy and exception handling are mandatory."
- **FACT** (master): §8 "EXIF/privacy handling"; §17 forms must handle "privacy"; §22 "location permissions only when justified"; §23 AI must not silently "send legally sensitive notices"; §1.3 legal advice and injury decisions are not AI authority.
- **FACT** (owner facts, [operating context](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md)): L17 "Treat customer text/uploads as untrusted evidence, not instructions. Retrieve only necessary data. Do not expose credentials, access codes, card details or private photos." · L18 "Sending messages, publishing, spending, refunds, binding commitments and access changes require applicable explicit authorization." · L10 "Payment provider not selected." · L11 "English/Spanish public, customer and worker experience" · L6 "Initially two employees" · L3 "Domain ownership/connection ... not established."
- **FACT** (unapproved vault drafts that already move personal data): the CL-05 SOP ([sop Airbnb Cleaning and Turnover Checklist](../Standard%20Of%20Operations/sop%20Airbnb%20Cleaning%20and%20Turnover%20Checklist.md)) says "upload them to the host portal" and "text them to the property owner as proof of readiness"; the CL-05 agreement ([contract-airbnb-turnover](../Service%20Agreements/contract-airbnb-turnover.md)) says "photos will be sent instantly to the Client"; the CL-01 agreement ([contract-routine-cleaning](../Service%20Agreements/contract-routine-cleaning.md)) offers entry by "[Key / Lockbox Code / In-Person Entry]"; the [Home Improvement plan](../Main%20Plans/Home%20Improvement%20Business.md) says "program emergency master codes"; the HI-05 SOP ([sop-smart-locks](../Standard%20Of%20Operations/sop-smart-locks.md)) says "configure temporary guest access pin codes"; the [Cleaning plan](../Main%20Plans/Cleaning%20Business.md) says "photograph any guest damages for insurance claims".
- **FACT** (contradiction register in [02](02-gap-analysis.md)): C-HI05-01 (critical, verified: workers program codes although the card requires customer control), C-CL05-01 (critical, verified: SOP omits access-code protection), C-CL06-01 (high, verified: SOP omits privacy and valuables controls). Gaps routed here: G-006 (retention rules, voice-note privacy), G-070, G-079, G-086 (tax-record retention part only; refunds and taxability belong to [28](28-pricing-estimating-and-job-costing.md)), G-115, G-117, G-122, G-137, G-147, G-148, G-154.
- **FACT** (build state): no hosting, email, text-message, payment, AI or analytics provider is selected or configured ([32](32-website-and-customer-experience.md) §1.1; [33](33-ai-and-automation-governance.md) §1.2; [07](07-system-architecture.md) §15, where every integration is NOT SELECTED or NOT CONFIGURED; owner facts L10). No privacy notice, consent text, data inventory or retention schedule exists; the master §31 gate row "Privacy plan exists" is NOT MET ([00](00-project-charter.md) §11.2).
- **GAP**: the privacy skill is written for customer data only; worker data, field access codes, check images and AI vendors are uncovered ([35](35-skills-coverage-matrix.md), OWN-007 row). This document covers them with the IT-security and legal skills and marks the human reviews.

### 1.3 Issues resolved or routed by this document

Format: Problem -> Evidence -> Impact -> Correct expertise -> Proposed change -> Dependencies -> Validation.

| # | Problem | Evidence | Impact | Correct expertise | Proposed change | Dependencies | Validation |
|---|---|---|---|---|---|---|---|
| 1 | No data inventory or purpose map | [00](00-project-charter.md) §11.2 "Privacy plan exists" NOT MET; OWN-007 | Collection grows by screen; notices cannot be accurate | business-privacy-data-owner: "For each category record purpose, collection channel, required/optional status ..." | Inventory of 28 categories (Section 3); data map is the change trigger for notices (PRIV-001) | [05](05-domain-model.md) entities | Hook 1 (synthetic inquiry trace) |
| 2 | Retention is unspecified | REC-004 has no AT; G-137; no period in any file | Indefinite collection, or deletion of records that must be kept | privacy playbook "Do not invent a universal retention period."; legal-compliance-administrator (statutory inputs) | Category schedule with business-need PROPOSED periods and reviewer placeholders for legal minimums; disposal off until approved (Section 7) | Attorney, CPA (Q-13-03, Q-13-04) | Hooks 4, 5 |
| 3 | Consent is undefined | COM-004 and REC-003 have no wording; G-147, G-148; 0 of 25 agreements address photo consent ([02](02-gap-analysis.md)) | Messages or photo use without permission | privacy playbook "Distinguish service communications from promotional campaigns." | Consent catalog, operational versus marketing rule, text-message gate, photo consent (Section 4) | Attorney (Q-13-07, Q-13-18, Q-13-20) | Hooks 3, 12 |
| 4 | Photos lack metadata, link and classification rules | Master §8 "EXIF/privacy handling"; G-117; REC-002 | Location of homes and workers leaks; private interiors reach strangers | privacy playbook "Check for faces, children, addresses, valuables, documents, plates, and metadata before publication." | Photo rules (Section 5); PRIV-011 to PRIV-015 | [12](12-security-threat-model.md) signed-URL lifetime | Hooks 2, 7, 16 |
| 5 | Personal channels move job photos | CL-05 SOP "text them to the property owner"; CL-05 agreement "photos will be sent instantly to the Client" | Photos outside classification, logs and offboarding | privacy playbook "Limit public links, bulk exports, personal accounts, and vendor access." | In-app sharing only, adopting [27](27-roles-and-permissions.md) AUTH-034 (Sections 5.3, 9.5) | Q-27-16; SOP and agreement wording via [31](31-sop-standard.md), [30](30-service-agreement-standards.md) | [27](27-roles-and-permissions.md) hook 28 |
| 6 | Access secrets have no retention or exposure rule | G-115; C-HI05-01; C-CL05-01; COM-002 "should avoid" | Property security exposure for customers and hosts | business-systems-administrator "Keep sensitive access instructions, gate codes ... retained only as needed." | Collection timing, redaction, clearing at closeout, exposure handling (Section 6) | [27](27-roles-and-permissions.md) AUTH-009 | [27](27-roles-and-permissions.md) hook 22; hook 6 |
| 7 | No privacy-request workflow | OWN-007 "privacy-request workflow"; no file defines one | Requests mishandled; other people's data disclosed | privacy playbook "log receipt, verify identity proportionately ..." | Request types, verification, erasure method (Section 8) | Attorney (Q-13-10) | Hook 4 |
| 8 | No vendor review | OWN-007 "vendor review"; AIC-006; [00](00-project-charter.md) R-00-11 | Personal data reaches unvetted vendors | privacy playbook "Review vendor purposes, subprocessors, retention ..." | Vendor register and approval gate for every processor (Section 10) | Vendor decisions in [07](07-system-architecture.md), [15](15-devops-infrastructure.md) | Hook 15 |
| 9 | Privacy incidents have no routing | G-122; "incident" names four different things ([35](35-skills-coverage-matrix.md) D-35-15) | Missed or premature notices | privacy playbook "Do not send notices or promise no impact before scope is established."; IT playbook (containment) | Runbook and attorney notification gate (Section 13) | Attorney (Q-13-02); broker (Q-13-13) | Tabletop drill (Section 18.2) |
| 10 | Worker data and monitoring are unaddressed | SCH-004; SCH-006; [35](35-skills-coverage-matrix.md) GAP | Monitoring creep; worker data shown to customers | business-it-security-administrator "a lost personal device does not automatically authorize wiping all personal data" | No location collection, worker notice, customer-visible worker details (Sections 9.4, 16.3) | Employment attorney (Q-13-11); Q-27-08 | Hook 11 |
| 11 | Check images have no rule | FIN-005 "subject to privacy controls" | Bank account numbers spread | business-systems-administrator "Never put full card details in the CRM or ordinary documents." | Restricted class, short business-need period (Sections 2.3, 7.2) | CPA (Q-13-16) | [27](27-roles-and-permissions.md) hook 7 |
| 12 | Audit IP and device data "only if justified" | RECT-011 | Either no forensic data or blanket tracking | IT playbook (incident evidence); privacy playbook (minimization) | IP and device data only on listed security events; personal values not stored in audit events (Section 9.2) | [12](12-security-threat-model.md) | Hook 10 |
| 13 | Law applicability unknown | NFR-009 needs privacy/legal review; [32](32-website-and-customer-experience.md) §5.4 row L7 | Wrong notice content; missed duties | legal-compliance-administrator "When multiple jurisdictions apply, treat each separately." | Fact sheet and question list for the attorney (Section 14) | Attorney | Recorded dispositions |
| 14 | Deletion conflicts with backups | NFR-007; privacy playbook on backups | Erased data returns after a restore | privacy playbook "prevent restored deleted data from re-entering active use without reapplying deletion records" | Erasure records re-applied after restore (Sections 8.4, 12) | [15](15-devops-infrastructure.md) | Hook 14 |
| 15 | Voice-to-note has no privacy policy | UXE-007; G-006; [33](33-ai-and-automation-governance.md) Q-33-14 | Recordings of customers and occupants | privacy playbook; attorney (recording consent) | Feature off until a policy exists; outline in Section 15 | Attorney | Configuration check (PRIV-037) |
| 16 | CL-06 privacy and valuables controls missing | C-CL06-01; G-070; CL-06.SAF | Personal records and valuables photographed or disturbed | privacy playbook; safety via [31](31-sop-standard.md) | Capture and publication rules for documents and valuables (Section 5.5) | SOP wording in [31](31-sop-standard.md) | Hook 2 |
| 17 | Third-party requests for records (insurers, police, other contractors) have no route | [Cleaning plan](../Main%20Plans/Cleaning%20Business.md) "photograph any guest damages for insurance claims"; no file defines disclosure to third parties | Over-disclosure of photos and records, or a missed legal-process duty | customer-service playbook "A caller claiming to be a landlord cannot receive a tenant's records without authorization."; attorney | Third-party and legal-process row in Section 8.1; adviser exports (Section 11) | Attorney (Q-13-21) | Recorded disposition; R-13-17 |
| 18 | Versioned object storage and write-once copies keep erased files | [07](07-system-architecture.md) D-07-15 (object versioning, write-once logical copies) | Erased photos survive outside the schedule | privacy playbook "Avoid claiming immediate deletion from immutable backups if unsupported." | Noncurrent versions and write-once copies treated as backups (Section 12) | [15](15-devops-infrastructure.md) | Hook 14 |

### 1.4 Specialist expertise applied

| Skill | Rule applied (quoted) | Where |
|---|---|---|
| [business-privacy-data-owner](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-privacy-data-owner/SKILL.md) ([playbook](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-privacy-data-owner/references/playbook.md), [verification](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-privacy-data-owner/references/verification.md), [sources](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-privacy-data-owner/references/sources.md)) | "Do not assume a small business is exempt or that one privacy law applies everywhere." · "Pay attention to residential addresses, interior photos, faces, license plates, children, gate/access codes, availability patterns, payment references, and location metadata. Collect only what the task needs." · "Separate job documentation from publication permission." · "Do not infer permission to text or market from a phone number provided for a repair estimate." · "Create a category-specific retention schedule based on business need and verified legal/accounting requirements. Do not invent a universal retention period." · "Distinguish deletion from hiding/archive." · "Avoid claiming immediate deletion from immutable backups if unsupported." · "Draft notices and consent language from the actual data map, not aspirational safeguards." · verification: "Lack of a complaint is not consent." · sources: "Do not quote fixed legal deadlines, retention periods, fees, platform limits, or configuration syntax from memory." | Every section |
| [business-it-security-administrator](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-it-security-administrator/SKILL.md) ([playbook](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-it-security-administrator/references/playbook.md), [verification](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-it-security-administrator/references/verification.md)) | "Distinguish personally owned from managed devices." · "Use least privilege, individual accounts, separate admin roles, and auditable service accounts." · "Review OAuth/app grants and stale sessions, not just passwords." · "Exercise recovery without publishing private records or triggering real customer workflows." · "A successful backup notification is not a restore test." · "For suspicious account activity preserve logs, verify scope, restrict access appropriately, revoke compromised sessions/tokens" · verification: "For backups distinguish configured, last completed, and last restored/verified." · "Route personal-data exposure and possible reporting duties to the privacy owner with verified facts." | Sections 9, 10, 12, 13 |
| [legal-compliance-administrator](../Skills/LLC%2C%20legal%20administration%2C%20and%20risk/legal-compliance-administrator/SKILL.md) | "Do not say a business is legally compliant based only on a conversational review." · "Separate: confirmed requirement, likely requirement needing verification, business policy choice, and professional-review item." · "Build checklists that are operational: requirement, jurisdiction, trigger, owner, evidence/document, deadline, renewal cycle, status, and source." · "When multiple jurisdictions apply, treat each separately." · "Do not invent licenses, permit rules, filing fees, deadlines, or tax registrations." | Sections 7, 13, 14 |
| Consulted for specific rules | [business-systems-administrator](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-systems-administrator/references/playbook.md): "Keep sensitive access instructions, gate codes, identity documents, and interior photos narrowly restricted and retained only as needed. Do not use free-text notes as a secret vault." and "Restrict bulk export, refunds, bank-detail changes, and deletion." · [lead-intake](../Skills/Branding%2C%20marketing%2C%20social%20media%2C%20and%20sales/handyhub-lead-intake/references/playbook.md): "Preserve separate operational-contact, marketing and photo-publication consent; do not infer marketing consent from a phone number." · [customer-service](../Skills/Branding%2C%20marketing%2C%20social%20media%2C%20and%20sales/handyhub-customer-service/references/playbook.md): "Verify identity proportionately before disclosing private job/property/billing details." and "A caller claiming to be a landlord cannot receive a tenant's records without authorization." · [swe-quality-delivery operations](../Skills/Website%2C%20software%2C%20and%20cybersecurity/swe-quality-delivery/references/operations.md): "Specify backup scope, schedule, encryption, retention, separate failure domain, access control ..." and "For a suspected compromise, avoid wiping systems or destroying logs as an initial reflex." | Sections 4, 8, 9, 12, 13 |

No skill was used to reach a legal, tax, payroll, insurance or medical conclusion; those items carry a HUMAN REVIEW marker. Status words follow the skills' rule: a control is proposed, configured, tested or active only on evidence; everything here is proposed.

## 2. Privacy governance model

### 2.1 Principles (PROPOSED DECISION D-13-01)

1. **Facts before law.** HandyHub's practices are designed from its own data map; which laws apply is decided by an attorney (Section 14). No document, page or message claims that HandyHub is compliant or "secure".
2. **Minimum necessary.** Collect only what the task needs and defer exact addresses, interior photos and access secrets until they are operationally useful (NFR-009; owner facts L17; [32](32-website-and-customer-experience.md) D-32-06).
3. **Purpose-bound.** Data is used only for the purposes recorded in Section 3. A new purpose, vendor, tracking technology, audience or workflow is a data-map change that is reviewed before release (PRIV-001).
4. **Operational evidence is separate from marketing** (NFR-009, REC-003, COM-004).
5. **Private by default.** Photos are internal-only until reclassified ([27](27-roles-and-permissions.md) D-27-15); files are never public; delivery uses short-lived authorized links (Section 5.6).
6. **Secrets never sit in ordinary records.** Access codes live only in the encrypted access-secret record; customer device credentials and card numbers are never stored (Section 2.3).
7. **Finite, category-specific retention.** Nothing is disposed of before the schedule is approved; legal holds override disposal and erasure (Section 7).
8. **Deletion is real.** Hiding or archiving is not deletion; erasure runs through one audited procedure ([27](27-roles-and-permissions.md) D-27-14; [05](05-domain-model.md) DOM-053).
9. **Vendors are approved before they receive personal data**, including AI features built into business software (Section 10; [33](33-ai-and-automation-governance.md) AIG-014).
10. **People decide legally sensitive notices.** AI and automation never send privacy, breach or consent-related notices (master §23).
11. **Bilingual.** Notices, consent text and request responses exist in English and Spanish with qualified human review (BIZ-002, COM-006, owner facts L11).
12. **Documented is not configured, configured is not verified** (IT playbook "Explicitly distinguish documented procedures from configured controls and live monitoring."). Each PRIV requirement carries a verification method.

### 2.2 Responsibilities

**ASSUMPTION** ([00](00-project-charter.md) §3.4): the owner holds OWN-007 until it is delegated (Q-13-06). Split with legal ([35](35-skills-coverage-matrix.md) boundary row 11): "privacy owns the data-category schedule, consent workflow and records; legal owns contract wording and statutory inputs; an attorney reviews both."

| Responsibility | Accountable at launch | Prepares (skill) | Reviews | Recorded in |
|---|---|---|---|---|
| Data inventory and data-flow map | Owner (OWN-007) | business-privacy-data-owner | IT/security; business-systems-administrator | This document; [20](20-decision-log.md) |
| Retention values and legal holds | Owner | business-privacy-data-owner (category schedule); legal-compliance-administrator (statutory research log) | Attorney; CPA; employment attorney; payroll professional | Business policy versions (key `retention`); legal hold records |
| Notice and consent wording (EN/ES) | Owner | business-privacy-data-owner, legal-compliance-administrator, handyhub-customer-service | Attorney; qualified bilingual reviewer | Privacy notice versions; consent text versions |
| Technical enforcement (encryption, logging, devices, backups) | Owner until OWN-006 is named ([00](00-project-charter.md) Q-00-06) | business-it-security-administrator; swe-quality-delivery | Human security reviewer (HND-010) | [12](12-security-threat-model.md), [15](15-devops-infrastructure.md) |
| Application roles and field classes | Owner | business-systems-administrator | Privacy owner | [27](27-roles-and-permissions.md) |
| Vendor approval | Owner | business-privacy-data-owner, business-it-security-administrator | Attorney (terms) | Vendor register (Section 10) |
| Privacy requests | Owner | CSR intake; ADM executes | Attorney for exceptions and deadlines | Privacy request records |
| Privacy incidents | Owner | business-privacy-data-owner, business-it-security-administrator | Attorney; insurance broker | Incident record ([17](17-observability-and-operations.md)) |

**GAP**: OWN-006 (IT / cybersecurity administrator) is not named, so the owner holds privacy, administration and IT duties at once (R-13-09). Compensating control: the attorney's review of Sections 4, 8, 13 and 16 before launch, the [27](27-roles-and-permissions.md) access review (AUTH-031) covering the sensitive-read log, and the **RECOMMENDATION** in [33](33-ai-and-automation-governance.md) §2.2 to name OWN-006 or engage an external IT provider.

### 2.3 Sensitivity classes (PROPOSED DECISION D-13-02)

This adopts [05](05-domain-model.md) §2.4 (D-05-16) as final, with the amendments listed below the table. An entity takes the class of its most sensitive field.

| Class | Meaning | HandyHub examples | Handling (detail in [27](27-roles-and-permissions.md), [12](12-security-threat-model.md)) |
|---|---|---|---|
| Public | Approved for publication | Published service text; marketing media derivatives after consent and identifier review | Published only through the claims and media gates of [32](32-website-and-customer-experience.md) |
| Internal | Business-internal, no personal data | SOP versions, hazard templates, item master, aggregate analytics | Staff only |
| Confidential | Commercially sensitive; may hold personal data incidentally | Price books, internal cost and margin, vendor terms, audit events, bank deposit batches with masked references | Named roles only ([27](27-roles-and-permissions.md) §4.7) |
| Personal | Identifies or relates to a person or a residence | Contact details, service address, schedules (they show when a home is empty), communications, job records, exterior photos, time entries, consent state | Need to know; bulk reads logged (Section 9.2) |
| Restricted | High harm if exposed | Access secrets and key custody; photos flagged for people, children, documents, screens, keypads or valuables; check images and bank references; injury and medical detail; volunteered health details; employee HR and pay data; legal and fraud notes; complaint narratives about a named worker; payee bank details; privacy-request, legal-hold and privacy-incident records | Every read logged (Section 9.2); separate encryption or storage where [08](08-data-model-and-database.md) and [12](12-security-threat-model.md) decide; never in SMS, email, notification bodies, AI context ([33](33-ai-and-automation-governance.md) §4.2), customer-facing exports, development or staging |
| Never stored | Must not enter HandyHub records | Payment card numbers and security codes (AUTH-035); customers' device or account credentials such as smart-lock passwords, master codes and Wi-Fi keys (D-27-16); customers' government identification numbers or ID images; biometric data (none is needed: a phone passkey's fingerprint or face check must stay on the device, to be confirmed in [12](12-security-threat-model.md)) | No field can hold them; card numbers are rejected or masked at entry by pattern check; anything found later is redacted (PRIV-003, PRIV-005) |
| Not collected unless separately approved | Collection needs owner and privacy-owner approval plus the named review | Worker GPS location (SCH-004; employment attorney); call recordings (Q-13-17); voice audio (UXE-007; [33](33-ai-and-automation-governance.md) Q-33-14); IP and device data outside the events listed in Section 9.2 (RECT-011) | Design blocked until approved |

Amendments to [05](05-domain-model.md) §2.4: volunteered health details, complaint narratives about a named worker and privacy-program records join Restricted; the Restricted photo group covers any flagged photo, not only interiors, and adds screens and keypads (Section 5.3); customers' government identification and biometric data join Never stored; the "Not collected unless separately approved" group is added, and worker location moves into it from Restricted (it would be Restricted if ever approved). Everything else in 05 §2.4 is adopted unchanged.

## 3. Data inventory

### 3.1 How to read it

- Rows are numbered 1 to 28 and are cited as "inventory row n". Table A says what is collected, from where and why; Table B, with the same row numbers, says how sensitive it is, where it lives, who sees it, how long it stays and who else receives it (PROPOSED DECISION D-13-03: this inventory is HandyHub's single data map).
- The column "Legal basis, notice and consent" describes the proposed operational practice. **Every cell in that column is HUMAN REVIEW: attorney licensed in KY and/or IN**; none is a legal conclusion (Q-13-01).
- Storage is **PROPOSED**: one application with one relational database and private object storage ([05](05-domain-model.md) D-05-01; [07](07-system-architecture.md) D-07-07 proposes one managed PostgreSQL database and D-07-10 private buckets with quarantine, files and exports areas). No hosting is selected; [07](07-system-architecture.md) and [15](15-devops-infrastructure.md) decide.
- Access summarizes [27](27-roles-and-permissions.md) using its role codes; where the two differ, 27 wins.
- Vendors are categories only. **FACT**: no vendor is selected (Section 10.1).
- Retention classes are the [05](05-domain-model.md) §2.5 classes; periods are in Section 7.2.

### 3.2 Inventory A: what, from where and why

| # | Category | Examples in HandyHub | Source and channel | Purpose and business justification (spec) | Required or optional | Legal basis, notice and consent (HUMAN REVIEW: attorney) |
|---|---|---|---|---|---|---|
| 1 | Requests and leads | Name, phone or email, ZIP, optional street address, services, description, service answers, urgency, timing preference, relationship to the property, how they heard, disclosure and notice versions, attachments | Public form ([32](32-website-and-customer-experience.md) §6.4); phone or email logged by CSR | Respond, qualify and route (STG-002, STG-003; RECT-001 "Original submission, consent, source and attachments"); lead funnel (RPT-001) | ZIP, description, name and phone or email; the rest optional (D-32-06) | Notice at collection and privacy notice (Section 16); no marketing consent inferred (Section 4.2) |
| 2 | Customers and contacts | Customer type and segment, names, phones, emails, preferred language and channel, billing address and contact, relationship (owner, tenant, manager, host, builder), contact authority and its evidence, portal login | Request conversion; CSR; customer portal | Contract, bill and communicate (ENT-001, BIZ-002; [27](27-roles-and-permissions.md) AUTH-028) | Name and one contact channel; billing fields when invoiced | Service relationship; privacy notice; authority evidence rules (Q-27-07) |
| 3 | Property and site profile | Address and unit, time zone, property type, year built (customer-reported), occupancy, pets and occupants notes, "children present" flag, parking and non-secret access instructions, utility notes, work areas, site hazards | Request; estimator visit; field observations labeled by provenance ([05](05-domain-model.md) DOM-004) | Serviceability (BIZ-001); briefing (BRF-002, BRF-003); safety (START-007, START-011); profile reuse (CX-005) | Street address once a visit is scheduled; the rest when relevant | Service relationship; occupant details limited to safety relevance (Section 3.4) |
| 4 | Access secrets and keys | Lockbox, gate, alarm and door codes; key location; customer keys held by HandyHub ("[Key / Lockbox Code / In-Person Entry]", CL-01 draft agreement); host codes (CL-05.INT "access/security codes policy") | Customer in the portal's secure field, or staff entering it during a call; never the public form, SMS or email | Entry on the service day (BRF-002 "lockbox/access instructions") | Only when the customer chooses code or key entry | Customer instruction recorded with the secret ([27](27-roles-and-permissions.md) AUTH-009) |
| 5 | Customer device and account credentials | Smart-lock app passwords, master codes, Wi-Fi passwords ("program emergency master codes" and "configure temporary guest access pin codes" in the unapproved HI-05 drafts) | Never collected | None: HI-05.SAF "have customer control personal account/password" | Never stored (D-27-16; C-HI05-01) | Not applicable |
| 6 | Estimates, approvals and signatures | Estimate versions, agreement packets, customer approvals (contact, method, time, hash, languages), signatures, change orders, walkthrough outcomes, customer-supplied item checks | ESTR; customer portal or version-bound link; in person on a staff device | Versioned approvals and dispute evidence (CX-003, REC-001, EST-001 to EST-007, QA-004, START-009) | Required to convert to a job | Contract evidence; any electronic-records consent per the attorney ([30](30-service-agreement-standards.md)) |
| 7 | Scheduling and visits | Visit windows, schedule history and reasons, assignments, en route and delay updates, no-start reasons | DSP; workers (status events); customers (requests) | SCH-001 to SCH-008, CX-006 | Required for booked work | Service relationship |
| 8 | Job execution records | Tasks, checklist responses, measurements, notes by class ([27](27-roles-and-permissions.md) §4.8), condition reports, material usage, briefing snapshots and views, acknowledgements | Workers; office staff | JOB-001 to JOB-012, START-001 to START-015, QA-001 to QA-012 | Required by the gates and checks | Service relationship; worker aspects in rows 19 and 20 |
| 9 | Job photos and files | Arrival, existing-condition, protection, concealed-condition, progress, completion and cleanup photos; customer-uploaded photos and PDFs (host, lease and builder checklists); incidental interiors, people, children, pets, documents, screens, valuables, house numbers, vehicles and plates | Worker app (in-app capture, AUTH-034); form and portal uploads | Condition and completion evidence (START-008, QA-003, JOB-003; pre-existing-condition evidence, X-02 in [02](02-gap-analysis.md)); remote estimating ([32](32-website-and-customer-experience.md)) | Where the service card requires photos | Operational documentation; publication only with separate consent (REC-003) |
| 10 | Marketing media | Derivatives of selected job photos with identifiers removed; captions | ADM from row 9 after consent | Marketing from approved claims and media permissions (AIR-009) | Optional | Photo-publication consent (REC-003, AT-050); publicity questions (Section 14) |
| 11 | Communications | Call summaries, emails, portal messages, texts (later), notification records, delivery states and attempts, recipient addresses; business mailbox and business phone logs as secondary stores | Staff; SYS notifications; customers; providers | JOB-009, RECT-012, COM-003, NTF-001 to NTF-011 | Where the exchange affects scope, access, timing, approval or dispute (JOB-009) | Operational messages under the service relationship; texts per Section 4.3; no call recording planned (Q-13-17) |
| 12 | Consent records and preferences | Marketing consent per channel, photo-publication consent per asset or job, electronic-records consent if required, operational channel preference, language, notice version, method, evidence, withdrawals, suppression entries | Form step 5; portal; staff recording the customer's instruction | COM-004, REC-003, AT-050 | Optional | The record is the evidence; wording and method (Q-13-07) |
| 13 | Marketing lists and campaigns | Contacts with active marketing consent, suppression list, campaign send history, review-request history | Derived from row 12; no purchased or rented lists (D-13-06) | Marketing (AIR-009); follow-up (QA-009, NTF-011) | Optional | Opt-in consent; classification of review requests and maintenance reminders (Q-13-18) |
| 14 | Payments and financial records | Invoices, payments (method, amount, collector, payer name, check number), receipts, allocations, adjustments, credits, refunds, write-offs, bank deposit batches with masked bank reference, reconciliation sign-offs, tax status placeholders | BKP; collectors; SYS | FIN-001 to FIN-008, BIZ-007, RECT-009, RECT-010 | Required | Accounting and tax obligations (CPA, Q-13-03) |
| 15 | Check images | Optional photo of a received check (account and routing numbers, signature, address) | Collector in the payment flow | Reconciliation evidence (FIN-005 "optional photo/reference subject to privacy controls") | Optional; capture policy Q-13-16 | CPA decides whether an image is a required record |
| 16 | Payment card data | Card numbers, security codes | Never collected | None; a card on file can only be a provider token (D-27-20) | Never stored | Not applicable |
| 17 | Incident and safety records | Incident type, severity, people and property affected, witness details, immediate action; restricted injury and medical section ([05](05-domain-model.md) DOM-035); stop-work events; hazard notes about occupants or aggressive animals; emergency stabilization | Workers, LWK, ADM | JOB-008, RECT-007, START-011, JOB-006 | When an event occurs | Insurer, attorney and qualified safety professional review (master §1.3); medical decisions by medical professionals |
| 18 | Complaints and rework | Complaint facts and category, contact, linked job, conduct allegations about a named worker, legal-claim notes, rework classification, refund or credit review items | Customers; CSR | CX-007, QA-009, QA-010 | When raised | Attorney where exposure is material (master §1.3) |
| 19 | Worker and employee data | Name shown to customers (Q-27-08), language, working hours, availability and time-off reasons, qualifications and evidence, PPE sizes (P1), onboarding acknowledgements, registered devices, offboarding records; HR and pay fields (payroll outside the application by default, [05](05-domain-model.md) §5.1) | Owner, ADM, the worker | SCH-002, SCH-003, START-010, BIZ-005, AT-051 | Required to assign work | Employment relationship; worker privacy notice (Section 16.3); employment attorney (Q-13-11) |
| 20 | Worker time and activity | Time entries with offline flag, en route and arrived times, briefing views, acknowledgements, audit attribution; GPS location not collected (SCH-004); the job address passes to the phone's map app for the directions handoff and no location comes back (PROPOSED in [11](11-worker-job-execution.md) D-11-22) | Worker app; SYS | JOB-002, START-014, SCH-006, NFR-008 | Required by the gates and the timekeeping policy | Employment relationship; any monitoring needs the employment attorney |
| 21 | Accounts, sessions, audit and security logs | Login identifier, MFA state, sessions, registered devices, audit events, sensitive-read events, denied-access events, abuse and rate-limit log with IP addresses ([32](32-website-and-customer-experience.md) §6.4), hosting and CDN access logs | SYS; hosting | NFR-006, NFR-008, REC-005, AT-051, AT-057; abuse protection (D-32-08) | Required | Security purpose; IP and device data only per Section 9.2 (RECT-011) |
| 22 | AI records | Decision-log metadata, raw assembled context and output text, evaluation sets (synthetic), provider-side copies | AI gateway (P1; AI disabled at launch, D-27-13) | Master §23 "Log important AI-assisted decisions."; RPT-009 | Only when AI is enabled | AIC-006; verified provider terms; notice before activation ([33](33-ai-and-automation-governance.md) §15.3) |
| 23 | Website analytics, cookies and browser storage | Aggregate page and step counts without personal data ([32](32-website-and-customer-experience.md) §10.3), language preference, form draft in session storage, CSRF token | Visitor's browser; server | Funnel measurement (RPT-001); functionality; security | Analytics optional; CSRF token required | Consent mechanism, if any (Q-13-08, Q-32-12) |
| 24 | Exports and copies | Job packets (internal and customer-facing), accounting exports, owner bulk export, privacy-request copies, legal-hold exports, downloaded copies | ADM, BKP, CSR | REC-006, NFR-014, AT-060 | On request | Purpose recorded per export (Section 11) |
| 25 | Vendors and future subcontractors | Supplier contacts, payee bank details, subcontractor legal names, insurance certificates, license evidence, subcontractor workers (P1) | BKP, ADM | ROLE-008, NEAR-004 | When engaged | Contract; subcontractor rules ([27](27-roles-and-permissions.md) §8.7) |
| 26 | Paper and offline copies | Signed paper agreements (the "signed paper scanned in" approval method, [05](05-domain-model.md) §5.5), physical checks before deposit, handwritten notes, printed briefings, key tags | Field and office | Approval evidence; payment custody | Avoid where the app covers the need | Paper originals (Q-13-19) |
| 27 | Privacy-program records | Privacy requests and responses, verification notes (no ID copies), erasure records, legal holds, privacy incidents, vendor register, jurisdiction research log, notice and consent-text versions | Privacy owner; legal-compliance-administrator | OWN-007 accountability | Required | Attorney (Q-13-10) |
| 28 | Job applicants (future) | Not defined: no hiring process exists ([02](02-gap-analysis.md) G-083) | None today | Future hiring | None collected | Employment attorney before any collection |

### 3.3 Inventory B: sensitivity, storage, access, retention and recipients

| # | Sensitivity | Storage (PROPOSED) | Who can access (summary of [27](27-roles-and-permissions.md)) | Retention class | Recipients and vendors (none selected) |
|---|---|---|---|---|---|
| 1 | Personal | Database (`intake`); private object storage for attachments | CSR and ADM all; ESTR view and edit; DSP view; CUS own; GST write-only with no read-back; field roles and BKP none | `lead`; follows the job once converted | Hosting; email provider (NTF-001 acknowledgement); AI provider only after approval (AIG-014) |
| 2 | Personal | Database (`crm`) | CSR and ADM all; DSP, ESTR and BKP view (field-limited); WKR and LWK only the site contact of assigned jobs inside the window; CUS own | `operational`; billing data also `financial` | Hosting; email provider; accounting system through exports; payment provider later |
| 3 | Personal | Database (`crm`; site hazards in `safety`) | DSP, ESTR, CSR, ADM; assigned field roles inside the window (address timing Q-27-09); CUS own | `operational` | Hosting; the phone's map app (address only, [11](11-worker-job-execution.md) D-11-22) |
| 4 | Restricted | Encrypted field in `crm` with its own key ([08](08-data-model-and-database.md), [12](12-security-threat-model.md)); physical keys in locked storage with a custody log | Assigned WKR and LWK on the service day, every reveal logged; DSP and ADM, reveal logged; CSR write-only; CUS own (write) | `secret` | Hosting only, encrypted; never messaging providers, exports or AI |
| 5 | Never stored | Nowhere | Nobody | Not applicable | None |
| 6 | Personal (cost and margin Confidential) | Database (`estimating`); rendered documents in object storage | ESTR and ADM; BKP view; CUS own sent versions; field roles see scope without prices unless they hold collect | `contract` | Hosting; an e-signature vendor only if chosen ([30](30-service-agreement-standards.md)) |
| 7 | Personal | Database (`scheduling`) | DSP and ADM; ESTR and CSR view; workers own and assigned; CUS own | `operational` | Hosting; email provider (NTF-004 to NTF-006); text provider later |
| 8 | Personal (note classes up to Restricted) | Database (`jobs`, `safety`); worker phone cache, encrypted and window-limited | Assigned field roles; DSP and ADM; customer-visible parts to CUS | `operational`; acknowledgements `safety` | Hosting; AI only from wave 3 ([33](33-ai-and-automation-governance.md) §15.1) |
| 9 | Personal; Restricted when flagged (Section 5.3) | Private object storage; phone upload queue deleted after a confirmed sync | Staff with access to the job; customer-shareable photos to CUS own; restricted photos only to the job's own customer after review, check images never (Section 5.3) | `operational`; incident photos `safety`; customer-supplied item photos `contract`; check images `financial` | Hosting and storage; a malware-scanning service if external ([12](12-security-threat-model.md)); customer-side contacts with authority through in-app share |
| 10 | Public after consent and review | Website repository and CDN; HandyHub social accounts if any | ADM creates; AIR-009 reads approved derivatives only | `consent` (lives as long as the consent) | Website host and CDN; social platforms if used |
| 11 | Personal (sensitive notes Restricted) | Database (`records`); email and text provider logs; business mailbox and phone as secondary stores | CSR, DSP and ADM; assigned field roles for their job; CUS own; BKP field-limited | `operational` | Email, text and telephony providers |
| 12 | Personal | Database (`crm`) | CUS own; CSR and ADM record with evidence; the Marketing AI reads state only | `consent` | Hosting; email marketing tool if selected |
| 13 | Personal | Database; email marketing tool if selected | ADM; CSR view | `consent` | Email marketing tool; text provider later |
| 14 | Personal (bank references Confidential) | Database (`finance`) | BKP and ADM; CUS own; collectors their own collections; CSR status only | `financial` | Accounting system or CPA through exports; bank; payment provider later |
| 15 | Restricted | Private object storage, restricted prefix | BKP and ADM; the collector until the capture syncs | `financial` (shorter image period, Section 7.2 row 10) | CPA only on request |
| 16 | Never stored | Nowhere | Nobody | Not applicable | Payment provider only, once selected |
| 17 | Personal; injury section Restricted | Database (`safety`) | Reporter own; LWK assigned (field-limited); DSP, CSR and BKP view (field-limited); ADM all; injury section ADM and the injured or reporting worker | `safety` | Insurer or broker and attorney when the owner engages them |
| 18 | Personal; legal-claim notes and conduct allegations Restricted | Database (`quality`) | CSR and ADM; LWK read on assigned rework; legal notes ADM | `operational` | Attorney or insurer for material disputes |
| 19 | Personal; HR and pay Restricted | Database (`people`); payroll provider for pay data if selected | ADM; the worker for own profile; DSP staff directory (name, phone, tags, hours); BKP payroll fields | `workforce` | Payroll provider (not selected) |
| 20 | Personal | Database (`jobs`, `safety`, `records`) | The worker own; LWK own and assigned view; DSP field-limited; BKP view and export; ADM | `workforce`; `financial` as a cost input; acknowledgements `safety` | Payroll provider (time totals) |
| 21 | Confidential (may hold Personal) | Database (`people`, `records`); hosting and CDN logs; abuse-log store | ADM views and exports with step-up; BKP financial events; IT/security custodian; users see their own sessions | `audit`; abuse and access logs `transient` | Hosting and CDN; error-monitoring tool if selected, receiving IDs only |
| 22 | Inherits its sources | Database (`ai`) | Invoker own; assigned reviewers; ADM; raw text ADM and the assigned sampler ([33](33-ai-and-automation-governance.md) §8.4) | `audit` (classes A to D, Section 7.2 row 20) | AI provider (not selected) |
| 23 | Internal (no personal data) | Visitor's browser; analytics tool or server logs | Owner and strategist see aggregates | `transient` | Analytics tool if selected |
| 24 | Inherits; Restricted when internal | Object storage, expiring | Per export type (Section 11) | `transient` | Bookkeeper or CPA, customer, attorney, insurer |
| 25 | Confidential; bank details Restricted | Database (`inventory`, `people`) | BKP and ADM | `financial`; `workforce` for subcontractor workers | Bank; accounting system |
| 26 | Inherits its content | Locked office storage; scans in object storage | ADM and BKP; key custody per person | By content | Bank (checks); shredding service if used |
| 27 | Restricted (published notice and consent-text versions Public) | Database (`records`) or a controlled register at launch | ADM; attorney when engaged | `audit`; notice and consent-text versions `content` (Section 7.2 row 29) | Attorney |
| 28 | Personal; Restricted | None until a process exists | Not applicable | `workforce` | None |

Disposal methods per row are set in Section 7.3; the per-category schedule is Section 7.2.

### 3.4 Collection rules by channel (PROPOSED DECISION D-13-04)

| Channel or subject | Collect | Do not collect | Source |
|---|---|---|---|
| Public form | The fields of [32](32-website-and-customer-experience.md) §6.4 | Access codes, passwords, Wi-Fi or app credentials, payment data, health details, photo-publication permission, text-message consent (until Section 4.3 is met) | D-32-06; WEB-014; WEB-019 |
| Phone and email | The same fields as the form, logged as a request | Card numbers (AUTH-035); access secrets before a visit is confirmed; any credential | Owner facts L17 |
| Customer portal | Own contact and billing edits; the access secret in its secure field; consent grants and withdrawals | Anything outside the customer's own records | [27](27-roles-and-permissions.md) §5.1 |
| Worker app | Photos at workflow moments; notes by class; checklist and gate records; time events | Camera-roll copies; voice audio (until Section 15 is met); device location; photos of people, documents, screens or valuables not needed for the work | AUTH-034; SCH-004; CL-06.SAF |
| Back office | Billing data; payments with check number; check image only per Q-13-16 | Card numbers; full bank account numbers outside a check image (masked references only) | [05](05-domain-model.md) §5.11 |
| Children and occupants | Presence and safety-relevant facts only (for example "young children present", "occupant uses a wheelchair, keep the hallway clear") | Names, ages, schools, photos | BRF-002 "pets, children/occupants" |
| Health details | Only when the customer volunteers them and they change how the work is done (for example an allergy to a cleaning product, CL-01.INT), stored as a risk-and-safety note | Diagnoses, medications, anything not needed for the work | NFR-009 |
| Pets | Species, temperament and containment notes | Anything beyond safety and access | BRF-002; START-011 "aggressive occupants/animals" |
| Access secrets | Only after a visit is confirmed, unless the customer volunteers one earlier | Codes in free text, SMS, email or photos (Section 6) | COM-002; owner facts L17 |
| Identity and authority checks (for example the HI-05 check that the requester controls the door, [27](27-roles-and-permissions.md) §5.5; representative authority, AUTH-028) | The fact checked, the method (for example "deed or lease seen in person"), who checked and when, recorded with the authority flag (PROPOSED) | Copies, photos or numbers of identification documents (Section 2.3 Never stored); copies of deeds or leases unless the attorney requires one as authority evidence; what evidence is acceptable is **HUMAN REVIEW: attorney** ([27](27-roles-and-permissions.md) Q-27-07) | business-systems-administrator playbook "identity documents ... narrowly restricted"; NFR-009 |

### 3.5 Data flows

```mermaid
flowchart LR
    subgraph SRC["Sources"]
        V["Website visitor"]
        C["Customer or authorized contact"]
        W["Worker phone app"]
        S["Office staff"]
    end
    subgraph APP["HandyHub application (planned)"]
        DB["Relational database"]
        OS["Private object storage: photos and files"]
        LOG["Audit and security logs"]
    end
    subgraph VEN["Vendors (none selected)"]
        HOST["Hosting, storage and backups"]
        MAIL["Email delivery"]
        SMS["Text messages (not at launch)"]
        PAY["Payment provider (not selected)"]
        AIP["AI provider (not at launch)"]
        ACC["Accounting system or CPA (exports)"]
    end
    subgraph EXT["Other recipients"]
        CUSR["Customer-side contacts with authority: hosts, managers, builders"]
        ADV["Attorney, CPA or insurer when engaged"]
        MAP["The phone's map app"]
    end
    V -->|"request form"| DB
    V -->|"uploads, metadata stripped"| OS
    C -->|"portal, phone, email"| DB
    W -->|"field records"| DB
    W -->|"in-app photos"| OS
    S --> DB
    DB --> LOG
    DB --> HOST
    OS --> HOST
    DB -->|"notifications"| MAIL
    DB -.->|"after Section 4.3"| SMS
    DB -.->|"after a provider decision"| PAY
    DB -.->|"after AIG-014 approval"| AIP
    DB -->|"accounting export"| ACC
    OS -->|"in-app share only"| CUSR
    DB -->|"scoped export, purpose logged"| ADV
    DB -->|"directions handoff, address only"| MAP
```

Dotted lines are flows that do not exist at launch. Any new arrow is a data-map change under PRIV-001.

## 4. Consent

### 4.1 Consent and preference catalog (PROPOSED DECISION D-13-06)

Purpose codes are language-neutral labels stored on consent records (PERM-007); they are not requirement IDs.

| Purpose code | Permits | Default | Captured | Withdrawal | Status at launch |
|---|---|---|---|---|---|
| `operational_channel` (a preference, not a consent) | How service messages reach the contact: phone or email; text only after Section 4.3 | The channel chosen on the request | Form step 4; portal; staff on the customer's instruction | Changed at any time | Active (phone, email) |
| `marketing_email` | Promotional email: offers, seasonal and maintenance reminders, newsletters | Off (unchecked) | Form step 5 (optional, separate); portal | Any channel; effective for the next send | Active only after attorney-approved wording |
| `marketing_sms` | Promotional texts | Off | Not offered | Not applicable | Not offered (Section 4.3) |
| `operational_sms` | Service texts (confirmation, reminder, en route) | Off | Not offered | Not applicable | Not offered (Section 4.3) |
| `photo_publication` | Use of named photos, or of a job's photos selected later, on named channels | Off | After the job, on a separate consent form (portal or in person) | Any channel; stop new use at once (Section 5.7) | Active after attorney-approved wording |
| `review_request` | Asking for a public review | Off until classified | Separate | Any channel | Pending (Q-13-18) |
| `electronic_records` | Receiving records electronically, only if the attorney requires a consent | Per attorney | Agreement packet ([30](30-service-agreement-standards.md)) | Per attorney | Pending |
| `analytics_optional` | Non-essential analytics, only if such an option is ever chosen | Off | Website consent control | Any time | Not needed for [32](32-website-and-customer-experience.md) options A or C unless the attorney says otherwise (Q-13-08) |

Also PROPOSED in D-13-06: HandyHub never buys, rents or imports contact lists, and no consent is recorded for a contact who has not given it personally or through a contact with recorded authority.

### 4.2 Operational versus marketing messages (COM-004)

**FACT**: COM-004 "Marketing communication preferences are separate from operational service messages; consent must be stored according to applicable policy."

1. **Operational** messages deliver a service that was requested or contracted: NTF-001 to NTF-010, receipts, security notices for accounts ([27](27-roles-and-permissions.md) §10.4), complaint and rework communication, and a post-job feedback question about the completed job (NTF-011 when it is internal feedback; PROPOSED).
2. **Marketing** covers promotions, offers, newsletters, maintenance or seasonal reminders to past customers (for example gutter cleaning before fall for HI-06, re-staining for PT-02, re-engagement for CL-01), referral requests and requests for public reviews. Maintenance reminders and public review requests are treated as marketing until the attorney classifies them (Q-13-18).
3. Operational templates carry no promotional content, so a message never needs both classifications (PROPOSED).
4. No consent is inferred from a request, an estimate, an approval ([30](30-service-agreement-standards.md) AGR-019) or silence: "Do not infer permission to text or market from a phone number provided for a repair estimate." (privacy playbook) and "Lack of a complaint is not consent." (privacy verification).
5. Consent and suppression are checked by the sender at send time ([33](33-ai-and-automation-governance.md) AIG-024; [05](05-domain-model.md) DOM-050); review requests stay suppressed while a complaint or rework case is open (QA-009).
6. Automatic sending happens only for classes in the [33](33-ai-and-automation-governance.md) §12.6 auto-send register; otherwise a person releases each send (owner facts L18).
7. Marketing campaigns run only with the owner's explicit authorization ("Sending campaigns or enabling message automation requires explicit authorization in addition to appropriate data permissions.", privacy playbook).

### 4.3 Text-message consent (HUMAN REVIEW: attorney licensed in KY and/or IN)

**FACT**: no text-message provider is selected and the form offers no text option ([32](32-website-and-customer-experience.md) D-32-02, D-32-06, Q-32-11); account security messages use email until then ([27](27-roles-and-permissions.md) §7).

**PROPOSED DECISION D-13-07**: no text message is sent to a customer, operational or marketing, until all of the following exist:

1. Attorney-approved English and Spanish wording for operational texts and, separately, for marketing texts, with the attorney's classification of each NTF event.
2. A text-message provider approved in the vendor register (Section 10), with the provider and carrier registration requirements identified. [32](32-website-and-customer-experience.md) §5.4 row L6 lists candidate rules as leads only; this document states no texting requirement.
3. The consent-record fields and evidence the attorney requires, including whether IP or device data must be kept with web consent (Q-13-07; the [32](32-website-and-customer-experience.md) default keeps IP addresses out of requests).
4. Opt-out handling in English and Spanish, checked at send time and applied to operational and marketing texts as the attorney directs.
5. Quiet hours and volume limits recorded in the auto-send register ([33](33-ai-and-automation-governance.md) Q-33-04).
6. A dry-run test proving that a withdrawn number receives nothing.

Staff do not text customers from personal phones ([27](27-roles-and-permissions.md) AUTH-034); a masked business number is an open decision ([27](27-roles-and-permissions.md) Q-27-05).

### 4.4 Marketing photo consent (REC-003, AT-050)

**FACT**: REC-003 requires "separate permission"; AT-050 "Operational job photo is not automatically eligible for marketing; separate consent state is checked."; no verified portfolio exists (owner facts L12); [30](30-service-agreement-standards.md) AGR-019 keeps photo consent out of acceptance; [32](32-website-and-customer-experience.md) WEB-019 keeps it out of the request form.

**PROPOSED DECISION D-13-08**:

1. **Separate and specific.** Captured after the job on its own form that names the assets (or "photos of this job that we select later and show you"), the channels (website, HandyHub social accounts, print), the attribution (PROPOSED default: no customer name, street address or house number), any agreed duration and how to withdraw; versioned text in English and Spanish.
2. **Who may consent.** The customer, or a contact with a recorded authority flag ([27](27-roles-and-permissions.md) AUTH-028). For rentals and short-term rentals, whether the owner, tenant or host may consent, and how guests' belongings are handled, is Q-13-20.
3. **Never bundled** with a request, an estimate approval or a discount.
4. **Other people.** The customer's consent does not cover anyone else ("Do not assume property ownership grants permission to publish images of other people or sensitive belongings."). Identifiable people are cropped or blurred out, or the person's own consent is recorded.
5. **Children.** Images in which a child is identifiable are never published, even with consent (PROPOSED business rule).
6. **Evidence.** The consent record links the asset or job, notice version, language, method and recorder ("Retain permission evidence linked to the asset/job and the notice/version presented.").
7. **Eligibility.** Only ADM marks media marketing-eligible, only with an active consent record and a completed identifier review ([27](27-roles-and-permissions.md) D-27-15; [05](05-domain-model.md) DOM-047). AIR-009 reads consent state and approved derivatives only.
8. **Withdrawal** follows Section 5.7.

### 4.5 Cookies, browser storage and analytics

**FACT**: no analytics, tag manager, pixel or tracking script is configured ([32](32-website-and-customer-experience.md) §10.1). The planned inventory ([32](32-website-and-customer-experience.md) §10.4) is a CSRF token (strictly necessary), a language preference (functional), a form draft in session storage (cleared on submit) and analytics option A or C (no personal data).

PROPOSED (part of D-13-06, and D-13-24 for the authenticated apps):

1. Analytics never receives form values, contact details, free text, request references or identifiers ([32](32-website-and-customer-experience.md) WEB-040; "Avoid sending form values or sensitive identifiers to analytics.").
2. Whether the language preference or option A or C needs a consent mechanism is Q-13-08; the site launches only with items the attorney has cleared.
3. If an option that needs consent is ever chosen ([32](32-website-and-customer-experience.md) option B), scripts load only after consent, the choice is stored with the mechanism version, refusal holds on every page, and network inspection in both languages, with consent given and refused, proves it ("Do not claim that a banner blocks tracking unless network behavior verifies it.").
4. **D-13-24**: the customer portal and the worker app run no third-party analytics, session replay, advertising or similar SDK that can read screen content or URLs. Any error-monitoring tool is a vendor (Section 10) configured to drop request bodies and personal fields ([17](17-observability-and-operations.md)).
5. No advertising pixels, cross-site identifiers or session replay anywhere at launch ([32](32-website-and-customer-experience.md) D-32-11).

### 4.6 Consent record and evidence

This adopts the [05](05-domain-model.md) Consent record (purpose, channel, state, time, source and method, notice version shown, language, evidence, recorded by; append-only; the latest record is the current state; DOM-050). Additional rules:

- Method values (PROPOSED): web form checkbox, portal toggle, signed consent form (paper scanned in or on a staff device), staff-recorded customer instruction.
- Staff may record a grant of marketing or photo consent only by a method the attorney approves (Q-13-07). Staff-recorded withdrawals are always accepted.
- Web consent evidence: server time, form version, notice version and request reference. IP and device data are not stored by default; the attorney decides whether more is needed.
- Consent texts are controlled content with attorney and bilingual review sign-offs ([05](05-domain-model.md) Review sign-off; COM-006).

### 4.7 Withdrawal and suppression

- Withdrawal is accepted through any channel (phone, email, portal, in person, and reply keywords once texting exists), in English or Spanish, and recorded as a consent record by whoever received it.
- Marketing stops for the next send. Where a vendor keeps its own list, the withdrawal is pushed to it and the confirmation recorded; a provider's processing delay is reported as a delay, not as completion ("Distinguish provider processing delay from a completed removal.").
- A minimal suppression entry (channel identifier, channel, date, source) stays while HandyHub markets on that channel, so the opt-out survives an erasure request ("Retain minimal evidence needed to honor suppression where justified."). Whether the identifier is stored as a keyed hash is a [12](12-security-threat-model.md) design choice.
- A marketing withdrawal never changes operational messages unless the contact also changes the operational channel preference (COM-004 separation).

## 5. Photo and media handling

### 5.1 Lifecycle

```mermaid
flowchart TD
    A["Captured in the app at a workflow moment, or uploaded by a customer"] --> B["Server ingest: verify type and size, scan, strip metadata, make derivatives, hash"]
    B --> C["Stored privately as internal-only with job, task, work area, uploader and time"]
    C --> D{"Identifier flag: people, children, documents, screens, keypads, valuables, check"}
    D -->|"flagged"| R["Restricted: only the job's own customer, after review"]
    D -->|"not flagged"| E["Used for briefing, QA and invoice evidence"]
    E --> F{"photo-share holder reclassifies?"}
    F -->|"yes"| G["Customer-shareable: portal or in-app share to a contact with authority"]
    G --> H{"Active publication consent and identifier review complete?"}
    R --> H
    H -->|"yes, ADM"| I["Marketing derivative: crop or blur, metadata removed, media register entry"]
    I --> J["Published with owner authorization"]
    J --> K{"Consent withdrawn?"}
    K -->|"yes"| L["Stop new use, remove controlled copies, record actions"]
    C --> M["Retention clock: operational, safety, financial or contract class"]
    M --> N{"Legal hold?"}
    N -->|"no"| O["Delete original, derivatives and caches"]
    N -->|"yes"| P["Kept until the hold is released"]
```

### 5.2 Capture rules

1. **In the app only.** Job photos are captured in the worker app, never saved to the phone's camera roll, and the local copy is removed after a confirmed sync ([27](27-roles-and-permissions.md) AUTH-034, D-27-19).
2. **At workflow moments** (UXE-006; START-008; QA-003): arrival, existing condition, protection, concealed condition, progress, completion, cleanup, incident, customer-supplied item, check.
3. **Frame the work area.** Wait for people to leave the frame or retake; do not photograph children deliberately.
4. **No codes or screens.** Never photograph a lockbox code, keypad in programming mode, alarm panel display, Wi-Fi label or app screen; for HI-05, completion evidence never shows codes or account screens ([04](04-service-registry.md#HI-05) completion evidence).
5. **CL-06 and occupied homes**: "do not photograph/access personal records without need" (CL-06.SAF); avoid mail, documents, family photos, medication and other items that reveal private traits.
6. **CL-05 turnovers**: damage photos show the damage, not guests' personal items; delivery to the host follows Section 5.3, not the host's portal or texts, until Q-27-16 is decided (the current CL-05 SOP wording is held in [31](31-sop-standard.md)).
7. **Injuries**: photographed only if the injured person agrees and the incident record needs it; medical decisions belong to medical professionals (master §1.3).
8. **Customer uploads** (form and portal): microcopy asks customers not to include gate codes, lockbox codes or passwords ([32](32-website-and-customer-experience.md) §6.6); **RECOMMENDATION** for 32: add a line asking customers to leave people and documents out of uploaded photos. Uploads are internal-only and are not shared onward.
9. **Check images** are taken only in the payment flow and only if Q-13-16 keeps them.

### 5.3 Classification (REC-002)

| Class or flag | Meaning | Applies by default to | Who sets it | Visible to |
|---|---|---|---|---|
| internal-only | Staff use only | Every photo and file; lead uploads; check images | System | Staff with access to the job ([27](27-roles-and-permissions.md)) |
| customer-shareable | Visible in the portal to the job's customer and authorized contacts | None | photo-share holders ([27](27-roles-and-permissions.md) §4.1) | CUS own; staff |
| restricted (identifier flag) | Shows people, children, documents, screens or keypads, valuables, or is a check image | Check images automatically; others when flagged | The worker at capture, any staff member at review; cleared only by ADM after a retake or a derivative | Staff with job access; shared only with the job's own customer and authorized contacts, by a photo-share holder after review (check images never); nobody else |
| marketing-eligible (on a derivative only) | May be published | None | ADM only, with a consent record ([27](27-roles-and-permissions.md) D-27-15) | Public once published |

Rules: an internal-only photo stays hidden from the customer until a photo-share holder reclassifies it (AT-049). Photos reach hosts, property managers, landlords or builders only through in-app sharing to a contact with a recorded authority flag (AUTH-028, AUTH-034); uploads to a third party's own portal or personal texting need an owner-approved exception (Q-27-16, Q-13-15). Customer uploads are never re-shared to another party (PROPOSED).

Flag reconciliation (PROPOSED as part of D-13-02): the "identifier-review flag" of the [05](05-domain-model.md) Photo entity ("faces, children, documents, plates, valuables") and of [11](11-worker-job-execution.md) D-11-21 step 2 ("people, documents or plates") is this restricted flag, with the categories in the table above. Vehicles, plates, house numbers and street signs do not make a photo Restricted (Section 5.5); they are removed at the publication review instead (Section 5.7). 05 and 11 adopt this list (Section 19).

### 5.4 Metadata and originals (master §8 "EXIF/privacy handling"; PROPOSED DECISION D-13-09)

| Copy | Metadata rule | Kept? | Basis |
|---|---|---|---|
| Public lead upload, original | Not kept; only a re-encoded copy with all metadata removed | No: this confirms [32](32-website-and-customer-experience.md) D-32-07 ("Originals of lead uploads ... Not kept ... confirm in 13") | Minimization |
| Job evidence photo, original (in-app capture) | GPS, device identifiers, maker notes and embedded thumbnails removed at ingest; pixels kept at full resolution; capture time, uploader, job, task, work area and content hash kept as structured fields by the app ([05](05-domain-model.md) Photo) | Yes, for its retention class (NFR-004 "original retention where required") | Evidence without location tracking (SCH-004); Q-13-09 decides whether location evidence is ever kept |
| Previews and thumbnails | All metadata removed | Yes, with the original | [32](32-website-and-customer-experience.md) §6.3; [27](27-roles-and-permissions.md) workflow 8 |
| Shared copies (portal download, in-app share) | All metadata removed | Generated on request, not stored separately (PROPOSED) | AUTH-034 |
| Marketing derivative | All metadata removed; identifiers cropped or blurred | While the consent is active | REC-003 |
| Check image | All metadata removed | Per Section 7.2 row 10 | FIN-005 |
| PDF and other documents | Document metadata removed from stored derivatives where tools allow; lead PDF originals not kept; scanned and sandboxed ([32](32-website-and-customer-experience.md) §6.7) | Derivative only | Minimization |

The worker app does not request device location permission (master §22 "location permissions only when justified"; SCH-004; [11](11-worker-job-execution.md) D-11-22). The phone already removes location metadata from every derivative ([11](11-worker-job-execution.md) D-11-21 step 3); the server strips again at ingest, so a missed case on one device never reaches storage. Verification uses GPS-tagged JPEG, HEIC, PNG and WebP samples, including GPS held in XMP and in embedded thumbnails (hook 2).

**Originals by workflow moment** (answers [11](11-worker-job-execution.md) Q-11-09; PROPOSED as part of D-13-09; the evidence value is confirmed by the owner and the attorney under Q-13-09). A full-resolution original is uploaded and kept only where detail is the evidence; otherwise the compressed derivative is the only copy and the phone deletes the original after the derivative's confirmed upload.

| Workflow moment | Full-resolution original kept? | Reason |
|---|---|---|
| Existing condition | Yes | Pre-existing-damage evidence (X-02 in [02](02-gap-analysis.md)) |
| Concealed condition (before walls, ceilings, insulation or decking are closed) | Yes | Hidden-work evidence ([02](02-gap-analysis.md) G-154) |
| Incident | Yes | Insurer and attorney review (JOB-008) |
| Customer-supplied item check | Yes | Model and serial legibility (START-009) |
| Completion | Yes | QA evidence and walkthrough disputes (QA-003, QA-004) |
| Arrival, protection, progress, cleanup | No, unless the worker marks the photo as evidence | Process evidence needs no full detail |
| Check image | No; one metadata-free image | FIN-005 minimization |
| Public lead and portal uploads | No | [32](32-website-and-customer-experience.md) D-32-07 |

### 5.5 People, children, pets, plates, documents and valuables

| Identifier | Where it appears in HandyHub work | Capture rule | Sharing rule | Publication rule |
|---|---|---|---|---|
| Faces and people (occupants, guests, neighbors, other trades) | Interiors during CL-01 to CL-06 and PT-01; CL-05 turnovers; DW-04 sites with other trades | Frame them out or retake | Restricted flag; the customer's own job record only | Cropped or blurred, or the person's own consent |
| Children | Occupied homes (BRF-002 "children/occupants") | Never deliberately; retake | Restricted; job record only | Never published (D-13-08) |
| Pets | Occupied homes; yards (HI-10 fences, PT-02 decks) | Incidental only | Normal class | Only with the customer's photo-publication consent |
| Vehicles, plates, house numbers, street signs | HI-03 driveways, HI-06 gutters, HI-10 fences, HI-11 decks, PT-02 and PT-03 exteriors | Frame the work area | Normal class internally | Blurred or cropped before publication |
| Documents, mail, screens, keypads, alarm panels, Wi-Fi labels | HI-05 lock work; CL-06 rooms; home offices | Never photograph codes or account screens | Restricted; never outside the job record | Never published |
| Valuables and high-value items | HI-01 art installation; CL-06 "delicate/high-value property" | Only as pre-existing-condition evidence | Restricted | Never published (burglary risk) |
| Items that reveal health, religion or other private traits | Any interior | Avoid | Restricted | Never published |
| Injuries | Incidents (JOB-008) | Section 5.2 item 7 | ADM and the injured person ([27](27-roles-and-permissions.md) §4.7) | Never |

### 5.6 Storage, delivery and signed URLs (PROPOSED DECISION D-13-10)

1. Photos and files live in private object storage, encrypted at rest; there is no public bucket and no permanent link ([12](12-security-threat-model.md), [15](15-devops-infrastructure.md)).
2. Every file request passes the policy enforcement point ([27](27-roles-and-permissions.md) §5.4), which issues a short-lived, object-bound, read-only signed URL; the lifetime is set in [12](12-security-threat-model.md) (PROPOSED: minutes, not hours).
3. Links in emails and texts open the portal, never a raw file ([27](27-roles-and-permissions.md) AUTH-029); notification bodies never carry photos.
4. Customers download metadata-free derivatives, never originals.
5. The worker app caches thumbnails only inside the access window, encrypted, and wipes them on revocation ([27](27-roles-and-permissions.md) §5.2, §8.6).
6. Photos reach an AI provider only as [33](33-ai-and-automation-governance.md) AIG-009 allows (Section 15).

### 5.7 Publication and withdrawal

1. ADM selects a candidate photo and confirms an active `photo_publication` consent for that asset or job and channel.
2. Identifier review against Section 5.5 ("Check for faces, children, addresses, valuables, documents, plates, and metadata before publication.").
3. A derivative is made with authorized editing tools (crop, blur, metadata removed) and recorded in the media register with source asset, consent record, edits, channels and date ("Record approved derivatives and where published."); the register is the [32](32-website-and-customer-experience.md) §4.2 "Project photos" procedure.
4. Publication needs the owner's authorization (owner facts L18).
5. On withdrawal or expiry: stop new use at once; list published copies from the register; remove controlled copies (website, HandyHub accounts); record the actions; tell the customer what was removed and that copies others made (shares, search caches) may persist, without promising universal erasure ("Explain limits on third-party copies without promising universal erasure.").

## 6. Access secrets and field credentials

**FACT**: two critical, verified contradictions concern credentials: C-HI05-01 (the HI-05 drafts have workers "program emergency master codes" and "configure temporary guest access pin codes", while HI-05.SAF requires "have customer control personal account/password") and C-CL05-01 (the CL-05 SOP omits "protect access codes"). G-115 records that no storage, reveal, retention or purge rule exists. [27](27-roles-and-permissions.md) already defines the handling (AUTH-009, D-27-16, §4.6, §4.7, §5.2) and [31](31-sop-standard.md) D-31-16 the SOP wording; this section adds the privacy lifecycle.

| Step | Rule (PROPOSED) | Source |
|---|---|---|
| Collection timing | Requested only after a visit is confirmed, unless the customer volunteers it earlier; entered by the customer in the portal's secure field or by DSP or CSR during a call; never requested by text or email; never on the public form | D-13-04; COM-002; owner facts L17 |
| Wrong place | A code, password or card number found in free text (request description, note, message, caption) is replaced with a marker by an audited redaction action (ADM), and the customer is asked whether to keep the code in the secure field. Redaction is the only permitted change to an immutable snapshot such as the original request (PROPOSED DECISION D-13-05; PRIV-005). A code that reaches the business mailbox, voicemail or a business phone's texts (inventory row 11 secondary stores) is entered into the secure field and the original message is deleted from that store, including its trash, with the action noted on the job and the communication log keeping a redacted summary (JOB-009); if a legal hold covers that store, the message is kept and restricted instead (Section 7.4) (PROPOSED) | RECT-001; AUTH-035; business-systems-administrator playbook "Do not use free-text notes as a secret vault." |
| Storage | Encrypted field with its own key; never in notes, photos, exports, AI context or logs | AUTH-009; [08](08-data-model-and-database.md); [12](12-security-threat-model.md) |
| Reveal | Assigned workers on the service day; DSP and ADM; every reveal logged | [27](27-roles-and-permissions.md) §5.2; Section 9.2 |
| Retention | Cleared at job closeout; for recurring service, kept only on the customer's instruction, reconfirmed for each job and cleared when the plan ends or the instruction is withdrawn; the reveal log stays in the `audit` class | [05](05-domain-model.md) `secret` class; Section 7.2 row 5 |
| Physical keys | Custody log per person; the key tag carries a code, never the address; returned with a logged receipt when the arrangement ends; a lost key is a privacy and security incident | [27](27-roles-and-permissions.md) §4.6; Section 13 |
| Exposure | A code seen by an unauthorized person, sent in a message, captured in a photo or cached on a lost phone is a privacy incident; the owner decides with ADM whether to advise the customer or host to change it; any notification question goes to the attorney | [27](27-roles-and-permissions.md) §8.6 step 6; Section 13 |
| Customer credentials | Never stored; workers never type, see, photograph or write down customer passwords, master codes or Wi-Fi keys; the customer sets them on their own device | D-27-16; [31](31-sop-standard.md) D-31-16 |

## 7. Retention, disposal and legal holds

### 7.1 Rules (PROPOSED DECISION D-13-11)

1. Retention is category-specific and trigger-based; there is no universal period ("Do not invent a universal retention period.").
2. Two kinds of period. **Legal-minimum categories** (contract, safety, financial, workforce, consent and privacy records) get no proposed number; the cell names the reviewer who sets it. **Business-need categories** get a PROPOSED number for the owner to approve (Q-13-05) after the named reviewer confirms that no longer legal minimum applies ("Do not quote fixed legal deadlines, retention periods, fees, platform limits, or configuration syntax from memory.").
3. Approved values are stored as Business policy versions with the key `retention`, per record type, with trigger, period, disposal method, approver and review sign-offs ([05](05-domain-model.md) §5.4; NFR-019 preview and audit; [27](27-roles-and-permissions.md) §6.2 "retention settings" at L2).
4. Nothing is disposed of without an approved, active version; records without one are kept and reported as "retention pending" (PRIV-017). This keeps REC-004's warning against "indefinite collection of data without purpose" visible rather than silently ignored; the launch gate requires the schedule decision or a dated plan (Section 18.2).
5. A record that belongs to two classes follows the longest applicable period.
6. Legal holds suspend disposal and erasure in every class (Section 7.4).
7. Deletion is not hiding or archiving ("Distinguish deletion from hiding/archive."); disposal deletes or anonymizes (Section 7.3).
8. Disposal reaches derivatives, caches, search indexes, export files and, where the vendor supports it, vendor copies; backups expire on their own schedule (Section 12).
9. Retention clocks are set by the system from events ([05](05-domain-model.md) §6.3: "Job closed" starts the `operational` and `contract` clocks).
10. The schedule is reviewed at least annually (PROPOSED) and whenever a PRIV-001 trigger occurs.

### 7.2 Retention and disposal schedule (PROPOSED; every row needs the HUMAN REVIEW named)

Periods marked "PROPOSED" are business-need starting points, not legal minimums or maximums. Placeholders in backticks are decisions for the named professional; proposing a number there would mean quoting a legal or tax retention period from memory. **HUMAN REVIEW: attorney licensed in KY and/or IN** confirms, before any row is activated, that its period is not shorter than a legal minimum (with the CPA for rows 9 and 10); the Approver column names who else must approve.

| # | Records (inventory row) | Class | Clock starts | Period | Kind | Disposal (Section 7.3) | Approver (HUMAN REVIEW) |
|---|---|---|---|---|---|---|---|
| 1 | Unattached public uploads (1) | `transient` | Upload reserved | PROPOSED 24 hours (adopted from [32](32-website-and-customer-experience.md) D-32-07, WEB-020) | Business need | Delete | Privacy owner |
| 2 | Requests confirmed as spam and never converted (1) | `lead` | Staff confirm spam ([06](06-state-machines.md) lead state Spam, transition L10); a reopened lead leaves this row; a `spam_suspected` request nobody has reviewed is never disposed of ([32](32-website-and-customer-experience.md) "never silently discarded") | PROPOSED 30 days | Business need (review window, [32](32-website-and-customer-experience.md) §6.3) | Delete request, snapshot and files; keep a count | Privacy owner; attorney confirms |
| 3 | Requests, leads and site-assessment visits with no job (1, 7) | `lead` | Lead closed or lost | PROPOSED 24 months | Business need: returning and seasonal customers (for example HI-06, PT-02), duplicate checks | Anonymize: delete contact snapshot, description, answers and files; keep service codes, ZIP, dates, source and lost reason for RPT-001 | Privacy owner; attorney confirms |
| 4 | Customer, contact and property profile (2, 3) | `operational` | Last of: job closure, request, portal activity | PROPOSED review for anonymization after 36 months without activity | Business need: profile reuse (CX-005) | Anonymize identity and contact fields; delete site, pets and occupants notes; keep only fields that retained contract, financial or safety records need | Privacy owner; attorney; CPA for billing identity |
| 5 | Access secrets and key custody (4) | `secret` | Job closeout; for recurring service, plan end or withdrawn instruction | Cleared at the trigger ([05](05-domain-model.md) §2.5; [27](27-roles-and-permissions.md) AUTH-009) | Business need and security | Overwrite the encrypted value; return keys with a logged receipt; the reveal log stays in `audit` | Privacy owner |
| 6 | Operational job records: visits, schedule entries, tasks, checklists, notes, communications, non-incident photos, unacknowledged briefing snapshots (7, 8, 9, 11) | `operational` | Later of job closure and closure of linked complaints and rework cases | PROPOSED 36 months as a starting point; the attorney may lengthen it to cover claim periods; not activated before attorney confirmation | Business need: callbacks, rework, disputes, pre-existing-condition evidence (X-02) | Delete files, derivatives, note and message bodies; anonymize visits; keep job number, service codes and dates | Attorney; privacy owner |
| 7 | Contract records: estimate versions, agreement packets, approvals, signatures, change orders, scope snapshots, walkthroughs, customer-supplied item checks and their photos (6, 9) | `contract` | Job closed and disputes resolved | `<attorney: period>`; no number proposed; not shorter than row 6 | Legal minimum | Delete renderings and signature evidence; anonymize | Attorney; CPA ([30](30-service-agreement-standards.md) Q-30-19) |
| 8 | Safety records: incidents and injury sections, stop-work events, condition reports, site hazards, acknowledged briefing snapshots, acknowledgements, gate evaluations, overrides, hold releases, incident photos (8, 9, 17) | `safety` | Incident, hold or hazard closed | `<attorney + insurer + qualified safety professional>`; no number proposed; not shorter than row 7 | Legal and insurance minimum | Delete or anonymize; the injury section first | Attorney; insurer; qualified safety professional |
| 9 | Financial records (14) | `financial` | Accounting period closed | `<CPA: period for federal, Kentucky and Indiana records>`; no number proposed | Legal and tax minimum | Delete or anonymize after the period | CPA |
| 10 | Check images (15) | `financial` | Reconciliation sign-off covering the payment | PROPOSED 90 days, unless the CPA requires the image as a record (Q-13-16) | Business need: returned-check follow-up | Delete the image; the payment keeps the check number | CPA; privacy owner |
| 11 | Workforce records: employee, worker, qualifications, time entries, PPE issue, onboarding and offboarding records (19, 20) | `workforce` | Employment or engagement ends | `<employment attorney + payroll professional>`; no number proposed | Legal minimum | Delete or anonymize | Employment attorney; payroll professional |
| 12 | Time-off and unavailability reasons (19) | `workforce` | Date of the absence | PROPOSED: free-text reason deleted after 12 months; dates kept with row 11 | Minimization | Redact the reason | Employment attorney |
| 13 | Consent records and suppression entries (12) | `consent` | Withdrawal or end of the relationship | `<attorney: evidence period>` for consent records; the suppression entry is kept while HandyHub markets on that channel | Legal evidence; business need to honor opt-outs | Delete consent history after the period; keep the minimal suppression entry | Attorney |
| 14 | Marketing send history (13) | `consent` | Send | PROPOSED 24 months | Business need: complaints, frequency control | Delete | Privacy owner; attorney confirms |
| 15 | Marketing media derivatives (10) | `consent` | Consent withdrawn or its agreed duration ends | Stop new use at once; removal from controlled channels within `<owner decision: target>` | Consent | Remove and delete the derivative; record actions | Privacy owner |
| 16 | Audit events (21) | `audit` | Event time | PROPOSED: at least as long as the record they describe; authentication, denial and step-up events 12 months | Accountability and security need | Delete after the period | IT/security; attorney |
| 17 | Abuse and rate-limit logs; hosting and CDN access logs (21) | `transient` | Log time | PROPOSED 30 days where the provider allows; the provider default is recorded in the vendor register | Security need | Delete | IT/security; attorney confirms |
| 18 | Sessions, upload reservations, tokens (21) | `transient` | Creation | As set in [12](12-security-threat-model.md) | Security | Delete | IT/security |
| 19 | Export files (24) | `transient` | Generation | PROPOSED 7 days | Business need: download window | Delete the file; the export audit event stays | Privacy owner |
| 20 | AI records (22) | `audit` | Per [33](33-ai-and-automation-governance.md) §8.3 | Class A: as the record it changed; class B: PROPOSED 12 months; class C: PROPOSED 30 days; class D: with its task-policy version | Business need ([33](33-ai-and-automation-governance.md) Q-33-06) | Delete class C text keeping hashes; delete class B | Privacy owner; attorney; CPA |
| 21 | Worker phone caches (8, 9) | `transient` | Access-window end or revocation | Wiped at the window end, or at the next contact after revocation ([27](27-roles-and-permissions.md) §5.2, §8.6) | Security | App wipe | IT/security |
| 22 | Business mailbox, business phone logs, voicemail and texts outside the app (11) | `operational` | Message date | PROPOSED 24 months unless copied into the job record or under hold | Business need | Provider-side deletion | Privacy owner; attorney confirms |
| 23 | Voice-note audio, if ever enabled (8) | `transient` | Transcript verified | PROPOSED 7 days | Minimization | Delete audio; the transcript is a note | Privacy owner; attorney ([33](33-ai-and-automation-governance.md) Q-33-14) |
| 24 | Paper (26) | By content | Scan verified or job closed | Signed paper originals `<attorney>` (Q-13-19); other paper PROPOSED shredded within 30 days of a verified scan; checks follow the bank-deposit routine | Minimization | Cross-cut shredding; keys returned | Attorney; privacy owner |
| 25 | Privacy requests, erasure records, legal holds, privacy incidents, vendor register entries (27) | `audit` | Closure or release | `<attorney>`; no number proposed; erasure records kept at least while any backup older than the erasure exists | Legal evidence | Delete after the period | Attorney |
| 26 | Backups, including object-storage noncurrent versions and write-once copies (all rows) | Not a class | Backup time | `<value set in 15>`; finite; PROPOSED 35-day ceiling for routine application backups; longer archives only with privacy-owner approval | Recovery need | Expire | Privacy owner; IT/security (prepared under swe-quality-delivery); attorney and CPA confirm no record depends on a backup ([07](07-system-architecture.md) D-07-15) |
| 27 | Analytics aggregates (23) | None | Not applicable | No personal data; kept as business statistics | Not applicable | Not applicable | Owner |
| 28 | Job applicant data (28) | `workforce` | Hiring decision | `<employment attorney>`; nothing is collected before a hiring process exists (G-083) | Legal minimum | Not applicable | Employment attorney |
| 29 | Privacy notice versions, consent-text versions and other versioned content (27) | `content` | Version retired and no retained record references it ([05](05-domain-model.md) §2.5) | Kept while any retained request, consent record, agreement packet or privacy request references the version; no fixed period | Evidence: shows what each person was told (Section 4.6) | Delete retired, unreferenced versions | Privacy owner; attorney |

### 7.3 Disposal and anonymization methods

| Method | Used for | How | Evidence |
|---|---|---|---|
| Delete | Files and derivatives, transient data, caches, export files | Remove the object, every derivative, cached copy and search entry; ask vendors to delete their copies where they support it | Automation run with counts by record type, never contents |
| Anonymize | Records kept for statistics or linkage (leads, customers, visits) | Replace names, contact details and street address with an irreversible token; delete free text, files and any access secret; keep service codes, dates, ZIP and amounts | Automation run with counts |
| Redact | Free text holding secrets, card numbers, third-party data or health details beyond need | Replace the value with a marker such as `[access code removed]` through an audited action | Audit event with reason, without the removed value |
| Minimize and restrict | Records kept after an erasure request because of a legal minimum or hold | Remove fields the retained purpose does not need; restrict to BKP and ADM, or ADM only | Erasure record |
| Physical | Paper and keys | Cross-cut shredding; key return with a logged receipt | Disposal log entry |

Anonymized records are for internal statistics only and are never published, because a rare service, a ZIP and a date can still point to one household (PROPOSED).

### 7.4 Legal holds (PROPOSED DECISION D-13-12)

| Element | Rule |
|---|---|
| Triggers | A claim, demand or threatened dispute; an incident with injury or property damage (JOB-008); a complaint with material legal or financial exposure (master §1.3); an insurer, government or law-enforcement inquiry; a privacy or security incident under investigation; attorney instruction |
| Who places | ADM (the owner) on attorney advice, or at once on a trigger with attorney review to follow; CSR and LWK can request one |
| Scope | Named customers, properties, jobs, incidents, workers and date ranges, across record types, files, mailboxes, vendor copies, staff devices and paper |
| Effect | Disposal and erasure stop for records in scope; the disposal workflow and the erasure procedure check holds before acting (PRIV-017, PRIV-020); held records stay live, and backups are not relied on as a hold |
| Custodian notice | Staff who may hold relevant data (phones, mailboxes, paper) are told in writing what to keep; wording by the attorney |
| Review and release | Reviewed at `<owner decision: cadence>` (PROPOSED quarterly); released only on attorney instruction; disposal resumes from the release date |
| Record | Reason, scope, placed by, attorney reference, dates, release; L2 step-up; audited; class `audit` |
| AI | AI may flag a possible trigger in a draft; it never places or releases a hold ([33](33-ai-and-automation-governance.md) §6.1) |

### 7.5 Feature specification: retention, disposal and legal holds

| Aspect | Specification |
|---|---|
| Goal | Finite, category-specific retention without premature deletion |
| Requirements | PRIV-016, PRIV-017, PRIV-018; REC-004; PERM-005; [05](05-domain-model.md) DOM-053 |
| Design | Retention values as Business policy versions (key `retention`); retention-clock fields on each record type; a SYS disposal workflow ([33](33-ai-and-automation-governance.md) registry row 15 "Retention and disposal") running in small batches; a dry run before the first live run of each category; holds checked per record |
| Data | Business policy version; Legal hold (new, Section 19); Automation run; retention status and clock fields ([08](08-data-model-and-database.md)); the photo "retention status" of RECT-006 |
| API (indicative; [09](09-api-contracts.md) owns) | `GET /api/admin/v1/retention/pending` · `POST /api/admin/v1/retention/{recordType}/dry-run` · `POST /api/admin/v1/legal-holds` · `POST /api/admin/v1/legal-holds/{id}/release` |
| UI | Retention settings with preview (NFR-019); "retention pending" report; hold list with scope and review date; dry-run report with counts per record type ([10](10-frontend-ux-plan.md)) |
| Security | L2 step-up for activating a retention version, placing or releasing a hold and starting the first live run of a category ([27](27-roles-and-permissions.md) §6.2); the SYS identity can only dispose |
| Performance | Batches outside business hours; idempotent by record ID and policy version ([33](33-ai-and-automation-governance.md) AIG-021) |
| Tests | Hooks 4 and 5 (Section 18.1): a category without an approved version disposes of nothing; a held record survives a run |
| Rollback | Disposal cannot be undone, so: dry run, owner approval of each category's first run, batch limits and a kill switch ([33](33-ai-and-automation-governance.md) AIG-025); a wrong policy version is superseded before the next run |
| Monitoring | Run results and failures to the exception list ([33](33-ai-and-automation-governance.md) AIG-023); count of records past due under "retention pending"; holds past their review date ([17](17-observability-and-operations.md)) |
| Documentation | This section; runbook "disposal run failed or removed too much" in [17](17-observability-and-operations.md) |

## 8. Privacy requests: access, correction, deletion and anonymization

### 8.1 Request types (PROPOSED DECISION D-13-13)

PROPOSED business policy: HandyHub handles every request below through one workflow, whether or not a statute requires it; legal deadlines and exceptions come from the attorney (Q-13-10).

| Type | Who may ask | What HandyHub does | Limits | Timing |
|---|---|---|---|---|
| Access (copy) | A customer, contact, worker or former worker about their own data | Copy of their personal data: profile, requests, communications, approvals, invoices and receipts, customer-shareable photos, and internal records about them where the attorney agrees | Other people's data removed; legal-claim notes, security records and privileged material per attorney | `<attorney: legal deadline, if any>`; internal target `<owner decision>` |
| Correction | Same | Correct contact and profile data directly; for frozen or append-only records (approvals, invoices, acknowledgements) add a correction record instead of editing (REC-001, PERM-005) | A fact recorded at a moment, such as a signed approval, is not rewritten | As above |
| Deletion or anonymization | Same | Section 8.4 | Legal minimums, holds, records needed for claims | As above |
| Marketing opt-out | Any contact | Suppress at once (Section 4.7) | None | Next send |
| Photo-consent withdrawal | The consenting contact | Section 5.7 | Copies others made | Stop new use at once |
| Other rights a statute may grant | Per Q-13-01 | Added only after the attorney's answer | Per attorney | Per attorney |
| Requests by representatives (attorney, agent, family member, landlord) | A person acting for a customer, contact or worker | The attorney decides what authority evidence is needed; "A caller claiming to be a landlord cannot receive a tenant's records without authorization." (customer-service playbook) | No disclosure without verified authority | Per attorney |
| Third-party and legal-process requests for someone else's records (police, courts and subpoenas, insurers and adjusters, opposing parties, other contractors, a new owner of a property) | Anyone other than the data subject or a verified representative | Staff do not answer on the spot; the request is logged and the owner decides with the attorney what, if anything, is disclosed (**HUMAN REVIEW: attorney licensed in KY and/or IN**, Q-13-21); a disclosure is a scoped adviser export (Section 11); a possible claim also triggers a legal hold (Section 7.4) | Only the scope the attorney approves; access secrets never | Per attorney |

The Cleaning plan already expects insurer use of job photos ("photograph any guest damages for insurance claims", [Cleaning plan](../Main%20Plans/Cleaning%20Business.md)), so insurer requests should be expected for CL-05 work.

A new customer at an address HandyHub served before cannot obtain the earlier customer's records ([27](27-roles-and-permissions.md) §5.1 rule 1).

### 8.2 Workflow

```mermaid
flowchart TD
    A["Request received by phone, email, portal or in person"] --> B["Log a privacy request: channel, requester, type, date"]
    B --> C{"Identity verified through the contact on file?"}
    C -->|"no"| C2["Verify through the contact on file, no ID documents, close as unverified if it fails"]
    C -->|"yes"| D["Locate records: application, files, mailbox, vendor logs, exports, AI records, paper, staff devices"]
    D --> E{"Hold, legal minimum or other people's data?"}
    E -->|"yes"| F["Mark retained items and reasons, attorney where unclear"]
    E -->|"no"| G["Plan: copy, correct, delete or anonymize"]
    F --> G
    G --> H["Privacy owner approves with L2 step-up, dry run for erasure"]
    H --> I["Execute: copy, correction record, erasure procedure, vendor deletion requests"]
    I --> J["Verify search, files, caches and vendors, then write the erasure record"]
    J --> K["Respond to the verified contact with the approved EN or ES template"]
    K --> L["Close and keep the request record per Section 7.2 row 25"]
```

### 8.3 Identity verification

1. Verify through the contact on file: a single-use link or code to the email on file (text only after Section 4.3), or a call back to the phone on file, never to a number supplied in the request ([27](27-roles-and-permissions.md) §8.3).
2. No identity documents, selfies or new identifiers ("verify identity proportionately without collecting excessive new data"; Section 2.3 Never stored).
3. Verification depth rises with what is disclosed or deleted: a marketing opt-out needs none; a copy of records or an erasure needs a verified contact; a request that changes the contact on file is never fulfilled in the same interaction ([27](27-roles-and-permissions.md) §8.3).
4. Workers and former workers: in person with the owner, through their own account while it is active, or by a call back to the contact details in their employee record.
5. Failed verification: the request is closed as unverified and the requester is told how to verify; nothing is disclosed.

### 8.4 Erasure method by record group (PROPOSED DECISION D-13-14)

| Record group | No hold and no legal minimum | Legal minimum or hold applies |
|---|---|---|
| Requests and leads with no job | Delete snapshot, contact details, description, answers and files | Keep, restricted; erase when the hold ends |
| Customer, contact, property | Anonymize names, phones, emails and street address; delete site, pets and occupants notes, access secrets and authority flags | Keep only the identity fields that retained contract, financial or safety records need, restricted |
| Photos and files | Delete originals, derivatives and cached copies | Keep only files attached to retained contract, safety or financial records, restricted |
| Notes and communications | Delete bodies; keep date, channel and template reference where the job record needs them | Keep, restricted |
| Contract records | Not applicable: a legal minimum applies (Section 7.2 row 7) | Keep until the period ends, restricted, personal fields minimized |
| Financial records | Not applicable (row 9) | Keep the identity fields the CPA requires, nothing else |
| Safety and incident records | Not applicable (row 8) | Keep, restricted; injury section ADM only |
| Consent records | Keep the withdrawal and the minimal suppression entry so opt-outs keep working | Same |
| Audit events | Keep; personal values are not stored in them (PRIV-023), so nothing is rewritten | Same |
| AI records | Delete class C text and class B metadata about the person; class A follows its record | Same |
| Vendor copies (email and text logs, AI provider, accounting system) | Ask each vendor to delete as its terms allow; record the confirmation or the limitation | Keep per hold |
| Backups | Not rewritten; the erasure record is re-applied after any restore (PRIV-021); backups expire per row 26 | Same |
| Staff devices and personal accounts | Ask staff to delete copies and record the confirmation ([27](27-roles-and-permissions.md) §8.4 step 7) | Ask staff to preserve per the hold notice |
| Paper | Shred | Keep per hold |

The erasure record holds record type, identifier, date, method and approver, and no personal data.

### 8.5 Response and records

- Responses use attorney-reviewed English and Spanish templates and go only to the verified contact.
- Copies are delivered as an expiring portal download, or, for a person without portal access (a lead who never became a customer, a former worker), an expiring single-use link sent to the verified contact (Section 11); never as email attachments.
- The request record keeps: received at, channel, type, requester, verification method and result, scope searched, decision and reasons, actions, vendor confirmations, response sent at, closed at. It is Restricted and kept per Section 7.2 row 25.
- AI may draft searches and redaction suggestions; it never decides, discloses, deletes or sends ([33](33-ai-and-automation-governance.md) §6.1 privacy row).

### 8.6 Feature specification: privacy requests and erasure

| Aspect | Specification |
|---|---|
| Goal | Every request handled consistently, with verified identity, no over-disclosure and provable completion |
| Requirements | PRIV-019, PRIV-020, PRIV-021; OWN-007; [27](27-roles-and-permissions.md) AUTH-010 |
| Design | Privacy request record; an erasure planner that lists every record linked to the person across contexts ([05](05-domain-model.md) §4.1), marks holds and legal minimums, and produces a dry-run plan; execution by the audited erasure command; vendor deletion checklist |
| Data | Privacy request and Erasure record (new, Section 19); links to customer, contact, worker and user account |
| API (indicative; [09](09-api-contracts.md) owns) | `POST /api/admin/v1/privacy-requests` · `POST /api/admin/v1/privacy-requests/{id}/erasure-plan` · `POST /api/admin/v1/privacy-requests/{id}/execute` · `GET /api/admin/v1/privacy-requests/{id}/copy` |
| UI | Request queue with status and due date; plan review screen with retained items and reasons; verification steps; EN/ES response templates ([10](10-frontend-ux-plan.md)) |
| Security | ADM only; L2 step-up for copy and execution ([27](27-roles-and-permissions.md) §6.2 "Customer data export for a privacy request"); copies expire |
| Performance | Erasure runs as a background job per request; no table-wide locks |
| Tests | Hook 4 (deletion rehearsal with synthetic data; "Do not perform destructive production deletion as an unapproved test."); hook 14 (restore re-applies erasure) |
| Rollback | Erasure cannot be undone: dry-run plan, owner approval with step-up, second confirmation, batch per person |
| Monitoring | Overdue requests; failed vendor deletions; requests closed without verification ([17](17-observability-and-operations.md)) |
| Documentation | This section; staff guide for receiving requests by phone (EN/ES) |

## 9. Employee, administrator and vendor access

### 9.1 Purpose and access summary

[27](27-roles-and-permissions.md) governs every permission. This table is the privacy-purpose view the privacy skill asks for ("Specify who needs each category and why.").

| Role | Why it needs personal data | Restricted data it may see | Never sees |
|---|---|---|---|
| WKR, LWK | Do assigned work safely (BRF-001 to BRF-014) | Access secrets on the service day (logged); risk-and-safety notes | Prices without collect; cost and margin; HR data; other jobs; check images after sync |
| DSP | Assign, schedule and notify (ROLE-005) | Access secrets (logged); staff directory (name, phone, tags, hours) | HR and pay fields; injury detail; legal and fraud notes |
| ESTR | Scope and price estimates (ROLE-006) | Cost and margin on own estimates (Confidential) | Access secrets; HR; check images |
| CSR | Leads, communications, complaints (ROLE-007) | Complaint notes | Access secrets (write-only); check images and bank references (payment status and payment notes are read-only, [27](27-roles-and-permissions.md) §4.4, §4.8); HR |
| BKP | Billing and reconciliation (ROLE-008) | Check images, bank references, payee bank details, fraud notes | Field data unless needed; HR beyond payroll fields |
| ADM | Administration (ROLE-009) | All Restricted classes, every read logged | Customer device credentials and card data (never stored) |
| CUS | Own records (ROLE-002) | Own customer-shareable records | Internal-only photos; internal notes; other customers |
| SUB (P1) | Assigned work package only (ROLE-010) | Access secrets for the package on the service day | Billing; other packages |
| AI (P1) | Drafts for the invoking user | None of the Restricted classes ([33](33-ai-and-automation-governance.md) §4.2) | Access secrets, card data, check images, injury detail, HR, legal and fraud notes |
| SYS | Declared workflows ([27](27-roles-and-permissions.md) §10.4) | Only what a workflow declares | Everything else |

### 9.2 Sensitive-read logging (REC-005; PROPOSED DECISIONS D-13-15 and D-13-16)

REC-005 says administrative access to "sensitive customer, employee, payment or incident records should be auditable". "Sensitive" is defined here as the Restricted class plus bulk access. These reads are logged with actor, role or capability used, object type and ID, field class, time and client type, and, because the purpose is security (RECT-011), IP and device data:

| Logged event | Reviewed |
|---|---|
| Reveal of an access secret ([27](27-roles-and-permissions.md) AUTH-009, AUTH-015) | Access review; spot check of reveals outside service days |
| View of a check image or bank reference | Access review |
| View of injury and medical detail | Access review |
| View of employee/HR, legal or fraud notes | Access review |
| View of payment details by a role other than BKP | Access review |
| Customer or contact search or list that returns records beyond the actor's assignments above a threshold set in [12](12-security-threat-model.md) (query type and count logged, never the search terms) | Access review |
| Any export (Section 11) | Each export reviewed at the access review |
| Read of AI class C raw text ([33](33-ai-and-automation-governance.md) §8.4) | Access review |
| Infrastructure access to databases, storage or backups (infrastructure audit log in [15](15-devops-infrastructure.md); break-glass record) | Every use |
| Backup restore | Every restore |

Not logged as sensitive reads: an assigned worker opening their own job, a CSR opening one customer record, a customer viewing their own records; logging every routine view adds noise without protection (PROPOSED).

Rules:
- No "sign in as another user" feature exists (PROPOSED), because it would defeat attribution.
- The owner reviews the sensitive-read log at each access review ([27](27-roles-and-permissions.md) AUTH-031; PROPOSED monthly, Q-27-12); an unexplained read starts privacy-incident triage (Section 13).
- **D-13-16 (audit content)**: an audit event records a change to a Personal or Restricted field as the field name plus a change marker, not the raw old and new values; amounts, statuses, policy values, roles and capabilities keep old and new values (AT-057). IP and device data appear only on authentication, step-up, denied-access, sensitive-read (the events in the table above, including reveals and exports) and administrative security events. This keeps the append-only audit log compatible with erasure (Section 8.4); [12](12-security-threat-model.md) must confirm that it does not weaken tamper evidence.

### 9.3 Administrator, infrastructure and break-glass access

- The owner is the only ADM at launch ([27](27-roles-and-permissions.md) §11); all staff accounts are named, MFA-protected and never shared ([27](27-roles-and-permissions.md) AUTH-016, AUTH-018).
- Direct database, storage or backup access bypasses application controls, so it is break-glass only: owner approval, a named infrastructure account with MFA, a reason, and a record reviewed afterwards ([27](27-roles-and-permissions.md) §3.3; [15](15-devops-infrastructure.md)).
- Vendor support staff get access only through a ticket with a time-limited grant where the vendor supports it; standing vendor access to customer data is not allowed (PROPOSED).
- Domain, hosting, repository and analytics accounts are business-owned ([32](32-website-and-customer-experience.md) WEB-041).

### 9.4 Worker and employee data

- **No location collection.** GPS is not collected; status times are events the worker enters; the app requests no location permission (SCH-004; master §22; PRIV-024). Any proposal to collect location needs owner and privacy-owner approval and employment-attorney review before design.
- **No activity monitoring** of screens, keystrokes or personal accounts (PROPOSED); time entries follow the timekeeping policy (**HUMAN REVIEW: payroll professional**). The lone-work check-in that [11](11-worker-job-execution.md) D-11-12 proposes for flagged jobs is a timed check-in, not location tracking, and is built only after its approval, which includes the qualified safety professional and the employment attorney. This document raises no privacy objection to it: it records check-in times and the alert outcome only, and privacy rules never delay or weaken a safety control.
- **Personal phones** (if used, [27](27-roles-and-permissions.md) Q-27-05): HandyHub manages only its own app data; "a lost personal device does not automatically authorize wiping all personal data" (IT playbook).
- **What customers see** (PROPOSED DECISION D-13-26, pending Q-27-08): the worker's first name only; no photo, vehicle, personal phone number or home address in notifications or the portal (SCH-006; PRIV-025).
- **Complaints about a worker** are kept with the complaint as Restricted (ADM and CSR); whether and how the worker sees them is an employment-attorney question (Q-13-11).
- Workers receive the internal privacy notice of Section 16.3 before their account activates (PRIV-033).

### 9.5 Vendors, advisers and customer-side recipients

- Processors receive only the data classes approved for them in the vendor register (Section 10; PRIV-026).
- Advisers (attorney, CPA, insurance broker) receive scoped exports through a channel they and the owner agree, logged as exports (Section 11); the bookkeeper's account follows [27](27-roles-and-permissions.md) Q-27-02.
- Customer-side recipients (hosts, property managers, landlords, builders) receive job data only through app sharing to a contact with a recorded authority flag ([27](27-roles-and-permissions.md) AUTH-028; PRIV-039).

### 9.6 Developers and AI coding agents

- Development and staging use synthetic data only; production personal data, photos and backups never enter them (NFR-015; [27](27-roles-and-permissions.md) §3.3; PRIV-030).
- Production troubleshooting uses record IDs and logs without personal data ([17](17-observability-and-operations.md)); any need to see production data is break-glass by the owner.
- AI coding agents receive no customer data ([24](24-ai-agent-development-guide.md); [33](33-ai-and-automation-governance.md) §15.2).

## 10. Vendors and processors

### 10.1 Vendor register (state on 2026-10-03)

**FACT**: no processor is selected ([32](32-website-and-customer-experience.md) §1.1, §11.2; [33](33-ai-and-automation-governance.md) §1.2; owner facts L10). The register starts as this table and becomes a controlled register maintained by the privacy owner once vendors are chosen (PROPOSED DECISION D-13-17).

| Vendor category | Personal data it would receive (inventory rows) | Status | Decided in | Privacy conditions before approval |
|---|---|---|---|---|
| Hosting and application runtime; managed database | All application data | Not selected | [07](07-system-architecture.md), [15](15-devops-infrastructure.md) | Region recorded; admin access controls; access logs |
| Object storage for photos and files | 9, 10, 15, 24, 26 | Not selected | [15](15-devops-infrastructure.md) | Private buckets; encryption; no public links |
| Backup storage | All | Not selected | [15](15-devops-infrastructure.md) | Section 12 |
| Identity and authentication service or library | 19, 21 | Not selected | [07](07-system-architecture.md), [12](12-security-threat-model.md) | No biometric data received; session revocation |
| Transactional email delivery | 1, 2, 7, 11 | Not selected | [07](07-system-architecture.md) | Message-log retention known; no open-tracking pixels in operational mail, consistent with [06](06-state-machines.md) D-06-24 "email open tracking is not used" |
| Business mailbox and office suite | 11 and anything customers email | Unknown (domain and mailbox not established, owner facts L3; [02](02-gap-analysis.md) G-111) | [15](15-devops-infrastructure.md) | Built-in AI features off until approved (AIG-014) |
| Text-message provider | 2, 7, 11 | Not selected; not at launch | [32](32-website-and-customer-experience.md) Q-32-11 | Section 4.3 |
| Business phone or masked calling | 2, 11 | Not selected | [27](27-roles-and-permissions.md) Q-27-05 | No call recording unless Q-13-17 approves |
| Payment provider | 14, 16 | Not selected (owner facts L10) | [28](28-pricing-estimating-and-job-costing.md), [07](07-system-architecture.md) | Card data only in provider components (AUTH-035) |
| Accounting system | 14 | Not selected | [28](28-pricing-estimating-and-job-costing.md) | Exports limited to accounting fields |
| Payroll provider | 19, 20 | Not selected | Owner; payroll professional | Employment attorney review |
| AI providers, including AI built into business software | 22 and whatever a task policy retrieves | Not selected | [33](33-ai-and-automation-governance.md) §11 | [33](33-ai-and-automation-governance.md) §11.2 checklist; Section 15 |
| Speech-to-text (voice notes) | 8 | Not selected; feature off | [33](33-ai-and-automation-governance.md) Q-33-14 | Section 15 voice-note policy |
| Malware scanning for uploads | 1, 9 | Not selected | [12](12-security-threat-model.md) | Whether files leave HandyHub's environment |
| Error monitoring and logging | 21 (IDs only) | Not selected | [17](17-observability-and-operations.md) | Request bodies and personal fields dropped |
| Web analytics | 23 (no personal data) | Not selected | [32](32-website-and-customer-experience.md) Q-32-12 | Section 4.5 |
| CDN, DNS and domain registrar | 21 (access logs) | Unknown ([32](32-website-and-customer-experience.md) Q-32-01) | [15](15-devops-infrastructure.md) | Log retention recorded |
| E-signature service | 6 | Not selected ([30](30-service-agreement-standards.md) option 5) | [30](30-service-agreement-standards.md) | Data-processing review |
| Email marketing tool | 12, 13 | Not selected | Owner | Suppression sync (Section 4.7) |
| Password manager | Credentials of staff accounts, no customer data | Not selected | IT/security | Business-owned vault |
| Device management (company phones only) | Device identifiers | Not selected | [27](27-roles-and-permissions.md) Q-27-05 | Employment attorney for any personal-phone use |
| Shredding service (if used) | 26 | Not selected | Owner | Certificate of destruction |
| Map app used by a worker for directions | 3 (address only) | The phone's own map app, not a HandyHub vendor ([11](11-worker-job-execution.md) D-11-22) | [11](11-worker-job-execution.md) | Address only; no location returned to HandyHub |
| Maps, geocoding, route and ETA service | 3 (addresses) | NOT CONFIGURED at MVP; route and ETA are P1 (NEAR-001; [07](07-system-architecture.md) §15, D-07-17) | [07](07-system-architecture.md) | Address only, never the customer's name or access notes; provider retention known; ZIP coverage stays internal; no worker location collected (PRIV-024) |
| Web push (the browsers' own push services) | 7, 8 (job number only) | NOT CONFIGURED ([07](07-system-architecture.md) §15) | [07](07-system-architecture.md) | Payload limited to a job number and a short prompt; no names, addresses, codes or photos |
| Third-party spam challenge on the public form | 1 (visitor device and behavior signals) | Not at launch ([32](32-website-and-customer-experience.md) D-32-08) | [32](32-website-and-customer-experience.md) | Only after privacy, accessibility and consent review (Q-13-08) |

### 10.2 Approval checklist and data-processing terms

Evidence comes from the vendor's current official documents or contract, recorded with URL and date checked; an unavailable verification stays unverified ([privacy sources](../Skills/Website%2C%20software%2C%20and%20cybersecurity/business-privacy-data-owner/references/sources.md)). This generalizes [33](33-ai-and-automation-governance.md) §11.2 to every processor.

| Item | Evidence required | Reviewer |
|---|---|---|
| Purpose and data classes | Which inventory rows the vendor receives and why | Privacy owner |
| Secondary use and training | Whether the vendor uses HandyHub data for its own purposes, including model training, and how that is turned off | Privacy owner; attorney |
| Retention, deletion and return | What the vendor keeps and for how long, deletion on request and at contract end | Privacy owner |
| Subprocessors and locations | List and processing locations | Privacy owner; attorney |
| Security | MFA or SSO, admin roles, audit logs, encryption, key management, any attestations offered | IT/security |
| Incident notice | Whether, how and how quickly the vendor tells HandyHub about an incident, as stated in current terms | Privacy owner; **HUMAN REVIEW: attorney** |
| Requests and holds | Ability to export, delete or preserve a person's data on HandyHub's instruction | Privacy owner |
| Exit | Export in usable formats (NFR-014) | Owner |
| Contract or data-processing terms | Whether a written data-processing agreement is needed and what it must say | **HUMAN REVIEW: attorney licensed in KY and/or IN** |
| Cost | From current vendor documents, never from memory | Owner |
| Disclosure | Privacy notice and data map updated before go-live (PRIV-001) | Privacy owner; attorney |

PROPOSED topics for the attorney to consider in data-processing terms (a checklist, not legal advice): purpose limitation; confidentiality; security measures; subprocessor notice; incident notice to HandyHub; assistance with requests and holds; deletion or return at the end; no training or secondary use; processing locations. A vendor approved for one data class is not approved for another; a vendor approved for text is not approved for photos ([33](33-ai-and-automation-governance.md) §11.2).

### 10.3 Lifecycle: change, review and offboarding

- A change in a vendor's terms, subprocessors or locations triggers a review before the change takes effect where possible.
- Every approved vendor is reviewed at least annually (PROPOSED) and at contract renewal.
- Offboarding: export what HandyHub needs, instruct deletion or return, record the confirmation or the limitation, revoke credentials and app grants ("Review OAuth/app grants and stale sessions, not just passwords."), and update the notice.
- AI features built into business software (email, office, messaging, phone) stay off until approved ([33](33-ai-and-automation-governance.md) §11.1, AIG-014).

## 11. Exports (NFR-014, REC-006; PROPOSED DECISION D-13-18)

| Export | Who | Control | Contains | Never contains | Delivery | Expiry |
|---|---|---|---|---|---|---|
| Customer-facing job packet (REC-006, AT-060, AT-048) | CSR for one customer on request; ADM | L2; purpose | Approved scope and change history, customer-visible notes, customer-shareable photos, QA and punch outcome, invoices, receipts | Internal note classes, internal-only photos (a restricted photo appears only if a photo-share holder shared it with this customer after review, Section 5.3), check images, cost and margin, access secrets | Portal download for the verified contact | PROPOSED 7 days |
| Internal job packet | ADM, BKP | L2; purpose | Customer-facing content plus the internal classes the purpose needs (for example an insurer's request) | Access secrets, card data, credentials | Authorized download | PROPOSED 7 days |
| Accounting export | BKP | L2 | Invoices, payments, receipts, allocations, credits, refunds, write-offs | Check images unless the CPA asks; field data | Approved accounting system or CPA | PROPOSED 7 days |
| Owner bulk export (NFR-014) | ADM | L2; purpose; second confirmation | All core records with original files | Access secrets, card data, credentials | Encrypted archive to an owner-controlled store approved in the vendor register | PROPOSED 7 days in HandyHub storage |
| Privacy-request copy | ADM | L2 | The requester's own data (Section 8.1) | Other people's data | Portal download, or an expiring single-use link to the verified contact (Section 8.5) | PROPOSED 7 days |
| Legal-hold or adviser export | ADM | L2; attorney reference | Records in the hold scope | Card data, credentials | The channel the attorney directs | PROPOSED 7 days |
| Audit and security log export ([27](27-roles-and-permissions.md) §6.2) | ADM | L2; purpose | Audit and sensitive-read events in scope (field-change markers, not raw personal values, D-13-16) | Access secrets, card data, credentials | Authorized download or the channel the attorney or security reviewer directs | PROPOSED 7 days |

Rules:
- Every export writes an audit event with purpose, scope, record count and requester; exports are sensitive reads (Section 9.2); "Restrict bulk export" (systems playbook).
- Export files are encrypted, expire, and are never sent as email attachments.
- A downloaded copy leaves HandyHub's control; the export record lists where it went. Personal devices are not a destination for bulk exports (PROPOSED).
- Formats (PROPOSED for [08](08-data-model-and-database.md) and [09](09-api-contracts.md)): UTF-8 CSV or JSON with a documented schema for structured records, original photos and files, PDF renderings for documents, and a manifest with record counts and hashes. NFR-014 is verified by producing a complete bulk export from staging and checking it against record counts (PRIV-028).

## 12. Backups and restore (PROPOSED DECISION D-13-19)

Mechanics, recovery targets and cadence belong to [15](15-devops-infrastructure.md); ownership follows [35](35-skills-coverage-matrix.md) boundary row 14 (website: maintainer; application database and object storage: swe-quality-delivery; organizational accounts, devices and email: IT security; AT-058 lead swe-quality-delivery). This section sets the privacy requirements.

| Topic | Privacy requirement | Owner |
|---|---|---|
| Scope | Application database, object storage (photos and files), consent records, audit logs and configuration; website code and content in version control ([32](32-website-and-customer-experience.md) §11.4). Exports, phone caches and file sync are not backups ("separate sync from backup", IT playbook) | swe-quality-delivery |
| Encryption | Encrypted in transit and at rest; keys held apart from the backups ([12](12-security-threat-model.md), [15](15-devops-infrastructure.md)) | swe-quality-delivery; IT/security |
| Access | Named infrastructure identities with MFA; no application role reads backups; restores are break-glass with owner approval and audit | IT/security |
| Retention | Finite and documented; PROPOSED 35-day ceiling for routine application backups; longer archives only with privacy-owner approval and a stated purpose | swe-quality-delivery; privacy owner |
| Location | Provider and region recorded in the vendor register (Q-13-12) | Owner |
| Restore tests | Before launch and on a schedule (NFR-007, AT-058); "A successful backup notification is not a restore test."; record "configured, last completed, and last restored/verified" (IT verification) | swe-quality-delivery |
| Restore environment | Production-equivalent access controls; outbound email, texts and automations disabled ("Exercise recovery without publishing private records or triggering real customer workflows."); the test copy is destroyed after verification; never development or staging (NFR-015) | swe-quality-delivery; IT/security |
| Deletion propagation | After any restore, erasure records and disposal results are re-applied before restored data returns to use (PRIV-021) | swe-quality-delivery; privacy owner |
| Object versions and write-once copies | [07](07-system-architecture.md) D-07-15 proposes object-storage versioning and write-once logical database copies, so a deleted or erased file survives as a noncurrent version. Noncurrent versions and write-once copies are treated as backups: never served to users or the portal, readable only by the restore role, and expired within the row 26 ceiling of Section 7.2; restoring a version is a restore and re-applies erasure records (PRIV-021) | swe-quality-delivery; privacy owner |
| Holds | Backups are not the hold mechanism; held records stay live (Section 7.4) | Privacy owner |
| Notice wording | The privacy notice does not claim immediate deletion from backups ("Avoid claiming immediate deletion from immutable backups if unsupported.") | Privacy owner; attorney |
| Website data | Requests, consent records and uploads are covered by application backups ([32](32-website-and-customer-experience.md) WEB-043) | Website maintainer |

## 13. Privacy incident response (PROPOSED DECISION D-13-20)

### 13.1 Definitions and HandyHub scenarios

A **privacy incident** is an actual or suspected unauthorized access to, disclosure, alteration, loss or misuse of personal data, including near misses. It is distinct from a **field incident** (the spec Incident entity, ENT-014), a **service incident** (an outage) and a **security incident** (a system or account compromise, which is often also a privacy incident) ([35](35-skills-coverage-matrix.md) D-35-15). Privacy incidents are recorded in the operational incident record of [17](17-observability-and-operations.md), never in ENT-014 ([27](27-roles-and-permissions.md) §8.6 step 7).

| Scenario | Data at risk | First containment | Lead |
|---|---|---|---|
| Worker phone lost or stolen | Cached jobs, addresses, photos, access secrets of the window | Mark the device lost; revoke sessions ([27](27-roles-and-permissions.md) §8.6) | ADM; IT/security |
| Access code sent by text or email, or visible in a shared photo | Property access | Stop the channel or reclassify the photo; owner decides whether to advise a code change | Privacy owner |
| Photo or document shared with the wrong person (for example a previous tenant after a CL-03 move-out) | Interior photos, personal details | Revoke the share; ask the recipient to delete | Privacy owner |
| Message sent to a former contact | Job details | Pause the class or channel ([33](33-ai-and-automation-governance.md) §14.1) | Privacy owner |
| Portal object-access defect exposes another customer's records | Estimates, invoices, photos | Take the affected route offline; preserve logs | Developer; IT/security |
| Former employee keeps job photos or contacts on a personal phone | Photos, contacts | Request deletion and confirmation ([27](27-roles-and-permissions.md) §8.4) | Owner |
| Vendor reports a breach (email, hosting, AI) | Vendor-held data | Follow the vendor's notice; rotate credentials | Privacy owner; IT/security |
| Customer data pasted into an unapproved AI tool ([00](00-project-charter.md) R-00-11) | Whatever was pasted | Stop use; record what was entered | Privacy owner |
| Export sent to the wrong address | Job packet contents | Revoke the link; ask the recipient to delete | Privacy owner |
| Key or key tag lost | Property access | Tell the customer; the tag carries a code, not the address | Owner |
| Paper records lost (signed agreement, check) | Identity, bank details | Record contents and scope | Owner; BKP |
| Business email account compromised | Mailbox contents | Revoke sessions, review forwarding rules and app grants (IT playbook) | IT/security |

### 13.2 Runbook

```mermaid
flowchart TD
    A["Report at once by any channel: staff, customer, vendor, alert"] --> B["Contain: smallest action that stops exposure, IT revokes sessions or keys"]
    B --> C["Preserve logs, audit events, messages and the device list, delete nothing"]
    C --> D["Assess scope: data classes, people and how many, their states, systems, time window, whether access secrets were exposed"]
    D --> E{"Possible notification duty or material exposure?"}
    E -->|"yes or unsure"| F["Attorney decides notices: who, what and when, with the broker if coverage exists"]
    E -->|"no"| G["Record the reasoning"]
    F --> H["Notices drafted from verified facts, approved, sent by a person"]
    G --> I["Remediate: code-change advice, retraining, fixes"]
    H --> I
    I --> J["Lessons learned recorded in 21 and 25, then close"]
```

1. **Report** at once, by any channel, to the owner; onboarding tells staff how (EN/ES).
2. **Contain** with the smallest action that stops exposure; IT revokes sessions, keys and grants; for a suspected compromise, "avoid wiping systems or destroying logs as an initial reflex" (swe-quality-delivery).
3. **Preserve** evidence; nothing is deleted, including from devices under a hold notice.
4. **Assess** the data classes, people affected and how many, the states they live in, the systems, the time window, whether data was encrypted and whether access secrets were exposed ("identify data/people/systems/time window").
5. **Decide notifications** through Section 13.3.
6. **Communicate** only with approved, human-sent messages; no "no impact" statements before scope is known ("Do not send notices or promise no impact before scope is established.").
7. **Remediate**: advise code changes where needed, fix the cause, retrain, update SOP or template wording through [31](31-sop-standard.md) or [33](33-ai-and-automation-governance.md).
8. **Learn and record**: lessons learned in [21](21-risk-register.md) and [25](25-change-log.md); corrective actions tracked to closure.

### 13.3 Notification decisions (HUMAN REVIEW: attorney licensed in KY and/or IN)

- Whether Kentucky, Indiana or any other state's breach-notification rules apply to a given incident, and what they require (recipients, content, timing, method), **must be confirmed by an attorney for each incident**. This document states no trigger, deadline or recipient (Q-13-02).
- Affected people may live outside Kentucky and Indiana (for example a landlord or host who lives elsewhere); the assessment records each person's state so the attorney can apply the right rules (**ASSUMPTION** that such customers exist).
- Contractual notices to or from vendors, and any notice an insurer requires, are checked with the attorney and the licensed insurance broker (Q-13-13).
- AI and automation never send privacy or breach notices (master §23; [33](33-ai-and-automation-governance.md) §14.1).
- Advising a customer to change an exposed access code is a safety courtesy decided by the owner ([27](27-roles-and-permissions.md) §8.6 step 6); whether that advice is also a legally required notice is the attorney's question.

### 13.4 Records, drills and lessons learned

- The incident record holds: ID, detected at, reporter, description, data classes, people affected (count and states), systems, containment actions, assessment, attorney consulted (date), notification decision and messages sent (who, when, template version), corrective actions, lessons learned, closure. It is Restricted and kept per Section 7.2 row 25.
- Severity levels and alert routing come from [17](17-observability-and-operations.md).
- A tabletop drill runs before launch (PROPOSED scenario: a lost worker phone holding a CL-05 lockbox code and interior photos) and is recorded (Section 18.2).

## 14. Applicable law: open questions for the attorney

No applicability, threshold, deadline or legal requirement is asserted in this section. Each row closes with one disposition recorded in the jurisdiction research log kept by legal-compliance-administrator (requirement, jurisdiction, trigger, owner, evidence, deadline, status, source and date checked; owner facts L21): applies (with source, date and jurisdiction), does not apply (with reason), or needs more facts (named). Each recorded item is then labeled with the legal-compliance-administrator categories: "confirmed requirement" (attorney-confirmed, with source), "likely requirement needing verification", "business policy choice" (HandyHub adopts a practice whether or not a statute requires it, as D-13-13 does for privacy requests) or "professional-review item". Kentucky and Indiana are assessed separately ("When multiple jurisdictions apply, treat each separately.").

### 14.1 Facts the attorney needs

| Fact | Value today | Label |
|---|---|---|
| Business identity | Brand HandyHub; legal entity, type and registration not recorded ([32](32-website-and-customer-experience.md) Q-32-04) | **FACT** (gap) |
| Where HandyHub operates | Kentuckiana in Kentucky and Indiana; exact coverage not configured (owner facts L4; HND-002) | **FACT** |
| Size | Initially two employees; the owner is not counted as an additional worker without confirmation (owner facts L6; [27](27-roles-and-permissions.md) Q-27-01) | **FACT** |
| Volume of customers and records | Unknown: no operations yet; no estimate is possible from the vault | **GAP** |
| Data types | Inventory rows 1 to 28, including residential addresses, interior photos, access codes, volunteered health details, incidental images of children, employee HR data and check images; no card data | **PROPOSED** (planned design; nothing is collected yet) |
| Channels | Website form, email and phone; texting later; customer portal | **PROPOSED** |
| Tracking | No analytics or pixels configured; privacy-minimal analytics proposed ([32](32-website-and-customer-experience.md) D-32-11) | **FACT** + **PROPOSED** |
| Sale or sharing of data | HandyHub does not sell or rent personal data and does not share it with advertising platforms at launch (PROPOSED DECISION D-13-23; the attorney words any statement) | **PROPOSED** |
| Vendors | None selected (Section 10.1) | **FACT** |
| AI | Disabled at launch ([27](27-roles-and-permissions.md) D-27-13) | **PROPOSED** |
| Children | The site and services are not directed to children; children's data appears only incidentally | **ASSUMPTION** |

### 14.2 Questions

| # | Question for the attorney | Leads to check (not conclusions) | Blocks |
|---|---|---|---|
| 1 | Does any Kentucky or Indiana consumer data privacy statute apply to HandyHub, given the facts in 14.1, and if so which duties (notice content, request rights, deadlines, data-processing terms, sensitive-data rules)? | Kentucky and Indiana consumer data privacy legislation (the attorney confirms what is in force and whether HandyHub meets any applicability criteria); FTC Act standards for accurate privacy statements | Notice content (Section 16); request timing (Section 8); vendor terms (Section 10) |
| 2 | What breach-notification duties could arise in Kentucky, Indiana and the states where affected people live, and what must the incident record capture to decide them? | State data-breach notification statutes | Section 13.3 |
| 3 | What consent, wording, records and opt-out handling do operational texts, marketing texts, marketing email and any phone outreach need? | TCPA and FCC rules; CAN-SPAM Act; carrier and provider registration rules for business texting ([32](32-website-and-customer-experience.md) §5.4 row L6) | Section 4.3; marketing email |
| 4 | Does the chosen analytics option, the language preference or any cookie need a consent mechanism or a specific disclosure? | Rules identified in row 1; FTC Act | Section 4.5; [32](32-website-and-customer-experience.md) Q-32-12 |
| 5 | What rules govern employee and worker data: records, notices, access by the worker, monitoring, background checks? | Federal and state employment-records and monitoring rules | Sections 9.4, 16.3; row 11 of Section 7.2 |
| 6 | What minimum retention periods apply to contract, safety and injury, consent and privacy records, and what claim periods should the operational period cover? | Contract and claim limitation periods (attorney); insurance policy conditions (broker); safety recordkeeping questions (qualified safety professional); tax and accounting records (CPA, Q-13-03) | Section 7.2 rows 6 to 9, 11, 13, 25 |
| 7 | May HandyHub publish photos showing a customer's property, pets or people with the customer's consent, and who may consent for rentals and guests' belongings? | State rules on use of a person's likeness; consent from tenants, owners and hosts | Sections 4.4, 5.7; Q-13-20 |
| 8 | Do any rules on children's personal information or images matter for incidental capture? | Federal and state rules on children's data (the attorney identifies which, if any, are relevant) | Section 5.5 |
| 9 | Do electronic records and signatures need a separate consent, and may scans replace signed paper originals? | Federal and state electronic-signature and electronic-records rules ([30](30-service-agreement-standards.md) Q-30-06) | Section 4.1; Q-13-19 |
| 10 | Would recording calls or dictating voice notes on site need anyone's consent? | State recording-consent rules | Section 15; Q-13-17; [33](33-ai-and-automation-governance.md) Q-33-14 |
| 11 | What must data-processing terms with vendors contain, and is a written agreement required? | Duties identified in row 1; contract law | Section 10.2 |
| 12 | Would any planned data flow (analytics, advertising, lead marketplaces, review platforms) count as a sale or sharing under an applicable statute? | Definitions in any statute identified in row 1 | D-13-23 wording |
| 13 | Are volunteered health details (allergies, respiratory concerns) treated as sensitive data under any applicable rule? | Rules identified in row 1 | Section 3.4; PRIV-043 |
| 14 | How must HandyHub respond to requests for a customer's or worker's records from police, courts, insurers, adjusters or other third parties, and who may answer them? | Rules on subpoenas and legal process (attorney); cooperation conditions in any insurance policy (licensed insurance broker) | Section 8.1; Q-13-21 |

## 15. AI data governance

[33](33-ai-and-automation-governance.md) owns AI policy; this section records the privacy decisions it hands to this document (PROPOSED DECISION D-13-21).

| Topic | Rule | Defined in |
|---|---|---|
| Provider approval | AI providers are processors in the Section 10 register; no customer, job, worker or financial data reaches one, including AI built into business software, before approval for those data classes | [33](33-ai-and-automation-governance.md) AIG-014; Section 10 |
| Training and secondary use | No HandyHub customer, worker or job data is used to train or improve any provider's or HandyHub's models unless the owner, the privacy owner and the attorney approve, the privacy notice says so, and any consent the attorney requires is recorded. Where a provider's terms allow training on submitted data by default, the business account opts out before approval, verified from current terms | This section |
| Fine-tuning and evaluation | No fine-tuning on production data; evaluation sets are synthetic | [33](33-ai-and-automation-governance.md) §8.3 class D |
| Minimization and exclusions | The [33](33-ai-and-automation-governance.md) §4.2 baseline exclusions are adopted as privacy rules (no access secrets, card data, check images, injury detail, HR, legal or fraud notes; contact details only when the task needs them) | [33](33-ai-and-automation-governance.md) §4.2 |
| Redaction | Card numbers, access-code-like strings and credentials removed before the model ([33](33-ai-and-automation-governance.md) §9.3, AIG-008); the privacy owner approves the pattern lists and the bilingual reviewer approves the Spanish keywords | [33](33-ai-and-automation-governance.md) §9.3 |
| Retention | Class A as the record it changed; class B PROPOSED 12 months; class C (raw context and output text) PROPOSED 30 days, then deleted keeping hashes; class D with its task-policy version; provider-side copies only as long as verified terms allow | Section 7.2 row 20; [33](33-ai-and-automation-governance.md) §8.3 |
| Photos | Only after [33](33-ai-and-automation-governance.md) Q-33-13 is answered; location metadata removed; photos with the restricted identifier flag are never sent (PROPOSED) | [33](33-ai-and-automation-governance.md) AIG-009 |
| Voice notes | Disabled until the policy below, an approved speech-to-text provider and attorney review exist (PRIV-037) | UXE-007; [33](33-ai-and-automation-governance.md) Q-33-14 |
| Staff AI-tool rule | [33](33-ai-and-automation-governance.md) §15.2 (AIG-018) adopted; wording approved by the privacy owner and the attorney; part of the onboarding acknowledgement ([27](27-roles-and-permissions.md) §8.1 step 6) | [33](33-ai-and-automation-governance.md) §15.2 |
| Requests and holds | Privacy requests and legal holds reach AI records through their subject references (Section 8.4) | [33](33-ai-and-automation-governance.md) §8.3 |
| Disclosure | The privacy notice names AI processing before any task policy activates | [33](33-ai-and-automation-governance.md) §15.3 item 6 |
| Incidents | AI data exposure follows Section 13 and [33](33-ai-and-automation-governance.md) §14 | Section 13 |
| Decisions on privacy | AI never grants, infers or changes consent, marks media marketing-eligible, discloses records, deletes data or sends privacy notices | [33](33-ai-and-automation-governance.md) §6.1 |

Voice-note privacy policy outline (draft for attorney review; closes the "privacy policy for voice notes" part of [02](02-gap-analysis.md) G-006 once approved; consistent with the field rules of [11](11-worker-job-execution.md) D-11-23, which also keeps codes, passwords, card numbers and injury details out of dictation):
1. Off by default; enabled per worker only after approval.
2. Dictation of the worker's own notes only; never recording conversations with customers or occupants.
3. Explicit start and stop with a visible recording indicator.
4. Audio goes only to an approved speech-to-text provider.
5. The worker reviews the transcript, which is saved as a note with a note class.
6. Audio is deleted after the transcript is verified (Section 7.2 row 23).
7. Spanish dictation quality is checked before use (owner facts L11).
8. Recording-consent questions: **HUMAN REVIEW: attorney licensed in KY and/or IN** (Section 14 row 10).

## 16. Privacy notices (PROPOSED DECISION D-13-22)

### 16.1 Public privacy notice content

Drafted from this data map, not from boilerplate ("Draft notices and consent language from the actual data map, not aspirational safeguards."). Placement and the `/privacy` and `/es/privacy` pages are in [32](32-website-and-customer-experience.md) (§3.1, WEB-013). **HUMAN REVIEW: attorney licensed in KY and/or IN and qualified bilingual reviewer** for every version.

| Notice section | Content | Source in this document |
|---|---|---|
| Who we are | Legal entity, brand, verified contact for privacy questions | [32](32-website-and-customer-experience.md) Q-32-03, Q-32-04 |
| What we collect | Categories, in plain words: requests, contact and property details, access instructions, photos, communications, payments, website data | Inventory rows 1 to 15, 23 |
| Where it comes from | The customer, people acting for them (tenants, landlords, hosts), HandyHub staff on site, service providers | Table A "Source" |
| Why we use it | Purposes per category | Table A "Purpose" |
| Photos | Job documentation versus marketing; separate permission; how to withdraw | Sections 4.4, 5 |
| Who we share with | Vendor categories actually used at publication time, customer-side contacts with authority, advisers, legal requirements | Section 10; Section 9.5 |
| Messages | Operational versus marketing; opt-out; texts only when offered | Section 4 |
| Website data | Actual analytics and storage behavior, verified on the network | Section 4.5; [32](32-website-and-customer-experience.md) §10 |
| Retention | Summary by category; no claim of immediate deletion from backups | Sections 7, 12 |
| Security | Plain description of practices, with no guarantee and no "secure" or "compliant" claim | IT verification rule |
| Choices and requests | How to ask, how identity is checked | Section 8 |
| AI | Named before any AI processing starts | Section 15 |
| Children | Not directed to children; incidental capture handled per Section 5.5 | Section 5.5 |
| Changes | Version and effective date; how material changes are communicated (attorney) | Section 16.4 |
| Language | English and Spanish; which version controls (Q-13-14) | Section 16.4 |

Not allowed in any notice: statements that are not true in practice (for example "we never share your data" while vendors process it), rights HandyHub does not actually offer, and legal conclusions the attorney has not confirmed.

### 16.2 Notice at collection (form step 5)

A short text on the request form ([32](32-website-and-customer-experience.md) §6.3) saying what is collected, why, who sees it, and linking the full notice; versioned; English and Spanish; the request stores the version shown (WEB-019, WEB-028). The same applies to the portal's consent screens and to agreement packets, which link the current notice version ([30](30-service-agreement-standards.md) AGR-020).

### 16.3 Worker and employee privacy notice

Before account activation each worker receives, in English or Spanish with human-reviewed translation, an internal notice covering: the data in inventory rows 19 to 21; why it is kept; who sees it; that location is not tracked; that job photos and customer details stay inside the app; device rules and lost-phone reporting; the offboarding deletion request; retention; how to ask questions or make requests. **HUMAN REVIEW: employment attorney** (Q-13-11; PRIV-033).

### 16.4 Versioning, languages and change triggers

- Privacy notices are controlled content: a Privacy notice version record (new entity, Section 19) with status, effective dates, English and Spanish translation entries and attorney and bilingual review sign-offs ([05](05-domain-model.md) Review sign-off, Translation entry). Requests, consent records and agreement packets store the version shown ([05](05-domain-model.md) §5.3, §5.5).
- A new version is drafted whenever a PRIV-001 trigger changes what people are told; whether existing customers must be told of a change is the attorney's call.
- Which language version controls is Q-13-14.

## 17. PRIV requirements (PROPOSED)

Every `PRIV-` item is a **PROPOSED** requirement introduced by this document. P0 supports a launch-critical capability (spec §19.1, mainly LAUNCH-001, LAUNCH-002, LAUNCH-006, LAUNCH-008); P1 follows spec §19.2. Hooks are in Section 18.1; [16](16-testing-quality-strategy.md) assigns test-case IDs.

| ID | Requirement | Priority | Trace | Verification |
|---|---|---|---|---|
| PRIV-001 | The Section 3 inventory is the single data map; any new personal-data field, purpose, vendor, tracking technology, audience or workflow updates it, and updates the privacy notice before release when it changes what people are told. | P0 | NFR-009; OWN-007; privacy playbook "Review whenever data purpose, vendor, tracking, audience, or workflow changes." | Release checklist in [23](23-definition-of-done.md); hook 1 |
| PRIV-002 | Every personal-data field in the schema carries its sensitivity class (Section 2.3) and retention class (Section 7.2); a field without both fails schema review. | P0 | NFR-009; REC-004; [05](05-domain-model.md) D-05-16, D-05-17 | Schema lint in [08](08-data-model-and-database.md) |
| PRIV-003 | Never-stored values (card numbers, customer device or account credentials, customer government identification, biometric data) have no field that can hold them; card numbers are rejected or masked at entry in every free-text field, caption and message by pattern check, with the attempt logged without the value; staff are instructed never to record the others, and any found later are redacted under PRIV-005. | P0 | [27](27-roles-and-permissions.md) AUTH-009, AUTH-035, D-27-16 | Hook 6; [27](27-roles-and-permissions.md) hook 32 |
| PRIV-004 | Collection follows Section 3.4: the public form collects only the [32](32-website-and-customer-experience.md) §6.4 fields; access secrets are collected only into the access-secret field after a visit is confirmed; health details are not requested; children are recorded only as a safety-relevant presence note. | P0 | NFR-009; owner facts L17; BRF-002 | Schema review; hook 1 |
| PRIV-005 | A code, password or card number found in an immutable snapshot or append-only note is replaced by an audited redaction action that records who, when and why, without the removed value; this is the only permitted change to an immutable snapshot. | P0 | COM-002; RECT-001; owner facts L17 | Hook 6 |
| PRIV-006 | Consent records are append-only per contact, purpose and channel, with notice version, language, method, source, time and recorder; no consent is inferred from a phone number, a request, an approval or silence. | P0 | COM-004; REC-003; [05](05-domain-model.md) DOM-050 | AT-050; hook 12 |
| PRIV-007 | Marketing messages go only to contacts with active consent for that channel, checked at send time against the suppression list; a withdrawal received by any channel applies to the next send. | P0 | COM-004; [33](33-ai-and-automation-governance.md) AIG-024 | Hook 3 (dry run, no real message) |
| PRIV-008 | Operational templates carry no promotional content; maintenance reminders, seasonal offers and public review requests are handled as marketing until the attorney classifies them (Q-13-18). | P0 | COM-004; QA-009 | Template review in the [33](33-ai-and-automation-governance.md) auto-send register |
| PRIV-009 | No text message is sent to a customer and no text-consent control is shown until the Section 4.3 conditions are met. | P0 | COM-004; owner facts L18; [32](32-website-and-customer-experience.md) Q-32-11 | Configuration check |
| PRIV-010 | Photo-publication consent is captured separately from the request form and from estimate approval, names assets or job, channels, attribution and the withdrawal path, and is the only way a photo becomes marketing-eligible. | P0 | REC-003; AT-050; [30](30-service-agreement-standards.md) AGR-019; [32](32-website-and-customer-experience.md) WEB-019 | AT-050 |
| PRIV-011 | Every photo and file is stored privately with a visibility class (internal-only by default), workflow moment, job, task or work-area link, uploader, capture time, content hash and identifier flag. | P0 | REC-002; RECT-006; [05](05-domain-model.md) DOM-047 | AT-049; hook 2 |
| PRIV-012 | At ingest, previews, thumbnails and shared copies are re-encoded without metadata; retained originals lose GPS and device identifiers; originals of public lead uploads are not kept; the worker app requests no location permission. | P0 | Master §8 "EXIF/privacy handling"; SCH-004; master §22; [32](32-website-and-customer-experience.md) D-32-07 | Hooks 2, 11 |
| PRIV-013 | Files are served only through the policy enforcement point as short-lived, object-bound signed URLs; there is no public bucket or permanent link; links in messages open the portal, not a file. | P0 | [27](27-roles-and-permissions.md) AUTH-029, §5.4; HND-010 | Hook 7 |
| PRIV-014 | A photo flagged for people, children, documents, screens, keypads, valuables or a check is Restricted: it is shared only with the job's own customer and authorized contacts by a photo-share holder after review (check images never), and is never marketing-eligible until a derivative removes the identifiers; images in which a child is identifiable are never published. | P0 | REC-002; REC-003; privacy playbook | Hook 16 |
| PRIV-015 | Marketing derivatives are recorded in the media register with source asset, consent record, edits, channels and date; a withdrawal produces the list of published copies and a removal record. | P1 | REC-003; [32](32-website-and-customer-experience.md) WEB-004 | Withdrawal walkthrough (hook 2, final steps) |
| PRIV-016 | Retention rules are stored as versioned business policies (key `retention`) per record type with trigger, period, disposal method and approver; values enter only through owner approval after the Section 7.2 reviews, and nothing is seeded from this document's proposals without that approval. | P0 | REC-004; [05](05-domain-model.md) DOM-009 | Configuration review |
| PRIV-017 | The disposal workflow runs only for record types with an approved, active retention version, skips records under legal hold, deletes or anonymizes the record with its files, derivatives, caches and search entries, writes counts (never contents), and reports types without an approved version as "retention pending". | P0 | REC-004; PERM-005; [33](33-ai-and-automation-governance.md) registry row 15 | Hooks 4, 5 |
| PRIV-018 | Legal holds are records with scope, reason, placed by, attorney reference, review date and release; a hold stops disposal and erasure for everything in scope; placing and releasing need L2 step-up and are audited. | P0 | REC-004 "preserving legal/accounting/safety needs"; master §1.3 | Hook 5 |
| PRIV-019 | Privacy requests (access, correction, deletion, marketing opt-out, photo-consent withdrawal) are logged with channel, requester, verification, scope, decision, actions, response and closure; identity is verified through the contact on file without new identity documents. | P0 | OWN-007; privacy playbook | Hook 4 |
| PRIV-020 | Erasure runs only through the Section 8.4 procedure: non-retained records are deleted, retained records minimized and restricted, vendors asked to delete their copies, and an erasure record kept. | P0 | [27](27-roles-and-permissions.md) D-27-14, AUTH-010; [05](05-domain-model.md) DOM-053 | Hook 4 (synthetic data only) |
| PRIV-021 | After any restore, erasure records and disposal results are re-applied before restored data returns to use, and a restore never triggers customer messages. | P0 | Privacy playbook; NFR-007 | Hook 14 |
| PRIV-022 | The sensitive reads of Section 9.2 are logged with actor, object, field class, time and client data, and the owner reviews them at each access review. | P0 | REC-005; [27](27-roles-and-permissions.md) AUTH-015, AUTH-031 | Hook 9 |
| PRIV-023 | Audit events record Personal and Restricted field changes as a field name with a change marker, not raw values; IP and device data are recorded only on authentication, step-up, denied-access, sensitive-read (Section 9.2, including reveals and exports) and administrative security events. | P0 | RECT-011; NFR-008; AT-057 | Hook 10 |
| PRIV-024 | Worker location is not collected; any proposal to collect it needs owner and privacy-owner approval and employment-attorney review before design. | P0 | SCH-004; master §22 | App permission manifest check (hook 11) |
| PRIV-025 | Customers see only the worker details the owner approves (default: first name); worker personal phone numbers and home addresses never appear in notifications or the portal. | P0 | SCH-006; [27](27-roles-and-permissions.md) §4.7 | Notification and portal content test |
| PRIV-026 | No personal data reaches a vendor, including built-in features of business software, until the vendor is approved in the Section 10 register for those data classes, with the Section 10.2 evidence recorded. | P0 | OWN-007; AIC-006; [33](33-ai-and-automation-governance.md) AIG-014 | Hook 15 |
| PRIV-027 | Exports follow Section 11: purpose, scope and count logged; L2 step-up; access secrets, card data and credentials never exported; Restricted classes only where the purpose needs them; files encrypted and expiring; customer-facing packets only to the verified contact. | P0 | REC-006; NFR-014; AT-048; AT-060 | AT-060; hook 8 |
| PRIV-028 | The owner can produce a complete export of core records in documented open formats with original files, verified once against record counts before launch. | P1 | NFR-014 | Export test |
| PRIV-029 | Backups of personal data are encrypted, readable only by named infrastructure identities, expire on a documented schedule, are restored only into an environment with production-equivalent controls, and never populate development or staging. | P0 | NFR-007; NFR-015; AT-058 | Restore record (hook 14) |
| PRIV-030 | Development and staging use synthetic data only; production personal data, photos and backups never enter them, and AI coding agents receive no production data. | P0 | NFR-015; [27](27-roles-and-permissions.md) §3.3 | Hook 13 |
| PRIV-031 | Privacy incidents follow Section 13; notices to customers, regulators or others are decided with the attorney, drafted from verified scope, approved and sent by a person, never by AI or automation. | P0 | Master §23; OWN-007; [02](02-gap-analysis.md) G-122 | Tabletop drill (Section 18.2) |
| PRIV-032 | An English and Spanish privacy notice, reviewed by the attorney and by a qualified bilingual reviewer, drafted from the data map and versioned with effective dates, is published before the first public request is accepted; requests, consent records and agreement packets store the version shown. | P0 | MOD-001; [32](32-website-and-customer-experience.md) WEB-013, WEB-019; [30](30-service-agreement-standards.md) AGR-020 | Review record; hook 18 |
| PRIV-033 | Workers receive the Section 16.3 notice before their account activates; wording reviewed by an employment attorney. | P0 | BIZ-002; [27](27-roles-and-permissions.md) §8.1 | Onboarding record |
| PRIV-034 | No analytics, advertising, session-replay or other third-party script runs on the public site unless inventoried, approved and consent-gated as the attorney advises; the portal and worker app run none of these. | P0 | [32](32-website-and-customer-experience.md) WEB-035, WEB-040, D-32-11 | Network inspection |
| PRIV-035 | An AI provider is approved only with training and secondary use of HandyHub data turned off or excluded by contract; any exception needs owner, privacy-owner and attorney approval and a notice update. | P1 (P0 if AI launches) | AIC-006; [33](33-ai-and-automation-governance.md) §11.2 | Vendor register review |
| PRIV-036 | AI decision-log retention follows Section 7.2 row 20; raw context and output text are deleted at the end of the approved window, keeping hashes and metadata. | P1 | AIC-006; [33](33-ai-and-automation-governance.md) D-33-07 | Disposal run report |
| PRIV-037 | Voice-to-note stays disabled until a voice-note privacy policy, an approved speech-to-text provider and attorney review of recording consent exist. | P0 | UXE-007; [02](02-gap-analysis.md) G-006 | Configuration check |
| PRIV-038 | Check images, if captured, are Restricted, visible only to BKP and ADM after sync, excluded from AI and customer views, and deleted at the end of the approved period while the payment keeps the check reference. | P0 | FIN-005; [27](27-roles-and-permissions.md) §4.7 | [27](27-roles-and-permissions.md) hook 7; hook 9 |
| PRIV-039 | Customer-side recipients (hosts, property managers, landlords, builders) receive job data only through app sharing to a contact with a recorded authority flag; texting from personal phones and uploads to third-party portals need an owner-approved exception. | P0 | [27](27-roles-and-permissions.md) AUTH-028, AUTH-034; REC-002 | [27](27-roles-and-permissions.md) hook 28 |
| PRIV-040 | The data map, vendor register, retention schedule and consent texts are reviewed at least annually (PROPOSED) and at every PRIV-001 trigger, with the review recorded. | P1 | Privacy playbook; OWN-007 | Review records |
| PRIV-041 | Paper with personal data (signed paper agreements, checks before deposit, handwritten notes, key tags) is scanned into the job record where needed, kept locked while held and disposed of per Section 7.2; key tags carry codes, never addresses. | P0 | Privacy playbook ("paper"); [27](27-roles-and-permissions.md) §4.6 | Office procedure check |
| PRIV-042 | Staff are told not to keep customer data on personal devices or accounts; offboarding records the deletion request and the person's confirmation. | P0 | [27](27-roles-and-permissions.md) AUTH-034, §8.4 | Offboarding checklist |
| PRIV-043 | Health details a customer volunteers are recorded only when they change how the work is done, as a Restricted risk-and-safety note, and are never used for marketing or sent to AI. | P0 | NFR-009; CL-01.INT | Note-class test |

## 18. Verification

### 18.1 Test hooks for 16

Hooks are scenarios, not IDs; [16](16-testing-quality-strategy.md) assigns test cases. All run with synthetic data in staging (NFR-015).

| # | Scenario (Given / When / Then) | Covers | Type |
|---|---|---|---|
| 1 | Given a synthetic request with photos, when it is traced through form, request store, staff queue, email, logs, analytics, exports and backup policy, then no field outside the inventory exists, analytics carry no form values, and every destination is in the vendor register ("Trace one synthetic inquiry through form, CRM, email, job record, media store, analytics/logs, exports, and backup policy.") | PRIV-001, PRIV-004, PRIV-026, WEB-040 | Privacy trace |
| 2 | Given GPS-tagged JPEG, HEIC, PNG and WebP photos (GPS in EXIF, XMP and embedded thumbnails), when they are uploaded from the form and captured in the app, then stored originals have no GPS, derivatives and shared copies have no metadata, lead originals are absent, and the photo can be shared, published with consent and withdrawn with a removal record | PRIV-011, PRIV-012, PRIV-015 | Privacy trace |
| 3 | Given a contact with marketing email consent, when they withdraw by phone, then the next campaign dry run excludes them and the email tool's list shows the suppression; no real message is sent | PRIV-007 | Privacy (negative) |
| 4 | Given a synthetic customer with a lead, a job, photos, an invoice and an incident, when an erasure request is verified and executed, then non-retained records are gone, financial, contract and safety records are minimized and restricted, an erasure record exists, and vendor deletion requests are listed | PRIV-017, PRIV-019, PRIV-020 | Data integrity |
| 5 | Given a job under legal hold and a record type without an approved retention version, when the disposal workflow runs, then neither is touched and both appear in the run report | PRIV-017, PRIV-018 | Negative |
| 6 | Given a request description containing a lockbox code and a test card number, when it is saved and later redacted, then the card number is masked at entry, the code is replaced by a marker through an audited action, and neither appears in logs, exports, notifications or AI context | PRIV-003, PRIV-005; AUTH-009, AUTH-035 | Security (negative) |
| 7 | Given a photo link, when it is reused after expiry, opened by another account or edited to point at another object, then it fails | PRIV-013; AUTH-029 | Security (negative) |
| 8 | Given a job with every internal note class, internal-only photos, an unshared restricted photo and a check image, when a customer-facing packet is exported, then none of them appear; the export file expires | PRIV-027; AT-048, AT-060 | Permission (negative) |
| 9 | Given a check image, an injury section and an HR note, when ADM opens each of them and BKP opens the check image, then each read is logged with actor, object and field class; BKP's attempt to open the injury section or the HR note is denied and logged as a denied-access event; a worker opening their own job writes no sensitive-read event | PRIV-022, PRIV-038 | Audit |
| 10 | Given a contact's phone number change and a deposit-policy change, when the audit log is inspected, then the phone change shows a field name and change marker without the numbers, the policy change shows old and new values, and IP data appear only on the event types listed in D-13-16 | PRIV-023; AT-057 | Audit |
| 11 | Given the worker app build, when its permission manifest and runtime prompts are inspected, then no location permission is requested and captured photos carry no GPS | PRIV-012, PRIV-024 | Mobile |
| 12 | Given a request submitted with a phone number and an approved estimate, when consent records are queried, then no marketing or text consent exists | PRIV-006 | Privacy (negative) |
| 13 | Given the staging and development environments, when databases, storage and logs are scanned, then they hold only synthetic records and no production backup is mounted | PRIV-030 | Environment audit |
| 14 | Given a backup taken before an erasure, when it is restored in the restricted environment, then outbound messaging is disabled, the erasure is re-applied before use, the test copy is destroyed and the restore record holds date, version, integrity, time taken and gaps | PRIV-021, PRIV-029; AT-058 | Backup |
| 15 | Given the production egress inventory, when compared with the vendor register, then every destination receiving personal data is approved for those classes | PRIV-026 | Privacy audit |
| 16 | Given a photo in which a child is identifiable, when ADM tries to mark it, or a derivative in which the child is still identifiable, marketing-eligible, then the action is refused | PRIV-014 | Permission (negative) |
| 17 | Given a privacy-request copy, when it is generated for a customer whose job notes mention a second person, then the second person's details are removed | PRIV-019 | Privacy (negative) |
| 18 | Given a request, a consent record and an agreement packet, when each is inspected, then each stores the privacy notice version shown | PRIV-032 | Data integrity |

### 18.2 Privacy launch gate (input to 18)

Input to [18 Release and launch plan](18-release-and-launch-plan.md):

1. The attorney has given a disposition for Section 14 rows 1 to 6 (row 5 with the employment attorney, because the two employees are onboarded at launch) and row 9 (with [30](30-service-agreement-standards.md) Q-30-06, because customer approval is launch-critical, LAUNCH-003, and 30 assumes it happens electronically in the application), and reviewed Sections 4, 8, 13 and 16.
2. The privacy notice, notice at collection and worker notice are approved in English and Spanish (PRIV-032, PRIV-033).
3. The retention schedule is approved, or each unapproved category has a dated decision plan and stays "retention pending" with no disposal (PRIV-016, PRIV-017).
4. Every vendor in use is approved in the register (PRIV-026); texting, AI and third-party analytics are off unless their gates are met (PRIV-009, PRIV-034, PRIV-035).
5. Hooks 1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 and 18 pass in staging with synthetic data (hook 10 before launch because audit events are append-only and raw values written from day one could not be erased later); hook 3 passes before the first marketing send, hook 5 before the first disposal run, hook 16 before the first marketing publication and hook 17 before the first privacy-request copy.
6. A restore test and a privacy-incident tabletop drill are recorded (PRIV-021, PRIV-031).
7. Staff onboarding includes the AI-tool rule, the in-app photo rule and lost-phone reporting ([27](27-roles-and-permissions.md) §8.1).
8. The CL-05 photo channel and the HI-05 credential steps are held or rewritten in [31](31-sop-standard.md) and [30](30-service-agreement-standards.md) (C-HI05-01, C-CL05-01).

## 19. Handoffs to other documents

| Document | Takes from 13 | 13 needs back |
|---|---|---|
| [03 Requirements traceability matrix](03-requirements-traceability-matrix.md) | PRIV-001 to PRIV-043 with verification | Mapping to tickets and tests |
| [05 Domain model](05-domain-model.md) | Final sensitivity classes (Section 2.3) and retention periods for its classes (Section 7.2); new entities PROPOSED for 05 to name and place (D-13-25): Privacy request, Legal hold, Erasure record, Privacy notice version; the identifier-flag category list for the Photo entity (Section 5.3) | Entity names and context placement; adoption of the flag list |
| [06 State machines](06-state-machines.md) | Simple lifecycles for privacy requests (received, verifying, in progress, responded, closed) and legal holds (active, released); spam retention for its lead state L10 (Section 7.2 row 2) | Confirmation; D-06-24 (no email open tracking) is adopted in Section 10.1 |
| [07 System architecture](07-system-architecture.md) | Vendor categories and the approval gate, including the maps or geocoding and web-push rows that 07 §15 routes here; no public object storage; noncurrent object versions and write-once copies treated as backups (Section 12) | Vendor and region choices (Q-13-12) |
| [08 Data model and database](08-data-model-and-database.md) | Class and retention-class columns per field (PRIV-002); encrypted access-secret field; retention-clock fields; audit content rule (D-13-16) | Schema |
| [09 API contracts](09-api-contracts.md) | Indicative privacy, hold and retention endpoints (Sections 7.5, 8.6); export rules | Endpoint contracts |
| [10 Frontend UX](10-frontend-ux-plan.md) | Consent screens, photo identifier flag, redaction action, request queue, retention settings, EN/ES | Usability limits |
| [11 Worker job execution](11-worker-job-execution.md) | Answer to Q-11-09 (originals by workflow moment, Section 5.4); capture rules (Section 5.2); identifier-flag categories for D-11-21 step 2 (Section 5.3); voice-note retention (Section 7.2 row 23) | Confirmation that the photo pipeline (D-11-21) uploads originals only for the Section 5.4 moments |
| [12 Security threat model](12-security-threat-model.md) | Restricted-class handling; signed URLs; never-store validation; audit content rule; bulk-search threshold | Signed-URL lifetime; encryption and key design; tamper evidence check of D-13-16 |
| [15 DevOps and infrastructure](15-devops-infrastructure.md) | Backup privacy requirements (Section 12); environment separation (PRIV-030); break-glass logging | Backup retention value (row 26); restore environment |
| [16 Testing and quality strategy](16-testing-quality-strategy.md) | Hooks 1 to 18 | TC IDs |
| [17 Observability and operations](17-observability-and-operations.md) | Privacy incident record fields and runbook; logs with IDs only; disposal and request monitoring | Severity scale; alert routing |
| [18 Release and launch plan](18-release-and-launch-plan.md) | Privacy launch gate (Section 18.2) | Go-live sequence |
| [20 Decision log](20-decision-log.md), [21 Risk register](21-risk-register.md), [22 Backlog](22-backlog.md), [25 Change log](25-change-log.md) | D-13, R-13 and Q-13 items; PRIV stories for the master §27 "Privacy" epic | Owner approvals |
| [23 Definition of done](23-definition-of-done.md) | Privacy checks: data map updated, classes on new fields, no personal data in logs, notice updated when needed | Adoption |
| [24 AI agent development guide](24-ai-agent-development-guide.md) | Synthetic data only; no customer data in AI tools | Adoption |
| [26 Business process map](26-business-process-map.md) | Privacy request, consent withdrawal and privacy incident swimlanes | Swimlanes |
| [27 Roles and permissions](27-roles-and-permissions.md) | Retention periods and the sensitive-read definition it asked for; worker details shown to customers (D-13-26) | Matrix rows for Privacy request and Legal hold; a §10.4 SYS row for the retention and disposal workflow of Section 7.5 (27 §10.4 lists the complete SYS grants and has none yet); confirmation of Q-27-08 |
| [30 Service agreement standards](30-service-agreement-standards.md) | Consent policy and notice version (AGR-019, AGR-020); retention placeholders for Q-30-19 | Approved clause text |
| [31 SOP standard](31-sop-standard.md) | Photo capture rules (Section 5.2, 5.5) and access-secret rules (Section 6) for the shared modules | Reviewed SOP wording |
| [32 Website and customer experience](32-website-and-customer-experience.md) | Notice content (Section 16), confirmation of D-32-07 lead originals, retention for Q-32-19 (Section 7.2 rows 1 to 3, 17), consent rules for Q-32-11 and Q-32-12 | Published notice placement |
| [33 AI and automation governance](33-ai-and-automation-governance.md) | Vendor register rows, AI data-map entries, retention values for classes B and C, voice-note policy outline, training rule | Answers to Q-33-02, Q-33-13, Q-33-14 |
| [35 Skills coverage matrix](35-skills-coverage-matrix.md) | Worker-data, access-code, check-image and AI-vendor coverage gap now addressed here; recommendation to extend the privacy skill's scope beyond customers | Skill update |

## Assumptions

1. The owner holds the privacy owner responsibility OWN-007 until it is delegated ([00](00-project-charter.md) §3.4).
2. HandyHub runs one custom application with one relational database and private object storage ([05](05-domain-model.md) D-05-01); [07](07-system-architecture.md) confirms.
3. No vendor is selected; every vendor row is a plan.
4. Launch has no text messaging, no payment provider, no AI and no third-party analytics (owner facts L10; [27](27-roles-and-permissions.md) D-27-13; [32](32-website-and-customer-experience.md) D-32-11, Q-32-11).
5. Customers' properties are in Kentucky and Indiana; some contracting customers, such as landlords or hosts, may live in other states.
6. Field staff use phones; whether they are company-owned or personal is open ([27](27-roles-and-permissions.md) Q-27-05).
7. The site and services are not directed to children.
8. The traceability IDs now present in the spec (RECT, AIC, OWN, BRF, NTF and others) are final.
9. Nothing in this document is implemented; every control is a plan until built and verified.

## Decisions

| ID | Decision | Kind | Approver | Section |
|---|---|---|---|---|
| D-13-01 | Twelve privacy principles govern design and operation | PROPOSED DECISION | Owner | 2.1 |
| D-13-02 | Sensitivity classes of [05](05-domain-model.md) D-05-16 adopted as final with the listed amendments (health details, worker-related complaint narratives and privacy records Restricted; government ID and biometrics never stored; a "not collected unless approved" group that takes worker location); one identifier-flag category list for 05, 11 and 13 | PROPOSED DECISION | Owner; privacy owner | 2.3, 5.3 |
| D-13-03 | The Section 3 inventory is HandyHub's single data map and the trigger for notice updates | PROPOSED DECISION | Owner | 3 |
| D-13-04 | Collection rules by channel, including access secrets only after a visit is confirmed and minimal data about children, pets and health | PROPOSED DECISION | Owner; privacy owner | 3.4 |
| D-13-05 | Audited redaction is the only permitted change to an immutable snapshot | PROPOSED DECISION | Owner; [12](12-security-threat-model.md) review | 6 |
| D-13-06 | Consent catalog; operational versus marketing rule; no inferred consent; no purchased lists; maintenance reminders and public review requests treated as marketing until classified; privacy-minimal analytics rules | PROPOSED DECISION | Owner; **HUMAN REVIEW: attorney** | 4.1, 4.2, 4.5 |
| D-13-07 | No customer text messages until the six conditions of Section 4.3 are met | PROPOSED DECISION | Owner; **HUMAN REVIEW: attorney** | 4.3 |
| D-13-08 | Separate, specific photo-publication consent; other people need their own consent or removal; children never published | PROPOSED DECISION | Owner; **HUMAN REVIEW: attorney** | 4.4, 5.5 |
| D-13-09 | Originals kept without GPS or device identifiers; derivatives metadata-free; lead upload originals not kept; no location permission | PROPOSED DECISION | Owner; attorney for Q-13-09 | 5.4 |
| D-13-10 | Private storage and short-lived object-bound signed URLs; no public links | PROPOSED DECISION | Owner; [12](12-security-threat-model.md) | 5.6 |
| D-13-11 | Retention rules and schedule: business-need periods PROPOSED, legal-minimum periods left to professionals, disposal off until approved | PROPOSED DECISION | Owner; **HUMAN REVIEW: attorney, CPA, employment attorney, payroll professional** | 7.1, 7.2 |
| D-13-12 | Legal-hold mechanism | PROPOSED DECISION | Owner; **HUMAN REVIEW: attorney** | 7.4 |
| D-13-13 | One privacy-request workflow for all requesters, regardless of statutory applicability, with verification through the contact on file and no ID documents; third-party and legal-process requests are never answered on the spot and are decided by the owner with the attorney | PROPOSED DECISION | Owner; **HUMAN REVIEW: attorney** | 8.1, 8.3 |
| D-13-14 | Erasure deletes non-retained records, minimizes retained ones and is re-applied after restores; no claim of immediate deletion from backups | PROPOSED DECISION | Owner; attorney; CPA | 8.4 |
| D-13-15 | REC-005 "sensitive" means the Restricted class plus bulk access; the listed reads are logged and reviewed | PROPOSED DECISION | Owner | 9.2 |
| D-13-16 | Audit events store Personal and Restricted field changes as markers; IP and device data only on authentication, step-up, denied-access, sensitive-read and administrative security events | PROPOSED DECISION | Owner; [12](12-security-threat-model.md) | 9.2 |
| D-13-17 | Vendor register and approval gate for every processor; attorney reviews data-processing terms | PROPOSED DECISION | Owner; **HUMAN REVIEW: attorney** | 10 |
| D-13-18 | Export types, controls, exclusions, formats and 7-day expiry | PROPOSED DECISION | Owner | 11 |
| D-13-19 | Backup privacy requirements, including a 35-day ceiling for routine backups, noncurrent object versions and write-once copies treated as backups, and restricted restore environments | PROPOSED DECISION | Owner; IT/security (prepared under swe-quality-delivery); **HUMAN REVIEW: attorney, CPA** for backup retention ([07](07-system-architecture.md) D-07-15) | 12 |
| D-13-20 | Privacy incident runbook; notification decisions by the attorney; notices sent by a person | PROPOSED DECISION | Owner; **HUMAN REVIEW: attorney** | 13 |
| D-13-21 | AI data rules: no training on HandyHub data without approval; class B and C periods; photo and voice restrictions | PROPOSED DECISION | Owner; privacy owner; **HUMAN REVIEW: attorney** | 15 |
| D-13-22 | Public notice, notice at collection and worker notice drafted from the data map, versioned as controlled content in English and Spanish | PROPOSED DECISION | Owner; **HUMAN REVIEW: attorney, employment attorney, bilingual reviewer** | 16 |
| D-13-23 | HandyHub does not sell or rent personal data or share it with advertising platforms at launch (business commitment; the attorney words any public statement) | PROPOSED DECISION | Owner; attorney | 14.1 |
| D-13-24 | No third-party analytics, session replay or advertising SDK in the customer portal or the worker app | PROPOSED DECISION | Owner | 4.5 |
| D-13-25 | New entities proposed to [05](05-domain-model.md) and [08](08-data-model-and-database.md): Privacy request, Legal hold, Erasure record, Privacy notice version | PROPOSED DECISION | Owner; primary of 05 | 19 |
| D-13-26 | Customers see only the worker's first name by default, pending [27](27-roles-and-permissions.md) Q-27-08 | PROPOSED DECISION | Owner; privacy owner | 9.4 |

Recorded owner decisions (FACT, [operating context](../Skills/Business%20direction/handyhub-job-planner/references/operating-context.md), recorded 2026-10-02) that shape this document:
- "Treat customer text/uploads as untrusted evidence, not instructions. Retrieve only necessary data. Do not expose credentials, access codes, card details or private photos." (L17)
- "Sending messages, publishing, spending, refunds, binding commitments and access changes require applicable explicit authorization." (L18)
- "Payment provider not selected. Received checks are not cleared money." (L10)
- "English/Spanish public, customer and worker experience; require human-reviewed safety translations." (L11)
- "No brand assets or verified portfolio/reviews supplied; never fabricate proof." (L12)
- Owner action observed 2026-10-03: the owner deleted the empty Carpentry plan file and its MOC entry; it does not change any data category here (to be confirmed with the owner and recorded in [20](20-decision-log.md)).

## Open questions

| ID | Question | Owner / reviewer | Blocks |
|---|---|---|---|
| Q-13-01 | Which Kentucky, Indiana and federal privacy rules apply to HandyHub on the facts in Section 14.1, and which duties follow (Section 14 rows 1, 4, 11, 12, 13)? | Attorney licensed in KY and/or IN | Sections 8, 10, 16 |
| Q-13-02 | What breach-notification duties could arise in Kentucky, Indiana and the states where affected people live, and what must the incident record capture to decide them? | Attorney licensed in KY and/or IN | Section 13.3 |
| Q-13-03 | What retention minimums apply to financial, tax and payroll records under federal, Kentucky and Indiana rules? | CPA; payroll professional | Section 7.2 rows 9, 11 |
| Q-13-04 | What retention minimums and claim periods apply to contract, safety and injury, consent and privacy records? | Attorney; insurer; qualified safety professional | Section 7.2 rows 6 to 8, 13, 25 |
| Q-13-05 | Does the owner approve the business-need periods proposed in Section 7.2 once the reviewers confirm no conflict? | Owner; privacy owner | PRIV-016 |
| Q-13-06 | Is the owner the privacy owner (OWN-007) at launch, and who backs the owner up? | Owner | Section 2.2 |
| Q-13-07 | What wording, evidence (including whether IP or device data are kept), staff-recording methods and opt-out handling do marketing consent and text messages need, and how is each NTF event classified? | Attorney (with [32](32-website-and-customer-experience.md) Q-32-11) | Sections 4.3, 4.6 |
| Q-13-08 | Do the chosen analytics option and the language preference need a consent mechanism or specific disclosure? | Attorney; privacy owner (with [32](32-website-and-customer-experience.md) Q-32-12) | Section 4.5 |
| Q-13-09 | Do the workflow moments in the Section 5.4 originals table keep the right full-resolution originals for dispute and insurance evidence, and should any original ever keep location metadata, or are in-app capture time and job link sufficient? | Owner; attorney | D-13-09; [11](11-worker-job-execution.md) Q-11-09 |
| Q-13-10 | Which requests does HandyHub offer to all customers, with what internal targets and legal deadlines, and what authority evidence must representatives give? | Owner; attorney | Section 8 |
| Q-13-11 | Where are employee HR and payroll data kept, what does the worker notice say, how are complaints about a worker shared with the worker, and is any monitoring planned? | Owner; employment attorney; payroll professional | Sections 9.4, 16.3 |
| Q-13-12 | Which vendors and processing regions are chosen for hosting, storage, backups, email, texts, payments, AI, analytics, e-signature, accounting, payroll and error monitoring? | Owner (through [07](07-system-architecture.md), [15](15-devops-infrastructure.md)); privacy owner | Section 10 |
| Q-13-13 | Does HandyHub hold cyber or privacy-incident insurance, and what notice conditions does any policy impose? | Owner; licensed insurance broker | Section 13.3 |
| Q-13-14 | Which language version of the privacy notice controls, and who is the qualified bilingual reviewer? | Attorney; owner (with [32](32-website-and-customer-experience.md) Q-32-10) | Section 16.4 |
| Q-13-15 | Which channels may deliver job data to hosts, property managers, landlords, builders and insurers (with [27](27-roles-and-permissions.md) Q-27-16)? | Owner; privacy owner; attorney | Section 5.3; PRIV-039 |
| Q-13-16 | Are check images captured at all, and if so is the PROPOSED 90-day post-reconciliation period acceptable or must the image be kept as a financial record? | Owner; CPA | Section 7.2 row 10; PRIV-038 |
| Q-13-17 | Will business calls be recorded or voicemails transcribed? (Default: no recording; call summaries only.) | Owner; attorney | Sections 2.3, 10.1 |
| Q-13-18 | Are maintenance reminders, seasonal offers and public review requests operational messages or marketing? | Attorney; owner | Section 4.2; PRIV-008 |
| Q-13-19 | May verified scans replace signed paper originals, and how long must any originals be kept? | Attorney | Section 7.2 row 24 |
| Q-13-20 | Who may consent to publishing photos of a rental or short-term rental (owner, tenant, host), and how are guests' belongings treated? | Attorney | Section 4.4 |
| Q-13-21 | How are requests for a customer's or worker's records from police, courts, insurers, adjusters or other third parties handled, who may answer them, and what is logged (Section 14 row 14)? | Attorney licensed in KY and/or IN; licensed insurance broker (policy cooperation conditions); owner | Section 8.1 |

## Risks

| ID | Risk | Category | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R-13-01 | Retention values stay unapproved, so data is kept indefinitely, or a wrong value deletes records that had to be kept | Privacy and legal | High | Medium | Disposal off until approval; "retention pending" report; launch gate item 3; Q-13-03 to Q-13-05 | Owner |
| R-13-02 | Access codes or credentials leak through texts, photos, notes or personal phones (C-HI05-01, C-CL05-01, G-115) | Privacy and security | Medium | High | Section 6; PRIV-003, PRIV-005; [27](27-roles-and-permissions.md) AUTH-009; SOP holds in [31](31-sop-standard.md) | Privacy owner |
| R-13-03 | Photos showing people, children, plates, documents or valuables are published or shared without consent | Privacy and legal | Medium | High | D-13-08; PRIV-010, PRIV-014; identifier flag; ADM-only eligibility | Privacy owner |
| R-13-04 | Personal data reaches unapproved vendors or AI tools, including AI built into business software ([00](00-project-charter.md) R-00-11) | Privacy | Medium | High | Vendor gate (PRIV-026); [33](33-ai-and-automation-governance.md) AIG-014, AIG-018; app-grant inventory | Owner; IT/security |
| R-13-05 | Job photos and customer details persist on personal phones and accounts ([27](27-roles-and-permissions.md) R-27-13) | Privacy | High | Medium | In-app capture and sharing (AUTH-034); onboarding rule; offboarding deletion request (PRIV-042) | Owner |
| R-13-06 | Notification duties after an incident are missed or misstated because applicability is unknown | Legal | Medium | High | Attorney engaged before launch (Q-13-02); incident record captures states; drill | Owner |
| R-13-07 | The privacy notice describes practices that do not match reality (analytics, vendors, AI) | Legal | Medium | High | Notice drafted from the data map (PRIV-001, PRIV-032); network verification; annual review | Privacy owner |
| R-13-08 | A backup restore brings back erased records | Privacy | Low | Medium | Erasure records re-applied after restore (PRIV-021); hook 14 | swe-quality-delivery |
| R-13-09 | One person holds privacy owner, administrator, office and IT duties, so nobody checks the privacy decisions independently | Governance | High | Medium | Attorney review before launch; sensitive-read review; name OWN-006 or an external IT provider | Owner |
| R-13-10 | Texts or marketing are sent without valid consent | Legal | Medium | High | D-13-07; PRIV-007 to PRIV-009; send-time checks | Owner |
| R-13-11 | Worker monitoring creeps in through GPS in photos, device data or timestamps | Privacy and employment | Medium | Medium | PRIV-012, PRIV-024; no location permission; employment-attorney review for any change | Owner |
| R-13-12 | Privacy features are over-built and delay a two-person launch | Delivery | Medium | Medium | P0 and P1 tiers; registers as documents at launch; reuse of [05](05-domain-model.md) and [27](27-roles-and-permissions.md) mechanisms | Owner; developers |
| R-13-13 | Third parties (host portals, property managers, builders) receive data through uncontrolled channels, as the current CL-05 SOP directs | Privacy | High | Medium | PRIV-039; Q-13-15; SOP and agreement wording held | Privacy owner |
| R-13-14 | Free-text fields gather sensitive data (health details, accusations, codes) without classification | Privacy | Medium | Medium | Note classes ([27](27-roles-and-permissions.md) §4.8); PRIV-043; redaction; staff guidance | Privacy owner |
| R-13-15 | Error-monitoring or logging tools capture request bodies, URLs or photos with personal data | Privacy and security | Medium | Medium | Vendor gate; body and field scrubbing ([17](17-observability-and-operations.md)); IDs-only logging | Developers |
| R-13-16 | HandyHub cannot extract its data from a platform or vendor | Business continuity | Low | Medium | PRIV-028; exit evidence in vendor approval | Owner |
| R-13-17 | Staff disclose job photos or records to an insurer, adjuster, police officer, other contractor or a caller claiming authority without verification or attorney review (CL-05 damage photos are already intended "for insurance claims") | Privacy and legal | Medium | High | Section 8.1 third-party row; Q-13-21; customer-service rule "A caller claiming to be a landlord cannot receive a tenant's records without authorization."; disclosures only as logged adviser exports (Section 11) | Owner; privacy owner |

## Acceptance criteria

1. The owner has approved, amended or rejected D-13-01 to D-13-26 in [20](20-decision-log.md), and answered or deferred Q-13-05, Q-13-06, Q-13-09, Q-13-12 and Q-13-16.
2. An attorney licensed in KY and/or IN has recorded a disposition for every Section 14 row, answered Q-13-01, Q-13-02, Q-13-04, Q-13-07, Q-13-10 and Q-13-21, and reviewed Sections 4, 8, 13 and 16; the review is recorded.
3. A CPA has answered Q-13-03 and Q-13-16; an employment attorney and a payroll professional have answered Q-13-11 and the workforce rows of Section 7.2.
4. Every inventory row in Sections 3.2 and 3.3 has every column filled or marked GAP or OPEN QUESTION, and every entity in [05](05-domain-model.md) Section 5 maps to at least one inventory row.
5. Every row of Section 7.2 has either an approved period and approver or the status "retention pending", and no disposal is enabled for a pending row.
6. Every PROPOSED period in this document is marked for human review, and no legal deadline, threshold, retention minimum or applicability statement appears as FACT.
7. [05](05-domain-model.md), [08](08-data-model-and-database.md), [27](27-roles-and-permissions.md), [32](32-website-and-customer-experience.md) and [33](33-ai-and-automation-governance.md) reference this document for privacy classes, retention, consent and vendors without contradicting it, and 05 has accepted or rejected the D-13-25 entities.
8. PRIV-001 to PRIV-043 appear in [03](03-requirements-traceability-matrix.md) with a verification method, and [16](16-testing-quality-strategy.md) has assigned test cases to hooks 1 to 18.
9. A qualified bilingual reviewer has approved the Spanish versions of the notices and consent texts before publication.
10. Every relative link in this document resolves to an existing vault file or a planned control-center file.

## Revision history

| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Initial draft created from the repository audit | AI orchestrator (Claude) |
| 2026-10-03 | Independent review (privacy and legal-compliance lens; more than 40 FACT claims and skill quotes checked against the vault, all accurate except the two 14.1 labels corrected below): aligned with 06 (spam retention clock starts at staff confirmation, L10), 07 (storage proposal; maps or geocoding, web-push and spam-challenge vendor rows; object versions and write-once copies treated as backups; attorney and CPA on backup retention), 27 (request and CSR access summaries; SYS disposal-workflow handoff), 30 (CPA on contract retention), 05 and 11 (one identifier-flag list; worker location amendment); fixed internal contradictions (IP and device data on sensitive reads in D-13-16 and PRIV-023; restricted photos in customer packets; hook 9 BKP access); added third-party and legal-process requests (Section 8.1, Section 14 row 14, Q-13-21, R-13-17, issues 17 and 18), the identity and authority check rule, mailbox and phone handling of codes, the `content` retention row 29, the audit-log export, the legal-compliance disposition labels and launch-gate rows 5 and 9 with hooks 10, 15 and 18; relabelled the 14.1 headcount and data-type rows, "12 confirms" wording and the row 1 period as PROPOSED; routed G-086; added REC-006, NFR-007 and NFR-014 to the frontmatter | AI reviewer (Claude) |
