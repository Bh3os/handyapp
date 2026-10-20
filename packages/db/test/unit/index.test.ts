import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from '../../src/index.js'

describe('@handyhub/db skeleton (TSK-0001, HH-AUD-01)', () => {
  it('exposes its public index', () => {
    expect(PACKAGE_NAME).toBe('@handyhub/db')
  })
})
