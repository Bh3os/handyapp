---
id: OQ-SPANISH-CATALOG-DETAILS
type: question
title: The Spanish staff catalog and language-switch details no decision gives
status: open
area: i18n
links:
  related: ["[[HH-LANG-02]]", "[[HH-LANG-01]]", "[[HH-LANG-04]]", "[[HH-OPS-04]]", "[[OWN-DEC-79]]", "[[OWN-DEC-162]]", "[[OWN-DEC-172]]", "[[OWN-DEC-208]]", "[[OWN-DEC-45]]", "[[RULE-LANGUAGES]]", "[[RULE-SAFETY-GATES]]", "[[TSK-0102]]", "[[OQ-SPANISH-SAFETY-DETAILS]]", "[[OQ-ESCALATION-DETAILS]]"]
source: "TSK-0102 (2026-10-26): OWN-DEC-79, OWN-DEC-162 and OWN-DEC-208 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the Spanish staff screens and the language switch?

- **Who answers:** the owner.
- **Decided, in use:** every staff screen in English and Spanish with the same keys and placeholders; Spanish staff text translated and checked by AI during development, never labelled human-reviewed; safety text released as "AI-reviewed" only after a separate comparison against the English ([[OWN-DEC-79]]); the customer side and the Owner Dashboard in English; worker-side screens, safety text and the emergency instruction in Spanish ([[OWN-DEC-162]], [[OWN-DEC-208]] reading 13); the locale stored on the staff identity and kept across devices ([[HH-OPS-04]]); former Spanish public URLs answer 301 with the English page ([[OWN-DEC-45]]).
- **PROPOSED, in use on private staging:**
  - **Glossary.** One Spanish word per recurring staff term, checked over the whole catalog (`packages/i18n/src/glossary.ts`): Owner → propietario (the owner's own word in [[OWN-DEC-172]] item 6; "Dueño" was replaced in 97 messages), hold (a job, review or safety hold) → retención (a window offer's hold stays "reserva", a collection hold "pausa de cobro"), Stop Work → Detener el trabajo, Start Work → Iniciar trabajo, punch item → pendiente, walkthrough → recorrido, deposit → depósito, estimate → presupuesto (an estimate visit is a "visita de presupuesto"), PPE → EPP, job packet → paquete de trabajo, change order → orden de cambio, invoice → factura, AI-reviewed → revisado por IA, Spanish safety review pending → Revisión de seguridad en español pendiente.
  - **Form of address.** Screens address staff as "usted"; the safety and emergency texts addressed to a worker in the field (Stop Work, hazard guidance, escalation, Call 911) use "tú", like the owner's own Spanish instruction. Unchanged by this task.
  - **Words kept as they are.** A Spanish message may equal its English only when every word reads the same in Spanish (names such as Zelle, Square and HandyHub; PDF, KB, h, min, UTC; Total, Subtotal, Legal, Flexible, Provisional, Roles, No). The language picker names English "English" in both languages. Customer wording quoted inside a Spanish message stays in English, as the customer receives it.
  - **Safety messages of the staff screens.** The Stop Work / Report Hazard and issue forms, hazard kinds, categories, guidance and reviewers, the escalation block, the Start Work emergency note, the listed hazard and stop-work messages of other screens, and every message that tells the reader to call 911 are compared with `tools/compare-staff-safety-es.mjs`, separately from the translation, with the term lists and units of `tools/compare-safety-es.mjs` (accents ignored when counting Spanish terms) plus the number of instructions. The record (`packages/i18n/src/staff-es-safety.json`) keeps per message the English and Spanish hashes, the check date and the result per category. On 2026-10-26 all 134 passed: 131 released as AI-reviewed and 3 recorded as the owner's own Spanish. The check found and corrected one message ("If anything is unsafe" had lost its warning word).
  - **Not released means English.** A safety message without a passing comparison is shown to a Spanish reader in its approved English; it blocks no work by itself (the Start Work gate keeps blocking for unreleased SOP text, [[OQ-SPANISH-SAFETY-DETAILS]]). A changed English or Spanish safety message fails the tests until the comparison runs again, so an unreviewed one is never merged.
  - **The owner's Spanish.** The escalation procedure, the Call Owner note and the Call 911 note carry the owner's sentences of [[OWN-DEC-172]] item 6 word for word; the tool checks this and never compares or alters them.
  - **Owner Dashboard.** The dashboard page (with the staging tools on it) is English for every staff locale; the menu around it keeps the person's language.
  - **Switching.** The language switch re-renders the current screen in place: nothing is reloaded, typed values and opened sections stay, the offline drafts on the phone are untouched and only the locale is written.
  - **Former Spanish URLs.** `/es` and `/es/<path>` answer 301 with `/<path>` (query kept); nothing is translated or recorded.
- **Until answered:** the PROPOSED details above are used; each is a small change to the catalog, the glossary, the tool or the code.
