// Roles and named capabilities (ROLE-MATRIX; OWN-DEC-114 role list; ENT-RoleGrant). One person may hold several
// staff roles; each capability stays explicit (HH-STAFF-03). The AI module holds no permissions (RULE-AI-WAVE2).

/** Staff roles a staff user can be granted (ROLE-OWNER, ROLE-OFFICE, ROLE-ESTIMATOR, ROLE-WORKER). */
export const STAFF_ROLES = ['owner', 'office', 'estimator', 'worker'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/** The columns of the permission matrix: the staff roles, the verified customer and the guest. */
export const MATRIX_ROLES = [...STAFF_ROLES, 'customer', 'guest'] as const
export type MatrixRole = (typeof MATRIX_ROLES)[number]

/** Column headings as the matrix writes them, in column order. */
export const ROLE_HEADINGS: Record<MatrixRole, string> = {
  owner: 'Owner',
  office: 'Office',
  estimator: 'Estimator',
  worker: 'Worker',
  customer: 'Customer',
  guest: 'Guest',
}

/**
 * Named capabilities granted per user by the Owner (ENT-RoleGrant). `collect`: a worker may record a payment they
 * collected on site on an assigned job (HH-FIN-03; PROPOSED mapping in ROLE-MATRIX).
 */
export const CAPABILITIES = ['collect'] as const
export type Capability = (typeof CAPABILITIES)[number]
