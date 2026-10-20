---
id: OWN-DEC-150
type: decision
title: "Wording of the one-time verification code message (email and text)"
status: active
area: identity
links:
  related: ["[[OWN-DEC-96]]"]
source: "owner answers 2026-10-20 (coordinator session)"
---
Question asked (2026-10-20): "Customers get a one-time code by email or text to confirm their contact details. Which wording should it use? The proposed English text is: "Your HandyHub verification code is 123456. It expires in 10 minutes. If you did not ask for this code, you can ignore this message." (email subject: "Your HandyHub verification code")."

Owner answer (2026-10-20): "Approve as written". The option chosen said: "The text above becomes the released wording for both email and text."

The owner also said they will set CODE_HASH_KEY in Render themselves.

Effect:
- The automatic message `contact.verification_code` ([[FACT-AUTOMATIC-MESSAGES]] #2) is released with this wording, English only ([[RULE-LANGUAGES]]), for email and for text:
  - email subject: "Your HandyHub verification code";
  - body (email and text): "Your HandyHub verification code is {verificationCode}. It expires in {codeLifetimeMinutes} minutes. If you did not ask for this code, you can ignore this message."
- The code and the lifetime are values filled in at send time: the lifetime comes from the decided session timings ([[FACT-SESSION-TIMINGS]], 10 minutes), never from the text.
- The wording is seeded as version 1 of the message templates (migration 0010, source OWN-DEC-150); later changes are new released versions.
- CODE_HASH_KEY is a host secret the owner sets in Render; until it is set, codes are NOT CONFIGURED and fail visibly.
