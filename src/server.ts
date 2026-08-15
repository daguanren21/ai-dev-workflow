import type { BaseAdapter } from './adapters/index.js'
import type { LoadConfigResult } from './config/loader.js'
import { McpServer } from '@modelcontextprotocol/server'
import packageJson from '../packages/ai-dev-requirements/package.json' with { type: 'json' }
import { createAdapter } from './adapters/index.js'
import { AddManhourSchema, handleAddManhour } from './tools/add-manhour.js'
import { GetGrillingBriefSchema, GrillingBriefOutputSchema, handleGetGrillingBrief } from './tools/get-grilling-brief.js'
import { GetIssueDetailSchema, handleGetIssueDetail } from './tools/get-issue-detail.js'
import { GetRelatedIssuesSchema, handleGetRelatedIssues } from './tools/get-related-issues.js'
import { GetTestcasesSchema, handleGetTestcases } from './tools/get-testcases.js'
import { GetWorkItemSchema, handleGetWorkItem } from './tools/get-work-item.js'
import { handleListSources } from './tools/list-sources.js'
import { handleSearchRequirements, SearchRequirementsSchema } from './tools/search-requirements.js'
import { handleUpdateTaskPlanDates, UpdateTaskPlanDatesSchema } from './tools/update-task-plan-dates.js'
import { sanitizePublicError } from './utils/external-content.js'

function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Unexpected operation failure'
  return {
    content: [{ type: 'text' as const, text: `Error: ${sanitizePublicError(message)}` }],
    isError: true as const,
  }
}

export function createRequirementsServer(
  config: LoadConfigResult,
  adapterOverrides?: ReadonlyMap<string, BaseAdapter>,
) {
  const adapters = new Map<string, BaseAdapter>(adapterOverrides)
  if (!adapterOverrides) {
    for (const source of config.sources) {
      const adapter = createAdapter(source.type, source.config, source.resolvedAuth)
      adapters.set(source.type, adapter)
    }
  }

  const defaultSource = config.config.defaultSource
  const server = new McpServer({
    name: 'ai-dev-requirements',
    version: packageJson.version,
  })

  server.registerTool(
    'get_work_item',
    {
      title: 'Get Work Item',
      description: 'Fetch a ONES work item by ID and classify it from issueType/subIssueType. Requirements include wiki docs; tasks and defects return their own source context.',
      inputSchema: GetWorkItemSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleGetWorkItem(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'search_requirements',
    {
      title: 'Search Requirements',
      description: 'Search for requirements, tasks, or defects by keywords across a configured source',
      inputSchema: SearchRequirementsSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleSearchRequirements(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'list_sources',
    {
      title: 'List Sources',
      description: 'List all configured requirement sources and their status',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return await handleListSources(adapters, config.config)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'get_related_issues',
    {
      title: 'Get Related Issues',
      description: 'Get pending defects related to a requirement or task. Rejects a defect ID; use get_issue_detail instead.',
      inputSchema: GetRelatedIssuesSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleGetRelatedIssues(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'get_issue_detail',
    {
      title: 'Get Issue Detail',
      description: 'Get defect detail including description, rich text, and images. Rejects a requirement or task ID; use get_work_item instead.',
      inputSchema: GetIssueDetailSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleGetIssueDetail(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'get_testcases',
    {
      title: 'Get Test Cases',
      description: 'Get test cases for a requirement or task number. Rejects a defect ID; use get_issue_detail instead.',
      inputSchema: GetTestcasesSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleGetTestcases(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'get_grilling_brief',
    {
      title: 'Get Grilling Brief',
      description: 'Load ONES source context once, classify requirement/task/defect, and separate fact gaps from decision gaps for grill-me.',
      inputSchema: GetGrillingBriefSchema,
      outputSchema: GrillingBriefOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleGetGrillingBrief(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'add_manhour',
    {
      title: 'Add Manhour',
      description: 'Add a work-hour record to a ONES task, bug, or requirement. Supports task key, uuid, number, or displayId.',
      inputSchema: AddManhourSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleAddManhour(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'update_task_plan_dates',
    {
      title: 'Update Task Plan Dates',
      description: 'Update plan start and/or plan end dates for a ONES task, bug, or requirement. Supports task key, uuid, number, or displayId.',
      inputSchema: UpdateTaskPlanDatesSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleUpdateTaskPlanDates(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  return server
}
