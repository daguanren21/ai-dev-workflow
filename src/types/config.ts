import type { AuthConfig } from './auth.js'
import type { SourceType } from './requirement.js'

export interface SourceConfig {
  enabled: boolean
  apiBase: string
  auth: AuthConfig
  /** Extra headers to include in every request */
  headers?: Record<string, string>
  /** Source-specific options */
  options?: Record<string, unknown>
}

export interface McpConfig {
  sources: Partial<Record<SourceType, SourceConfig>>
  defaultSource?: SourceType
}
