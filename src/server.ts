import type { BaseAdapter } from './adapters/index'
import type { LoadConfigResult } from './config/loader'
import { McpServer } from '@modelcontextprotocol/server'
import packageJson from '../packages/ai-dev-requirements/package.json' with { type: 'json' }
import { createAdapter } from './adapters/index'
import { AddManhourSchema, handleAddManhour } from './tools/add-manhour'
import { GetGrillingBriefSchema, GrillingBriefOutputSchema, handleGetGrillingBrief } from './tools/get-grilling-brief'
import { GetIssueDetailSchema, handleGetIssueDetail } from './tools/get-issue-detail'
import { GetRelatedIssuesSchema, handleGetRelatedIssues } from './tools/get-related-issues'
import { GetTestcasesSchema, handleGetTestcases } from './tools/get-testcases'
import { GetWorkItemSchema, handleGetWorkItem } from './tools/get-work-item'
import { handleListPendingWorkItems, ListPendingWorkItemsSchema } from './tools/list-pending-work-items'
import { handleListSources } from './tools/list-sources'
import { ApplyRequirementDecompositionSchema, handleApplyRequirementDecomposition, handleInspectRequirementDecomposition, handlePrepareRequirementDecomposition, InspectRequirementDecompositionSchema, PrepareRequirementDecompositionSchema, RequirementDecompositionApprovalStore } from './tools/requirement-decomposition'
import { handleSearchRequirements, SearchRequirementsSchema } from './tools/search-requirements'
import { handleUpdateTaskPlanDates, UpdateTaskPlanDatesSchema } from './tools/update-task-plan-dates'
import { sanitizePublicError } from './utils/external-content'

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
  const decompositionApprovals = new RequirementDecompositionApprovalStore()
  const decompositionWritesEnabled = (sourceType: string | undefined) => {
    if (process.env.ONES_ENABLE_WRITES !== 'true' || !sourceType)
      return false
    const source = config.sources.find(candidate => candidate.type === sourceType)
    return source?.config.options?.requirementDecompositionWrites === true
  }
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
    'list_pending_work_items',
    {
      title: 'List Pending Work Items',
      description: 'List the current assignee\'s not-started and in-progress ONES requirements and tasks with actual, remaining, and estimated hours plus planned dates. Defects are excluded. Read-only.',
      inputSchema: ListPendingWorkItemsSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleListPendingWorkItems(params, adapters, defaultSource)
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
    'inspect_requirement_decomposition',
    {
      title: 'Inspect Requirement Decomposition',
      description: 'Read a requirement and related task candidates with task detail, status, sorted plan dates, and explicit decomposition-relation verification. When the relation is unverified, candidates are not claimed to be decomposition tasks. Rejects tasks and defects. Never creates or edits ONES data.',
      inputSchema: InspectRequirementDecompositionSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleInspectRequirementDecomposition(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'prepare_requirement_decomposition',
    {
      title: 'Prepare Requirement Decomposition',
      description: 'Validate a structured decomposition for a pending requirement with no existing decomposition tasks, then return the exact create operations and a one-time approval token. Does not write to ONES.',
      inputSchema: PrepareRequirementDecompositionSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handlePrepareRequirementDecomposition(
          params,
          adapters,
          decompositionApprovals,
          defaultSource,
        )
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'apply_requirement_decomposition',
    {
      title: 'Apply Requirement Decomposition',
      description: 'Create the exact previously prepared requirement tasks only after explicit user confirmation. Rechecks requirement/task hashes and uses a one-time token. Disabled by default.',
      inputSchema: ApplyRequirementDecompositionSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const sourceType = params.source ?? defaultSource
        return await handleApplyRequirementDecomposition(
          params,
          adapters,
          decompositionApprovals,
          {
            defaultSource,
            writesEnabled: decompositionWritesEnabled(sourceType),
          },
        )
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
