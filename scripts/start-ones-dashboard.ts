import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REQUIRED_KEYS = ['ONES_API_BASE', 'ONES_ACCOUNT', 'ONES_PASSWORD'] as const
const CODEX_REQUIREMENTS_ENV_SECTION = '[mcp_servers.requirements.env]'

function decodeTomlValue(raw: string): string {
  const value = raw.trim()
  if (value.startsWith('"') && value.endsWith('"'))
    return JSON.parse(value) as string
  if (value.startsWith('\'') && value.endsWith('\''))
    return value.slice(1, -1)
  return value
}

function loadRequirementsEnvironment(): void {
  if (REQUIRED_KEYS.every(key => process.env[key]))
    return

  const configPath = resolve(homedir(), '.codex', 'config.toml')
  if (!existsSync(configPath))
    return

  let inRequirementsEnvironment = false
  for (const rawLine of readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('[')) {
      inRequirementsEnvironment = line === CODEX_REQUIREMENTS_ENV_SECTION
      continue
    }
    if (!inRequirementsEnvironment || line.startsWith('#'))
      continue
    const separator = line.indexOf('=')
    if (separator < 1)
      continue
    const key = line.slice(0, separator).trim()
    if (!REQUIRED_KEYS.includes(key as typeof REQUIRED_KEYS[number]))
      continue
    process.env[key] ??= decodeTomlValue(line.slice(separator + 1))
  }
}

async function main(): Promise<void> {
  loadRequirementsEnvironment()
  const missing = REQUIRED_KEYS.filter(key => !process.env[key])
  if (missing.length > 0)
    throw new Error(`Missing ONES configuration: ${missing.join(', ')}`)

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const serverEntry = resolve(projectRoot, 'apps/ones-task-dashboard/dist/server/server.mjs')
  if (!existsSync(serverEntry))
    throw new Error('Dashboard is not built. Run "pnpm build:dashboard" first.')

  process.env.NODE_ENV = 'production'
  await import(pathToFileURL(serverEntry).href)
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unable to start ONES dashboard'
  console.error(`[ones-dashboard] ${message}`)
  process.exitCode = 1
})
