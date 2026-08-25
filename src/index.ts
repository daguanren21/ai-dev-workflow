import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { loadConfig } from './config/loader'
import { createRequirementsServer } from './server'
import { sanitizePublicError } from './utils/external-content'
import { loadNearestEnv } from './utils/load-env'

function createServer() {
  loadNearestEnv()

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
