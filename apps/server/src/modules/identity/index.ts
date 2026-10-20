// Identity module (TSK-0016; HH-ARC-02): customer one-time codes and customer sessions. Staff sign-in arrives with
// TSK-0014. The code issue and verify endpoints belong to the features that use them (contact verification on the
// receipt page, project access links, account sign-in); they call issueCode / verifyCode / startCustomerSession.
export {
  CODE_ISSUED_EVENT,
  CODE_PURPOSES,
  issueCode,
  maskForCustomer,
  normaliseDestination,
  verifyCode,
  type CodeChannel,
  type CodePurpose,
  type IssueInput,
  type IssueResult,
  type VerifyInput,
  type VerifyResult,
} from './codes.js'
export {
  CODE_MESSAGE_BODY,
  CODE_MESSAGE_KEY,
  CODE_TEMPLATES,
  codeDeliveryAutomation,
  CodeDeliveryError,
  type CodeDeliveryDeps,
} from './delivery.js'
export { MIN_CODE_KEY_LENGTH, readCodeKey, type CodeKeySettings } from './keys.js'
export {
  clearedSessionCookie,
  CUSTOMER_COOKIE,
  customerActor,
  customerSessionResolver,
  readSessionToken,
  refreshVerification,
  resolveCustomerSession,
  revokeCustomerSession,
  sessionCookie,
  SessionConfigError,
  setSessionCookie,
  startCustomerSession,
  type CustomerSession,
  type StartedSession,
  type StartSessionInput,
} from './sessions.js'
