// The precompiled request form validator (TSK-0017; HH-SEC-02, HH-INT-09): current with the schema, and free of eval
// so the Content-Security-Policy needs no 'unsafe-eval'.
import { readFileSync } from 'node:fs'
import { REQUEST_FORM_SCHEMA } from '@handyhub/domain/request-form'
import { describe, expect, it } from 'vitest'
import { OUTPUT, validatorSource } from '../scripts/request-validator.mjs'

describe('precompiled request form validator (TSK-0017, HH-SEC-02)', () => {
  it('[HH-SEC-02] the committed module matches the schema (pnpm --filter @handyhub/site run validator)', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(validatorSource(REQUEST_FORM_SCHEMA))
  })

  it('[HH-SEC-02] it needs no eval, no Function constructor and no import', () => {
    const source = readFileSync(OUTPUT, 'utf8')
    expect(source).not.toMatch(/new Function|\beval\(|require\(|^import /m)
  })
})
