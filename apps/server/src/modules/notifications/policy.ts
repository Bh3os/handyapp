// The automatic-message policy (TSK-0047; HH-COM-06, FACT-AUTOMATIC-MESSAGES, RULE-DECIDED-VALUES-ACTIVE). One
// configured list, `messages.automatic`, names the only messages that send without staff release; there is no second
// list in code. While the list is NOT CONFIGURED nothing sends automatically (fail closed). A code on the list that is
// not a known message type, or that sits in the wrong audience group, refuses to load.
import type { Config } from '../../platform/config/index.js'
import { MESSAGE_TYPES } from './message-types.js'

export class NotificationPolicyError extends Error {
  override name = 'NotificationPolicyError'
}

/** Thrown when an unlisted message is asked to send automatically: it must be a draft that staff release. */
export class NotAutomaticError extends Error {
  override name = 'NotAutomaticError'
  constructor(readonly messageKey: string) {
    super(`${messageKey} is not on the automatic-message list; it can only be a staff-released draft`)
  }
}

export type AutomaticPolicy = {
  readonly state: 'CONFIGURED' | 'NOT_CONFIGURED'
  /** The policy version the decision was taken under (recorded with each send). */
  readonly version: number | null
  isAutomatic(messageKey: string): boolean
  list(): readonly string[]
}

export function automaticPolicy(config: Config): AutomaticPolicy {
  const entry = config.get('messages.automatic')
  if (entry.state === 'NOT_CONFIGURED')
    return { state: 'NOT_CONFIGURED', version: entry.version, isAutomatic: () => false, list: () => [] }
  const groups = [
    ['customer', entry.value.customer],
    ['staff', entry.value.staffAccount],
    ['staff', entry.value.staffNotifications],
  ] as const
  const listed = new Set<string>()
  for (const [audience, codes] of groups) {
    for (const code of codes) {
      const type = MESSAGE_TYPES.get(code)
      if (!type) throw new NotificationPolicyError(`messages.automatic lists unknown message type ${code}`)
      if (type.audience !== audience)
        throw new NotificationPolicyError(`messages.automatic lists ${code} under the wrong audience`)
      if (type.triggerEvents.length === 0)
        throw new NotificationPolicyError(`messages.automatic lists ${code}, which has no committed trigger event`)
      listed.add(code)
    }
  }
  const all = [...listed]
  return { state: 'CONFIGURED', version: entry.version, isAutomatic: (k) => listed.has(k), list: () => all }
}

export function assertAutomatic(policy: AutomaticPolicy, messageKey: string): void {
  if (!policy.isAutomatic(messageKey)) throw new NotAutomaticError(messageKey)
}
