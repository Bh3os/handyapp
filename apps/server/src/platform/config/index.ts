// Configuration: decided values as versioned data and NOT CONFIGURED states (TSK-0007; ENT-PolicyVersion).
export {
  aiModule,
  ConfigLoadError,
  ConfigNotConfiguredError,
  loadConfig,
  policyVersion,
  recordPolicyVersion,
  requireConfigured,
  type Config,
  type ConfigEntry,
  type Configured,
  type NewVersion,
  type NotConfigured,
} from './config.js'
export { CONFIG_KEYS, ConfigShapeError, isConfigKey, parseValue, type ConfigKey, type ConfigValue } from './keys.js'
