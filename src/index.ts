import type { BaseAdapter } from './adapters/index.js'
import type { LoadConfigResult } from './config/loader.js'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createAdapter } from './adapters/index.js'
import { loadConfig } from './config/loader.js'
import { AddManhourSchema, handleAddManhour } from './tools/add-manhour.js'
import { GetIssueDetailSchema, handleGetIssueDetail } from './tools/get-issue-detail.js'
import { GetRelatedIssuesSchema, handleGetRelatedIssues } from './tools/get-related-issues.js'
import { GetRequirementSchema, handleGetRequirement } from './tools/get-requirement.js'
import { GetTestcasesSchema, handleGetTestcases } from './tools/get-testcases.js'
import { handleListSources } from './tools/list-sources.js'
import { handleSearchRequirements, SearchRequirementsSchema } from './tools/search-requirements.js'
import { handleUpdateTaskPlanDates, UpdateTaskPlanDatesSchema } from './tools/update-task-plan-dates.js'

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
    name: 'ai-dev-requirements',
    version: '0.1.0',
  })

  // Register tools
  server.registerTool(
    'get_requirement',
    {
      description: 'Fetch a single requirement/issue by its ID from a configured source (ONES)',
      inputSchema: GetRequirementSchema.shape,
    },
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

  server.registerTool(
    'search_requirements',
    {
      description: 'Search for requirements/issues by keywords across a configured source',
      inputSchema: SearchRequirementsSchema.shape,
    },
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

  server.registerTool(
    'list_sources',
    {
      description: 'List all configured requirement sources and their status',
    },
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

  server.registerTool(
    'get_related_issues',
    {
      description: 'Get pending defect issues (bugs) related to a requirement task. Returns all pending defects grouped by assignee (current user first).',
      inputSchema: GetRelatedIssuesSchema.shape,
    },
    async (params) => {
      try {
        return await handleGetRelatedIssues(params, adapters, config.config.defaultSource)
      }
      catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    },
  )

  server.registerTool(
    'get_issue_detail',
    {
      description: 'Get detailed information about a specific issue/defect including description, rich text, and images',
      inputSchema: GetIssueDetailSchema.shape,
    },
    async (params) => {
      try {
        return await handleGetIssueDetail(params, adapters, config.config.defaultSource)
      }
      catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    },
  )

  server.registerTool(
    'get_testcases',
    {
      description: 'Get all test cases for a task by its number (e.g. 302). Searches the testcase library for a matching module and returns all cases with steps.',
      inputSchema: GetTestcasesSchema.shape,
    },
    async (params) => {
      try {
        return await handleGetTestcases(params, adapters, config.config.defaultSource)
      }
      catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    },
  )

  server.registerTool(
    'add_manhour',
    {
      description: 'Add a work-hour record to a ONES task, bug, or requirement. Supports task key, uuid, number, or displayId.',
      inputSchema: AddManhourSchema.shape,
    },
    async (params) => {
      try {
        return await handleAddManhour(params, adapters, config.config.defaultSource)
      }
      catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    },
  )

  server.registerTool(
    'update_task_plan_dates',
    {
      description: 'Update plan start and/or plan end dates for a ONES task, bug, or requirement. Supports task key, uuid, number, or displayId.',
      inputSchema: UpdateTaskPlanDatesSchema.shape,
    },
    async (params) => {
      try {
        return await handleUpdateTaskPlanDates(params, adapters, config.config.defaultSource)
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
