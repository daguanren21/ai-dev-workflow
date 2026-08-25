import type { AuthConfig, TokenAuth } from './auth'
import type { SourceType } from './requirement'

export interface SourceConfig {
  enabled: boolean
  apiBase: string
  auth: AuthConfig
  /** Independent ONES OpenAPI credential. Never reuses the product-session token. */
  openApiAuth?: TokenAuth
  /** Extra headers to include in every request */
  headers?: Record<string, string>
  /** Source-specific options */
  options?: Record<string, unknown>
}

export interface McpConfig {
  sources: Partial<Record<SourceType, SourceConfig>>
  defaultSource?: SourceType
}
