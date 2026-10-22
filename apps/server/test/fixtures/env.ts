// Synthetic configuration for tests (RULE-SYNTHETIC-DATA). Gate passwords are built at runtime so the secret scanner
// never sees a literal; they are never real testers or passwords.
import { loadConfig, type Config } from '../../src/config.js'
import { TEST_MFA_KEY_TEXT } from './staff-mfa.js'

export const gatePassword = (n: number) => ['Synthetic', 'Gate', 'Fixture', `${n}${n}!x`].join('-')
export const GATE_USERS = `owner:${gatePassword(1)},tester1:${gatePassword(2)}`

export function basic(name: string, password: string): string {
  return `Basic ${Buffer.from(`${name}:${password}`).toString('base64')}`
}

/**
 * The ci configuration of a test, with the synthetic MFA sealing key: MFA is mandatory (TSK-0154), so without the key
 * no staff sign-in completes. A test of the NOT CONFIGURED refusal passes MFA_ENCRYPTION_KEY: '' (treated as unset).
 */
export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ HANDYHUB_ENV: 'ci', MFA_ENCRYPTION_KEY: TEST_MFA_KEY_TEXT, ...env })
}
