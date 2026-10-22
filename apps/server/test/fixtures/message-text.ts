// TSK-0119: an email's plain text is the message body, then the layout's footer ("--", the brand and, on customer
// emails, the public contact or its labelled placeholders). Tests that check a body compare it without the footer.
export const bodyOf = (text: string | undefined): string => (text ?? '').replace(/\n\n--\n[\s\S]*$/, '')
