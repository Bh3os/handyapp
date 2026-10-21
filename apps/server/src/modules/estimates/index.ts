// Estimates module (TSK-0052; HH-DATA-02, HH-EST-02, HH-EST-03, HH-BASE-02): the estimate model with server-side
// totals and the customer and staff projections. TSK-0053 (HH-EST-01, HH-EST-05) adds the staff builder's routes
// (routes.ts) and the publish readiness check (readiness.ts) that publishing (TSK-0055) runs. Uploads (TSK-0054), the
// lifecycle and publishing (TSK-0055) and the customer view (TSK-0056) build on these functions.
import type { ApiModule } from '../../api/route.js'
import { ESTIMATE_ROUTES } from './routes.js'

export const ESTIMATES_MODULE: ApiModule = { name: 'estimates', routes: ESTIMATE_ROUTES }
export { builderView } from './routes.js'
export {
  documentDetails,
  PUBLISH_PROBLEM_CODES,
  PUBLISH_REQUIRED_KEYS,
  publishReadiness,
  readinessOf,
  versionSnapshot,
  type DocumentDetails,
  type LineSnapshot,
  type PublishProblem,
  type PublishProblemCode,
  type Readiness,
  type VersionSnapshot,
} from './readiness.js'
export {
  AUTHORING_METHODS,
  createEstimate,
  CUSTOMER_STATES,
  DRAFT_LIMITS,
  EDITABLE_STATES,
  isUuid,
  QUANTITY_SOURCES,
  readinessProblems,
  saveDraft,
  TEXT_LISTS,
  type AuthoringMethod,
  type DraftInput,
  type DraftLineInput,
  type QuantitySource,
  type ReadinessProblem,
  type TextList,
} from './model.js'
export {
  computeVersionTotals,
  discountFor,
  pricingPolicies,
  type DepositState,
  type PricingPolicies,
} from './pricing.js'
export {
  CUSTOMER_VERSION_FIELDS,
  customerEstimateVersion,
  staffEstimateVersion,
  type CustomerEstimateLine,
  type CustomerEstimateVersion,
  type StaffEstimateVersion,
} from './projections.js'
