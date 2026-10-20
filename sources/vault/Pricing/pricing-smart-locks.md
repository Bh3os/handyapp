---
title: "Regional Pricing: Door Hardware & Smart Locks"
service_id: HI-05
service_slug: smart-locks
canonical_name: "Door Hardware & Smart Lock Installation"
category: "Home Improvement"
doc_type: pricing
status: benchmark-draft
authority: supporting
owner_approved: false
human_review:
  - "owner"
  - "CPA (tax treatment)"
registry: "AI Development Plans/04-service-registry.md#HI-05"
last_reviewed: 2026-10-03
---

# 💵 Regional Pricing: Door Hardware & Smart Locks

> [!warning] Draft — not owner-approved
> Canonical service: **HI-05 — Door Hardware & Smart Lock Installation** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-05)
> Unapproved draft values, not a rate card. Figures are brainstorm benchmarks (owner facts 2026-10-02: rates, wages and profit targets not supplied). The $150 job minimum (spec BIZ-003, FIN-001, CX-001) applies unless an authorized exception is recorded; how it applies to recurring visits, callbacks, estimate visits and multi-service visits is an open owner decision. Do not quote these figures to customers until approved — see [28 Pricing, estimating and job costing](../AI%20Development%20Plans/28-pricing-estimating-and-job-costing.md).
> Legacy artifacts: Arabic text in this file is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.


## 📈 Kentuckiana Local Market Benchmarks
* **Per-Lock Hardware Change Rate:** $60 - $95 flat per unit handle or cylinder block.
* **Target Margin:** 75%

> FLAG (C-HI05-03, C-HI05-V01): the "Per-Lock Hardware Change Rate" line above is a per-unit figure below the $150 job minimum - FIN-001 applies at estimate level (apply the minimum or record an authorized exception, never per line; the proposed default is once per separately quoted job or visit bundle, owner to confirm; owner facts 2026-10-02). It overlaps the matrix prices below with no rule for which one governs, and the handle changes it names have no approved SOP procedure. Owner decision (Q-28-01).
>
> FLAG (C-HI05-06, X-19): the "Target Margin" line above is an internal, unapproved target with no cost basis and no stated margin definition; it must never appear in customer documents, field views or agreements (spec FIN-007; 28 section 8). Owner and CPA decide the margin basis (Q-28-13).

---

## 📐 Flat-Rate Matrix per Hardware Unit

### Standard Lockset / Deadbolt Replacement (Straight swap out, zero mortise boring)
* **Price:** $65 flat per single cylinder lock mechanism.

> FLAG (C-HI05-03, C-HI05-V01, C-HI05-08): a single standard swap priced as written is below the $150 job minimum - FIN-001 applies at estimate level. NO APPROVED PROCEDURE: no SOP option covers standard lockset, deadbolt or handle replacement, so this line is not bookable until an SOP option is approved. The agreement's "Inclusions" name only "premium digital deadbolts". Owner decides scope; attorney for the agreement text (Q-28-01).

### Keyless Electronic / Smart Lock Installation (e.g., Schlage Encode, Nest Yale)
* **Price:** $95 - $135 flat per smart unit.
* *Inclusions:* Unboxing, spindle tracking alignment, motorized automatic latch calibration, and Wi-Fi pairing profile tests.

> FLAG (C-HI05-03): a single smart-lock installation priced as written is below the $150 job minimum - FIN-001 applies at estimate level. Who supplies the lock, and at what markup, is undefined (Q-29-14). Owner decision (Q-28-01).

---

## 🚨 Mechanical Re-alignments (إصلاح مشاكل الأبواب القديمة)
- [ ] **Chisel & Strike Plate Frame Adjustment:** If the door frame has sagged and the bolt catches or drags, charge **+$45 flat** per strike plate realignment to chisel fresh wood margins and install heavy 3-inch locking frame reinforcement screws.

