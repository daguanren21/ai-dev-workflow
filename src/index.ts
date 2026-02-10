import type { BaseAdapter } from './adapters/index.js'
import type { LoadConfigResult } from './config/loader.js'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createAdapter } from './adapters/index.js'
import { loadConfig } from './config/loader.js'
import { GetRequirementSchema, handleGetRequirement } from './tools/get-requirement.js'
import { handleListSources } from './tools/list-sources.js'
import { handleSearchRequirements, SearchRequirementsSchema } from './tools/search-requirements.js'

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
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
          value = value.slice(1, -1)
        }
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
      return
    }
    const parent = dirname(dir)
    if (parent === dir)
      break
    dir = parent
  }
}

async function main() {
  // Load .env before anything else
  loadEnvFile()

  // Load config
  let config: LoadConfigResult
  try {
    config = loadConfig()
  }
  catch (err) {
    console.error(`[requirements-mcp] ${(err as Error).message}`)
    process.exit(1)
  }

  // Create adapters for enabled sources
  const adapters = new Map<string, BaseAdapter>()
  for (const source of config.sources) {
    const adapter = createAdapter(source.type, source.config, source.resolvedAuth)
    adapters.set(source.type, adapter)
  }

  // Create MCP server
  const server = new McpServer({
    name: '@ai-dev/requirements',
    version: '0.1.0',
  })

  // Register tools
  server.tool(
    'get_requirement',
    'Fetch a single requirement/issue by its ID from a configured source (ONES)',
    GetRequirementSchema.shape,
    async (params) => {
      try {
        return await handleGetRequirement(params, adapters, config.config.defaultSource)
      }
      catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'search_requirements',
    'Search for requirements/issues by keywords across a configured source',
    SearchRequirementsSchema.shape,
    async (params) => {
      try {
        return await handleSearchRequirements(params, adapters, config.config.defaultSource)
      }
      catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'list_sources',
    'List all configured requirement sources and their status',
    {},
    async () => {
      try {
        return await handleListSources(adapters, config.config)
      }
      catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    },
  )

  // Start stdio transport
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('[requirements-mcp] Fatal error:', err)
  process.exit(1)
})
