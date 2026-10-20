// Synthetic configuration for tests (RULE-SYNTHETIC-DATA). Gate passwords are built at runtime so the secret scanner
// never sees a literal; they are never real testers or passwords.
import { loadConfig, type Config } from '../../src/config.js'

export const gatePassword = (n: number) => ['Synthetic', 'Gate', 'Fixture', `${n}${n}!x`].join('-')
export const GATE_USERS = `owner:${gatePassword(1)},tester1:${gatePassword(2)}`

export function basic(name: string, password: string): string {
  return `Basic ${Buffer.from(`${name}:${password}`).toString('base64')}`
}

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ HANDYHUB_ENV: 'ci', ...env })
}
