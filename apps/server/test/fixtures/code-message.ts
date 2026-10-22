// The one-time code message as a customer receives it (synthetic codes only; RULE-SYNTHETIC-DATA).
// - Email: the owner-style wording released by TSK-0119 (verification_code, recorded in OQ-MESSAGES-OUTSIDE-THE-21),
//   through the branded layout, with the footer's labelled contact placeholders (FACT-PUBLIC-CONTACT).
// - Text: the owner's wording of OWN-DEC-150 (version 1; texts are unchanged until A2P 10DLC).
export const CODE_EMAIL_SUBJECT = 'HandyHub | Your Verification Code'

export const codeEmailText = (code: string, minutes = 10) =>
  [
    'Hi there,',
    `Your HandyHub verification code is ${code}. It expires in ${minutes} minutes.`,
    'Enter this code where you requested it. For your security, do not share this code with anyone.',
    "If you didn't request this code, you can safely ignore this email.",
    'The HandyHub Team',
    '--\nHandyHub\nPhone: Placeholder — not provided yet\nEmail: Placeholder — not provided yet',
  ].join('\n\n')

export const codeSmsText = (code: string, minutes = 10) =>
  `Your HandyHub verification code is ${code}. It expires in ${minutes} minutes. If you did not ask for this code, you can ignore this message.`

// A leaked code shows as its own token (quoted, after a space or "="). A random six-digit code can also turn up inside
// a timestamp, a pid or a UUID by chance, which is not a leak, so the check ignores matches with a digit or letter
// beside them.
export const standaloneCode = (code: string) => new RegExp(`(?<![0-9A-Za-z])${code}(?![0-9A-Za-z])`)
