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
import { ExportOnesWikiTreeSchema, GetOnesWikiPageSchema, handleExportOnesWikiTree, handleGetOnesWikiPage, handleLookupEnvironmentAccess, handleSearchOnesWiki, LookupEnvironmentAccessSchema, SearchOnesWikiSchema } from './tools/wiki-read'
import { ApplyWikiWriteSchema, handleApplyWikiWrite, handlePrepareWikiCreate, handlePrepareWikiUpdate, PrepareWikiCreateOutputSchema, PrepareWikiCreateSchema, PrepareWikiUpdateOutputSchema, PrepareWikiUpdateSchema, WikiWriteApprovalStore, WikiWriteResultOutputSchema } from './tools/wiki-write'
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
      const adapter = createAdapter(source.type, source.config, source.resolvedAuth, source.resolvedOpenApiAuth)
      adapters.set(source.type, adapter)
    }
  }

  const defaultSource = config.config.defaultSource
  const decompositionApprovals = new RequirementDecompositionApprovalStore()
  const wikiApprovals = new WikiWriteApprovalStore()
  const decompositionWritesEnabled = (sourceType: string | undefined) => {
    if (process.env.ONES_ENABLE_WRITES !== 'true' || !sourceType)
      return false
    const source = config.sources.find(candidate => candidate.type === sourceType)
    return source?.config.options?.requirementDecompositionWrites === true
  }
  const wikiWritesEnabled = (sourceType: string | undefined) => {
    if (process.env.ONES_WIKI_ENABLE_WRITES !== 'true' || !sourceType)
      return false
    const source = config.sources.find(candidate => candidate.type === sourceType)
    return source?.config.options?.wikiWrites === true
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
    'get_ones_wiki_page',
    {
      title: 'Get ONES Wiki Page',
      description: 'Read one ONES Wiki page as Markdown by page ID, URL, or hierarchical path. Prefer path for requests like "Department/Annual Plans/2026". Unique confidently close paths are corrected automatically; unresolved or ambiguous paths return candidate pages for confirmation. Sensitive values are redacted by default; revealing them requires an explicit argument based on an explicit user request.',
      inputSchema: GetOnesWikiPageSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleGetOnesWikiPage(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'search_ones_wiki',
    {
      title: 'Search ONES Wiki',
      description: 'Search ONES Wiki page metadata. Read-only and fails closed when the provider search endpoint has not been verified.',
      inputSchema: SearchOnesWikiSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleSearchOnesWiki(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'export_ones_wiki_tree',
    {
      title: 'Export ONES Wiki Tree',
      description: 'Export an exact ONES Wiki subtree to local Markdown with an incremental manifest. Secrets are redacted by default and signed attachment URLs are never persisted.',
      inputSchema: ExportOnesWikiTreeSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleExportOnesWikiTree(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'lookup_environment_access',
    {
      title: 'Lookup Environment Access',
      description: 'Find environment access documentation in ONES Wiki. Passwords and tokens are redacted unless the user explicitly requests revealing them.',
      inputSchema: LookupEnvironmentAccessSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handleLookupEnvironmentAccess(params, adapters, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'prepare_wiki_create',
    {
      title: 'Prepare ONES Wiki Create',
      description: 'Resolve an exact parent page and prepare one exact Wiki create operation. Never writes. Returns a one-time 30-minute approval token.',
      inputSchema: PrepareWikiCreateSchema,
      outputSchema: PrepareWikiCreateOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handlePrepareWikiCreate(params, adapters, wikiApprovals, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'apply_wiki_create',
    {
      title: 'Apply ONES Wiki Create',
      description: 'Create the exact prepared page only after the user confirms immediately before submission. Rechecks the parent baseline and is disabled by default.',
      inputSchema: ApplyWikiWriteSchema,
      outputSchema: WikiWriteResultOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const sourceType = params.source ?? defaultSource
        return await handleApplyWikiWrite(params, adapters, wikiApprovals, {
          defaultSource,
          writesEnabled: wikiWritesEnabled(sourceType),
          expectedKind: 'create',
        })
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'prepare_wiki_update',
    {
      title: 'Prepare ONES Wiki Update',
      description: 'Prepare an exact minimal Wiki update, including exact table-row targeting. Never writes. Ambiguous pages, tables, or text matches fail closed.',
      inputSchema: PrepareWikiUpdateSchema,
      outputSchema: PrepareWikiUpdateOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        return await handlePrepareWikiUpdate(params, adapters, wikiApprovals, defaultSource)
      }
      catch (err) {
        return toolError(err)
      }
    },
  )

  server.registerTool(
    'apply_wiki_update',
    {
      title: 'Apply ONES Wiki Update',
      description: 'Apply the exact prepared minimal edit only after the user confirms immediately before submission. Rechecks page version/hash and is disabled by default.',
      inputSchema: ApplyWikiWriteSchema,
      outputSchema: WikiWriteResultOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const sourceType = params.source ?? defaultSource
        return await handleApplyWikiWrite(params, adapters, wikiApprovals, {
          defaultSource,
          writesEnabled: wikiWritesEnabled(sourceType),
          expectedKind: 'update',
        })
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
