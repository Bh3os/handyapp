// Import guard (TSK-0006): @handyhub/policy is server-only. Bundlers that resolve the "browser" export condition
// (Vite and Astro client builds) get this module instead of the policy, so a frontend import fails the build or
// the page at once instead of shipping authorization logic to the client (HH-ARC-05, RULE-SERVER-AUTHZ).
throw new Error('@handyhub/policy is server-only: call the server API instead of importing it in a frontend bundle.')
