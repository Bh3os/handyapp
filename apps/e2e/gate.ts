// The staging access gate for the gated e2e server (TSK-0022; OWN-DEC-73). The tester is synthetic and the password
// is built at runtime, so no literal looks like a credential (RULE-SYNTHETIC-DATA).
export const GATE_USER = 'e2e-tester'
export const GATE_PASSWORD = ['Synthetic', 'E2E', 'Gate', 'Pass', '7!x'].join('-')
export const GATE_USERS = `${GATE_USER}:${GATE_PASSWORD}`
