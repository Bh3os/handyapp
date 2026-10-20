---
id: OWN-DEC-87
type: decision
title: Request entry choice: Continue as Guest, Create an Account or Sign in
status: active
area: intake
links:
  related: ["[[OWN-DEC-63]]", "[[OWN-DEC-86]]", "[[HH-INT-01]]", "[[HH-ID-10]]", "[[HH-CUS-01]]", "[[HH-A11Y-02]]"]
source: "owner-answers-verbatim 2026-10-12T18:17:57.722Z [1.1 Home]; decision-briefs 2026-10-12T18:18:58"
---
Owner, 2026-10-12, journey Step 1.1, home page (second part of the answer, from "Estimate request entry").

Question asked:
> Step 1.1 - Home page: hero in your words, trust facts (free estimates, priced individually, every day 8 am-10 pm, reply within an hour, materials), four service tiles, Why HandyHub, Who we serve, Our work photos (only with customer permission), How it works (3 steps), FAQ, contact block. Phone 'Call' button hidden until you set a number. OK?

Owner wording:
> ## Estimate request entry
>
> When someone clicks “Request an Estimate,” show:
>
> **How would you like to continue?**
>
> **Continue as Guest**  
> Request an estimate without creating an account. Manage your project through a secure link.
>
> **Create an Account**  
> Keep your projects in one place and make future requests easier.
>
> **Already have an account? Sign in**
>
> Make guest access the primary option. Allow visitors to dismiss the choice and return to browsing. Preserve entered details when switching between guest access and sign-in.
>
> Guests may create an account later. Verify ownership before linking their existing projects, and preserve the original records without duplicates.

Effect:
- Every "Request an Estimate" / "Request a Free Estimate" button (header, sticky bar, service pages) opens a dialog headed "How would you like to continue?" with "Continue as Guest" as the primary option, "Create an Account" second and the link "Already have an account? Sign in", using the exact descriptions above.
- The dialog can be dismissed to return to browsing. A preselected service, the ZIP and anything entered are kept when switching between guest, create account and sign-in, and through the whole form ([[OWN-DEC-90]]).
- Create an Account and Sign in use the passwordless one-time-code customer accounts of [[OWN-DEC-63]].
- A guest can create an account later; existing projects are linked only after verified ownership, keeping the original records without duplicates ([[OWN-DEC-97]]).
- The dialog is accessible: focus moves into it, Escape closes it and focus returns to the button; it works at 320 px width and 200% text.
