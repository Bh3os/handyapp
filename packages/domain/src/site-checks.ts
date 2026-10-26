// First-visit site checks (TSK-0126; OWN-DEC-167, OWN-DEC-179, OWN-DEC-206, HH-SCH-06, HH-CRM-02). Pure rules shared
// by the server and the staff app: the three checks, what a site contact may be authorized for, the automated
// pre-validation of the property address before staff verify it, and the coverage outcome a verified county gives.
// Migration 0106 holds the same rules in the database.

/** The three checks of OWN-DEC-167, in the order staff see them. */
export const SITE_CHECKS = ['address', 'site_contact', 'coverage'] as const
export type SiteCheck = (typeof SITE_CHECKS)[number]

/**
 * What staff confirm a site contact may do (OWN-DEC-167: "authorized to provide property access or coordinate the
 * visit"). Nothing else: a site contact is never authorized for money or contract changes.
 */
export const SITE_CONTACT_AUTHORITIES = ['property_access', 'visit_coordination'] as const
export type SiteContactAuthority = (typeof SITE_CONTACT_AUTHORITIES)[number]

/** Who the customer designated: themselves (their contact record) or another person they named. */
export const SITE_CONTACT_DESIGNATIONS = ['customer', 'other'] as const
export type SiteContactDesignation = (typeof SITE_CONTACT_DESIGNATIONS)[number]

/**
 * PROPOSED (OQ-SITE-CHECK-DETAILS): the automated pre-validation of the address before staff verify it. Each code
 * stops the address check until the address is corrected:
 * - ADDRESS_PO_BOX: the street is a post-office box, not a place where work can be done;
 * - ADDRESS_MAILING_ZIP: the ZIP is a PO Box or Unique ZIP of the owner's dataset, which receives mail only
 *   (OWN-DEC-179 rule 8: a physical service address is required);
 * - ADDRESS_ZIP_STATE_MISMATCH: the dataset lists the ZIP only in another state than the address names.
 * A ZIP the dataset does not list is never a problem here (rule 13: a covered address is never rejected for a ZIP
 * missing from the list); the county check decides.
 */
export const ADDRESS_PROBLEMS = ['ADDRESS_PO_BOX', 'ADDRESS_MAILING_ZIP', 'ADDRESS_ZIP_STATE_MISMATCH'] as const
export type AddressProblem = (typeof ADDRESS_PROBLEMS)[number]

const PO_BOX = /\b(?:p\.?\s*o\.?\s*box|post\s+office\s+box|p\.?\s*o\.?\s*b\.?\s+\d)/i

/** The address's pre-validation problems, given what the coverage dataset says of its ZIP. Empty: none found. */
export function addressProblems(
  address: { readonly street: string; readonly state: string },
  zip: { readonly category: 'standard' | 'po_box' | 'unique' | null; readonly counties: readonly string[] },
): AddressProblem[] {
  const out: AddressProblem[] = []
  if (PO_BOX.test(address.street)) out.push('ADDRESS_PO_BOX')
  if (zip.category === 'po_box' || zip.category === 'unique') out.push('ADDRESS_MAILING_ZIP')
  const state = address.state.trim().toUpperCase()
  if (zip.counties.length > 0 && !zip.counties.some((c) => c.split(':')[0] === state))
    out.push('ADDRESS_ZIP_STATE_MISMATCH')
  return out
}

/**
 * The coverage outcome at confirmation, from staff's verified county (OWN-DEC-179 rules 5 and 6): inside the area
 * SERVED, outside it OUTSIDE. PROPOSED: EDGE and UNKNOWN are ZIP-only screening results (OWN-DEC-206); once the county
 * is verified the property is inside or outside, so they never reach confirmation.
 */
export function confirmedCoverage(inArea: boolean): 'served' | 'outside' {
  return inArea ? 'served' : 'outside'
}

/** Whether a site contact's authority, as recorded, satisfies the check: at least one of the two confirmed. */
export function contactAuthorized(authority: readonly string[]): boolean {
  return authority.some((a) => (SITE_CONTACT_AUTHORITIES as readonly string[]).includes(a))
}
