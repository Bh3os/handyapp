// Estimates module (TSK-0052; HH-DATA-02, HH-EST-02, HH-EST-03, HH-BASE-02): the estimate model with server-side
// totals and the customer and staff projections. It has no routes yet: the staff builder (TSK-0053), uploads
// (TSK-0054), the lifecycle and publishing (TSK-0055) and the customer view (TSK-0056) call these functions.
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
