import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { loadConfig } from './config/loader'
import { createRequirementsServer } from './server'
import { sanitizePublicError } from './utils/external-content'

/**
 * Load .env file into process.env (if it exists).
 * Searches from cwd upward, same as config loader.
 */
function loadEnvFile() {
  let dir = process.cwd()
  while (true) {
    const envPath = resolve(dir, '.env')
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#'))
          continue
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex === -1)
          continue
        const key = trimmed.slice(0, eqIndex).trim()
        let value = trimmed.slice(eqIndex + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
          value = value.slice(1, -1)
        if (!process.env[key])
          process.env[key] = value
      }
      return
    }
    const parent = dirname(dir)
    if (parent === dir)
      break
    dir = parent
  }
}

function createServer() {
  loadEnvFile()

  try {
    return createRequirementsServer(loadConfig())
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Server initialization failed'
    console.error(`[requirements-mcp] ${sanitizePublicError(message)}`)
    process.exit(1)
  }
}

const stdioHandle = serveStdio(createServer, {
  onerror(error) {
    console.error(`[requirements-mcp] ${sanitizePublicError(error.message)}`)
  },
})

let closing = false
function closeStdioServer() {
  if (closing)
    return
  closing = true
  void stdioHandle.close().finally(() => process.exit(0))
}

process.stdin.once('end', closeStdioServer)
process.once('SIGINT', closeStdioServer)
process.once('SIGTERM', closeStdioServer)
