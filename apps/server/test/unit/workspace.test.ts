import * as db from '@handyhub/db'
import * as domain from '@handyhub/domain'
import * as i18n from '@handyhub/i18n'
import * as money from '@handyhub/money'
import * as policy from '@handyhub/policy'
import { describe, expect, it } from 'vitest'

describe('workspace wiring (TSK-0001)', () => {
  it('resolves every shared server-side package through its public index', () => {
    expect([db, domain, i18n, money, policy].map((m) => m.PACKAGE_NAME)).toEqual([
      '@handyhub/db',
      '@handyhub/domain',
      '@handyhub/i18n',
      '@handyhub/money',
      '@handyhub/policy',
    ])
  })
})
