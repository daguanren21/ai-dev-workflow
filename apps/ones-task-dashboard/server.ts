import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BaseAdapter } from '../../src/adapters/base'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAdapter } from '../../src/adapters/index'
import { loadConfig } from '../../src/config/loader'
import { sanitizePublicError } from '../../src/utils/external-content'

const HOST = '127.0.0.1'
const PORT = Number.parseInt(process.env.ONES_DASHBOARD_PORT ?? '4178', 10)
const isProduction = process.env.NODE_ENV === 'production'
const rootDir = dirname(fileURLToPath(import.meta.url))

function loadEnvFile(startDir: string): void {
  let current = resolve(startDir)
  while (true) {
    const path = join(current, '.env')
    if (existsSync(path)) {
      for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#'))
          continue
        const separator = line.indexOf('=')
        if (separator < 1)
          continue
        const key = line.slice(0, separator).trim()
        let value = line.slice(separator + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
          value = value.slice(1, -1)
        process.env[key] ??= value
      }
      return
    }
    const parent = dirname(current)
    if (parent === current)
      return
    current = parent
  }
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', 'default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\'; img-src \'self\' data:; frame-ancestors \'self\'')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'SAMEORIGIN')
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  setSecurityHeaders(response)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

async function getPendingWorkItems(response: ServerResponse, adapter: BaseAdapter): Promise<void> {
  try {
    sendJson(response, 200, await adapter.listPendingWorkItems())
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load ONES tasks'
    sendJson(response, 500, { error: sanitizePublicError(message) })
  }
}

const staticRoot = resolve(rootDir, '../client')
const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
}

function serveStatic(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? '/', `http://${HOST}`)
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  const normalized = resolve(staticRoot, requested)
  const withinStaticRoot = normalized === staticRoot || normalized.startsWith(`${staticRoot}/`)
  const filePath = withinStaticRoot && existsSync(normalized)
    ? normalized
    : join(staticRoot, 'index.html')
  const extension = filePath.slice(filePath.lastIndexOf('.'))
  setSecurityHeaders(response)
  response.statusCode = 200
  response.setHeader('Content-Type', mimeTypes[extension] ?? 'application/octet-stream')
  response.end(readFileSync(filePath))
}

async function main(): Promise<void> {
  loadEnvFile(process.cwd())
  const loaded = loadConfig(process.cwd())
  const source = loaded.sources.find(item => item.type === (loaded.config.defaultSource ?? 'ones'))
  if (!source)
    throw new Error('ONES source is not enabled')
  const adapter = createAdapter(source.type, source.config, source.resolvedAuth)
  const vite = isProduction
    ? null
    : await import('vite').then(({ createServer: createViteServer }) => createViteServer({
        root: rootDir,
        server: { middlewareMode: true },
        appType: 'spa',
      }))

  const server = createServer(async (request, response) => {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Read-only server: only GET is allowed' })
      return
    }
    if (request.url?.startsWith('/api/pending')) {
      await getPendingWorkItems(response, adapter)
      return
    }
    if (vite) {
      vite.middlewares(request, response, () => sendJson(response, 404, { error: 'Not found' }))
      return
    }
    serveStatic(request, response)
  })

  server.listen(PORT, HOST, () => {
    process.stdout.write(`[ones-dashboard] Read-only dashboard: http://${HOST}:${PORT}\n`)
  })

  async function close(): Promise<void> {
    await vite?.close()
    server.close()
  }

  process.once('SIGINT', () => void close())
  process.once('SIGTERM', () => void close())
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unable to start ONES dashboard'
  console.error(`[ones-dashboard] ${sanitizePublicError(message)}`)
  process.exitCode = 1
})
