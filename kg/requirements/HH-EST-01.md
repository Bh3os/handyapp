---
id: HH-EST-01
type: requirement
title: "Contents of every estimate version"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-102]]", "[[OWN-DEC-32]]", "[[OWN-DEC-83]]", "[[OWN-DEC-104]]", "[[OWN-DEC-110]]", "[[OWN-DEC-126]]", "[[OWN-DEC-127]]", "[[OWN-DEC-66]]", "[[OWN-DEC-135]]", "[[OWN-DEC-140]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-NO-MINIMUM]]", "[[FACT-TAX-NO-LINE]]", "[[FACT-NO-SURCHARGE]]"]
  uses: ["[[ENT-Estimate]]", "[[ENT-EstimateVersion]]", "[[FACT-ESTIMATE-VALIDITY]]", "[[FACT-DEPOSIT-RULE]]", "[[FACT-PAYMENT-DUE]]", "[[FACT-BUSINESS-NAME]]", "[[FACT-BUSINESS-ADDRESS]]", "[[FACT-PRICING-DISCOUNTS]]", "[[FACT-PRICING-SAME-DAY-CHARGE]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-WARRANTY]]"]
  tested_by: ["[[T31]]", "[[T58]]"]
  part_of: ["[[S04]]", "[[C05]]"]
source: "guide 13.1 HH-EST-01; OWN-DEC-32, 66, 83, 102, 104, 110, 126, 127"
---
Each job is priced individually on its own estimate. There is no price book and no fixed price list; the figures in the vault `Pricing/` files are unapproved benchmarks and are never seeded as prices.

Every estimate version holds:
- project, customer and property; estimate number; version number; preparer; created time; valid-until date per [[FACT-ESTIMATE-VALIDITY]], counted from publishing;
- the authoring method: written in the staff app, or an uploaded PDF/Word document with structured amounts ([[HH-EST-11]]);
- services and work packages; quantities with units and their source (measured on site, or reported by the customer); unknown quantities stay unknown, never zero;
- labor and material assumptions, options (base scope, alternates, optional add-ons), exclusions, customer responsibilities, dependencies and schedule assumptions;
- price lines in integer cents, each rounded once half-up to the cent; the total is the sum of the displayed lines, in USD;
- no tax line and no tax charge ([[FACT-TAX-NO-LINE]]), no minimum charge or top-up ([[FACT-NO-MINIMUM]]), no card surcharge ([[FACT-NO-SURCHARGE]]);
- every line greater than $0.00; a discount only as a separate totals row before the total, never a line ([[FACT-PRICING-DISCOUNTS]], [[OWN-DEC-145]]); no same-day service charge ([[FACT-PRICING-SAME-DAY-CHARGE]]); no other fee is invented;
- the deposit due when the deposit rule applies ([[HH-FIN-02]]), computed on the total including selected options;
- the payment term shown before approval: "Payment due on receipt" for new projects, or the term already agreed with an existing customer, stored per project and never overwritten ([[FACT-PAYMENT-DUE]]);
- the issuer name ([[FACT-BUSINESS-NAME]]); the mailing-address line is omitted while [[FACT-BUSINESS-ADDRESS]] is missing, and a customer's address is never used in its place;
- the estimate terms version shown with it ([[HH-EST-13]]), and the 90-day workmanship warranty ([[FACT-WARRANTY]]) in the reviewed wording of the next terms version.

The customer view shows each line, the options, exclusions, total, valid-until date and any deposit; internal fields never appear there ([[HH-EST-03]]). On staging every estimate document carries the mark "TEST — not a real invoice or estimate".