> FLAG (C-HI05-04): the agreement lists "strike plate re-alignment chiseling" among its "Inclusions", while the line above prices it as an add-on. Included or add-on is an owner decision, with the agreement text through the attorney (Q-28-21); until then neither reading is approved. The "3-inch locking frame reinforcement screws" named above belong to the SOP step whose settling-prevention claim is flagged (C-HI05-05): do not describe them to customers as preventing future settling.

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-05) · [Inventory](../Required%20inventory/inventory-smart-locks.md) · [Agreement](../Service%20Agreements/contract-smart-locks.md) · [SOP](../Standard%20Of%20Operations/sop-smart-locks.md) · [Requirements spec (service card HI-05)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Home%20Improvement%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Pricing model classification
| Aspect | Finding | Source |
|---|---|---|
| Pricing model(s) | Flat rate per hardware unit in the "Flat-Rate Matrix per Hardware Unit" (standard lockset or deadbolt swap; keyless electronic or smart-lock installation); a per-unit "Per-Lock Hardware Change Rate" benchmark that overlaps the matrix with no precedence rule; a per-strike "Chisel & Strike Plate Frame Adjustment" add-on | [28](../AI%20Development%20Plans/28-pricing-estimating-and-job-costing.md) section 7.1 row HI-05; line labels quoted |
| Units | Lock unit ("per single cylinder lock mechanism", "per smart unit", "per unit handle or cylinder block"); strike plate ("per strike plate realignment"). No line for new bores or re-bores (C-HI05-09), mortise locks, handlesets, re-keying or multi-door jobs | 28 section 7.1; [04](../AI%20Development%20Plans/04-service-registry.md#HI-05) HI-05 pricing model |
| \$150 minimum interaction | Every single-unit job priced as written is below the \$150 minimum, and so are some small multi-unit combinations (ESTIMATE in 04 HI-05). FIN-001 applies at estimate level: the estimate applies the minimum or records an authorized exception; proposed default once per separately quoted job or visit bundle before tax, never per line (owner to confirm). Neither this file nor the agreement states the minimum (C-HI05-03) | Spec BIZ-003, FIN-001, CX-001; 28 sections 4.2 and 7.1; owner facts 2026-10-02 |
| Labor assumptions | GAP: flat per unit with no time basis, crew, multi-door logic, travel or setup | 04 HI-05 labor assumptions; owner facts 2026-10-02 (rates, wages and production factors not supplied) |
| Material assumptions | GAP: who supplies the lock (customer or HandyHub) and any markup are undefined; "Unboxing" implies a boxed lock on site; the strike add-on names reinforcement screws; the brand names in the smart-lock heading are examples, not an approved product or compatibility list. A customer-supplied lock needs a START-009 condition and model record | Q-29-14; [29](../AI%20Development%20Plans/29-inventory-and-procurement.md) section 9.1; spec START-009; 04 HI-05 material assumptions |
| Fees, surcharges or deposits named in this file | "Chisel & Strike Plate Frame Adjustment" add-on per strike plate, which the agreement lists as included (C-HI05-04). No deposit, trip fee or other fee | Q-28-21; [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 7 row HI-05 |
| Margin / profit statements | "Target Margin" line: internal target, unapproved, no cost basis; whether it means margin or markup is not stated (a margin is not a markup); never shown in customer documents, field views or agreements | 28 section 8; spec FIN-007; C-HI05-06; X-19; Q-28-13 |
| Tax treatment | Not stated; CPA determination per service and state required | 04 section 2.4 item 6; spec EST-004 |
| Currency / unit / language artifacts | Dollar sign without a currency code (canonical USD); Arabic text in the "Mechanical Re-alignments" heading, kept verbatim pending bilingual review (C-HI05-11); no SAR amounts or square-metre units. Title variant "Door Hardware & Smart Locks" (C-HI05-12) | 36 section 5.4 item 21; 04 HI-05 aliases |
| Approval status | Unapproved benchmark: "Kentuckiana Local Market Benchmarks" names no source, date or approver; status `benchmark-draft`, never usable on a customer estimate and not importable without an owner approval record (PRC-002) | 28 sections 2.2 and 2.3; owner facts 2026-10-02 |

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-HI05-03 | high | Every single-unit price is below the \$150 job minimum (flagged inline) | Owner |
| C-HI05-04 | high | Strike-plate realignment is a contract inclusion but an add-on in pricing (flagged inline; amount not restated) | Attorney; owner |
| C-HI05-05 | high | SOP claims the reinforcement "prevents future settling misalignment"; the contract disclaims settling (the strike line here names the same screws) | Attorney (KY/IN); structural engineer only where signs of structural movement are observed |
| C-HI05-06 | high | Pricing presents unapproved benchmark rates and a target margin as operating values (flagged inline; figure not restated) | Owner; CPA |
| C-HI05-08 | medium | Contract covers only digital deadbolts, while pricing sells standard locksets and handles | Attorney; owner |
| C-HI05-09 | medium | New-bore/re-bore capability is stocked and marketed, but pricing excludes boring and the SOP has no procedure | Owner; qualified safety professional; building official for fire-rated doors |
| C-HI05-V01 | medium | Standard lockset, deadbolt and handle replacement is priced, but the SOP has no installation procedure for non-smart hardware (flagged inline) | Owner; qualified safety professional |
| C-HI05-11 | low | Arabic headings in pricing and inventory in an English/Spanish operation | EN/ES reviewer; owner on retention |
| C-HI05-12 | low | Name and slug drift ("Smart Locks", "structural door hardware upgrades", slug omits door hardware) | Owner |
| X-19 | medium | All 26 pricing files present unsourced benchmarks and margins as operating values; the margin metric differs by category | Owner; CPA (margin basis) |

### Open questions
- **Q-28-01** (owner): which pricing model, price items and approved values apply to HI-05 if it is a launch service, including whether single-lock jobs are quoted at the minimum or per-unit rates sit inside one minimum per visit (C-HI05-03).
- **Q-28-21** (owner; agreement text through [30](../AI%20Development%20Plans/30-service-agreement-standards.md)): is strike-plate realignment included in the installation or an add-on (C-HI05-04)?
- **Q-28-13** (owner; CPA): which margin basis applies to the "Target Margin" line, and are there targets at all (C-HI05-06)?
- **Q-29-14** (owner): does HandyHub supply smart locks or other lock hardware as standard, and which models, or does the customer supply them?

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout, inline flag lines and review notes; original text unchanged | AI orchestrator (Claude) |
