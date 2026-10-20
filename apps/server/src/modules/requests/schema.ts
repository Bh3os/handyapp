// The public request submission contract lives in @handyhub/domain/request-form, shared with the request wizard
// (TSK-0026) so client and server validate the same way.
export {
  CONTACT_CHANNELS,
  ESTIMATE_PREFERENCES,
  MAX_SERVICES,
  PROPERTY_TYPES,
  REQUEST_FORM_SCHEMA as SUBMIT_BODY,
  REQUEST_RECEIPT_SCHEMA as SUBMIT_RESPONSE,
  TIME_WINDOWS,
  type Answer,
  type SubmitBody,
} from '@handyhub/domain/request-form'
