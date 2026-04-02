import type { AuthConfig } from '../types/auth.js'
import type { McpConfig, SourceConfig } from '../types/config.js'
import type { SourceType } from '../types/requirement.js'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod/v4'

const AuthSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('token'),
    tokenEnv: z.string(),
  }),
  z.object({
    type: z.literal('basic'),
    usernameEnv: z.string(),
    passwordEnv: z.string(),
  }),
  z.object({
    type: z.literal('oauth2'),
    clientIdEnv: z.string(),
    clientSecretEnv: z.string(),
    tokenUrl: z.string().url(),
  }),
  z.object({
    type: z.literal('cookie'),
    cookieEnv: z.string(),
  }),
  z.object({
    type: z.literal('custom'),
    headerName: z.string(),
    valueEnv: z.string(),
  }),
  z.object({
    type: z.literal('ones-pkce'),
    emailEnv: z.string(),
    passwordEnv: z.string(),
  }),
])

const SourceConfigSchema = z.object({
  enabled: z.boolean(),
  apiBase: z.string().url(),
  auth: AuthSchema,
  headers: z.record(z.string(), z.string()).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
})

const SourcesSchema = z.object({
  ones: SourceConfigSchema.optional(),
})

const McpConfigSchema = z.object({
  sources: SourcesSchema,
  defaultSource: z.enum(['ones']).optional(),
})

const CONFIG_FILENAME = '.requirements-mcp.json'

/**
 * Search for config file starting from `startDir` and walking up to the root.
 */
function findConfigFile(startDir: string): string | null {
  let dir = resolve(startDir)
  while (true) {
    const candidate = resolve(dir, CONFIG_FILENAME)
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir)
      break
    dir = parent
  }
  return null
}

/**
 * Resolve environment variable references in auth config.
 * Reads actual env var values for fields ending with "Env".
 */
function resolveAuthEnv(auth: AuthConfig): Record<string, string> {
  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(auth)) {
    if (key === 'type')
      continue
    if (key.endsWith('Env') && typeof value === 'string') {
      const envValue = process.env[value]
      if (!envValue) {
        throw new Error(`Environment variable "${value}" is not set (required by auth.${key})`)
      }
      // Strip the "Env" suffix for the resolved key
      const resolvedKey = key.slice(0, -3)
      resolved[resolvedKey] = envValue
    }
    else if (typeof value === 'string') {
      resolved[key] = value
    }
  }

  return resolved
}

export interface ResolvedSource {
  type: SourceType
  config: SourceConfig
  resolvedAuth: Record<string, string>
}

export interface LoadConfigResult {
  config: McpConfig
  sources: ResolvedSource[]
  configPath: string
}

/**
 * Try to build config purely from environment variables.
 * Required env vars: ONES_API_BASE, ONES_ACCOUNT, ONES_PASSWORD
 * Returns null if the required env vars are not all present.
 */
function loadConfigFromEnv(): McpConfig | null {
  const apiBase = process.env.ONES_API_BASE
  const account = process.env.ONES_ACCOUNT
  const password = process.env.ONES_PASSWORD

  if (!apiBase || !account || !password) {
    return null
  }

  // Try to read options from config file if it exists
  let options: Record<string, unknown> | undefined
  const configPath = findConfigFile(process.cwd())
  if (configPath) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as { sources?: { ones?: { options?: Record<string, unknown> } } }
      options = raw?.sources?.ones?.options
    }
    catch {
      // ignore parse errors, env config is primary
    }
  }

  return {
    sources: {
      ones: {
        enabled: true,
        apiBase,
        auth: {
          type: 'ones-pkce',
          emailEnv: 'ONES_ACCOUNT',
          passwordEnv: 'ONES_PASSWORD',
        },
        options,
      },
    },
    defaultSource: 'ones',
  }
}

/**
 * Load and validate the MCP config.
 * Priority: env vars (ONES_API_BASE + ONES_ACCOUNT + ONES_PASSWORD) > config file (.requirements-mcp.json).
 * Searches from `startDir` (defaults to cwd) upward for the file.
 */
export function loadConfig(startDir?: string): LoadConfigResult {
  // 1. Try environment variables first (simplest setup for MCP)
  const envConfig = loadConfigFromEnv()
  if (envConfig) {
    const sources: ResolvedSource[] = []
    for (const [type, sourceConfig] of Object.entries(envConfig.sources)) {
      if (sourceConfig && sourceConfig.enabled) {
        const resolvedAuth = resolveAuthEnv(sourceConfig.auth)
        sources.push({
          type: type as SourceType,
          config: sourceConfig,
          resolvedAuth,
        })
      }
    }
    return { config: envConfig, sources, configPath: 'env' }
  }

  // 2. Fall back to config file
  const dir = startDir ?? process.cwd()
  const configPath = findConfigFile(dir)

  if (!configPath) {
    throw new Error(
      `Config not found. Either set env vars (ONES_API_BASE, ONES_ACCOUNT, ONES_PASSWORD) `
      + `or create "${CONFIG_FILENAME}" based on .requirements-mcp.json.example`,
    )
  }

  const raw = readFileSync(configPath, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    throw new Error(`Invalid JSON in ${configPath}`)
  }

  const result = McpConfigSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Invalid config in ${configPath}:\n${result.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    )
  }

  const config = result.data as McpConfig

  // Resolve enabled sources
  const sources: ResolvedSource[] = []
  for (const [type, sourceConfig] of Object.entries(config.sources)) {
    if (sourceConfig && sourceConfig.enabled) {
      const resolvedAuth = resolveAuthEnv(sourceConfig.auth)
      sources.push({
        type: type as SourceType,
        config: sourceConfig,
        resolvedAuth,
      })
    }
  }

  if (sources.length === 0) {
    throw new Error('No enabled sources found in config. Enable at least one source.')
  }

  return { config, sources, configPath }
}

export { findConfigFile, loadConfigFromEnv, resolveAuthEnv }
