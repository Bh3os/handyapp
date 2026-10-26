// The Overview never offers an action the caller would be refused (TSK-0150; OWN-DEC-199, HH-PORT-02, HH-ID-13). An
// organization member without pay is asked for no payment, one without approve chooses no window, and no member is
// asked to reply; reading an estimate or a change order stays every member's.
import { CUSTOMER_NEXT_ACTIONS, type CustomerStatus } from '@handyhub/domain'
import { describe, expect, it } from 'vitest'
import { withoutRefusedAction } from '../../src/modules/portal/overview.js'

const status = (nextAction: CustomerStatus['nextAction']): CustomerStatus => ({
  situation: 'approved',
  step: 'deposit_due',
  waitingOn: 'customer',
  nextAction,
})
const ALL = { pay: true, decide: true, reply: true }

describe('next actions a member would be refused (TSK-0150, TSK-0118)', () => {
  it('[HH-PORT-02] the project customer keeps every action', () => {
    for (const a of CUSTOMER_NEXT_ACTIONS) expect(withoutRefusedAction(status(a), ALL)).toEqual(status(a))
  })

  it('[HH-ID-13] without pay: no Pay your deposit or Pay your invoice; the step and who waits stay', () => {
    for (const a of ['pay_deposit', 'pay_invoice'] as const)
      expect(withoutRefusedAction(status(a), { ...ALL, pay: false })).toEqual(status('none'))
    expect(withoutRefusedAction(status('review_estimate'), { ...ALL, pay: false })).toEqual(status('review_estimate'))
  })

  it('[HH-ID-13] without approve: no window choice; reviewing an estimate or a change stays', () => {
    for (const a of ['choose_visit_window', 'choose_work_appointment'] as const)
      expect(withoutRefusedAction(status(a), { ...ALL, decide: false })).toEqual(status('none'))
    for (const a of ['review_estimate', 'review_change'] as const)
      expect(withoutRefusedAction(status(a), { ...ALL, decide: false })).toEqual(status(a))
  })

  it('[HH-ID-13] where replying is not the caller’s: no Reply', () => {
    expect(withoutRefusedAction(status('reply'), { ...ALL, reply: false })).toEqual(status('none'))
  })
})
