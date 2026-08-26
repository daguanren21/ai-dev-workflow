import type { SourceConfig } from '../../types/config'
import type { AddManhourResult, ApplyRequirementDecompositionResult, IssueDetail, PendingWorkItemsResult, RelatedIssue, Requirement, RequirementDecompositionContext, SearchResult, SourceType, TestCaseResult, UpdateTaskPlanDatesResult } from '../../types/requirement'
import type { WikiCreateRequest, WikiDeleteRequest, WikiDeleteResult, WikiPage, WikiPageChildrenParams, WikiPageLocator, WikiPageSearchParams, WikiPageSummary, WikiPathResolution, WikiPathResolveParams, WikiUpdateRequest, WikiWriteResult } from '../../types/wiki'
import type { RemoteImageTrust } from '../../utils/safe-image'
import type { AddManhourParams, CreateRequirementDecompositionParams, GetIssueDetailParams, GetRelatedIssuesParams, GetRequirementDecompositionContextParams, GetRequirementParams, GetTestcasesParams, SearchRequirementsParams, UpdateTaskPlanDatesParams } from '../base'
import type { OnesProjectNode, OnesRelatedActivity, OnesSession, OnesTaskNode, OnesTaskRef } from './types'
import { classifyOnesWorkItem } from '../../utils/ones-issue-kind'
import { BaseAdapter } from '../base'
import { OnesApiClient } from './api-client'
import { OnesIssueReader } from './issue-reader'
import { OnesTaskContent } from './task-content'
import { encodeOnesPathIdentifier, parseDisplayId, toRequirement } from './task-helpers'
import { OnesTaskPlanning } from './task-planning'
import { DEFAULT_STATUS_NOT_IN, PROJECTS_QUERY, RELATED_ACTIVITIES_QUERY, SEARCH_TASKS_QUERY, TASK_DETAIL_QUERY } from './task-queries'
import { OnesTaskWriter } from './task-writer'
import { OnesTestcaseReader } from './testcase-reader'
import { OnesWikiProductWriter } from './wiki-product'
import { isConfiguredOriginUrl, isOnesWikiUrlInput, OnesWikiReader, parseOnesWikiPageRoute } from './wiki-reader'

// ============ ONES response types ============

interface OnesTeamUserNode {
  uuid?: string
  name?: string
  user?: { uuid?: string, name?: string }
  org_user?: { org_user_uuid?: string, name?: string }
  orgUser?: { uuid?: string, name?: string }
  orgUserUuid?: string
  org_user_uuid?: string
}

interface OnesRestTaskSearchItem {
  fields?: {
    uuid?: string
    number?: number
    summary?: string
    issue_type_name?: string
    issue_type_uuid?: string
    project_uuid?: string
    project_name?: string
  }
}

interface OnesRestTaskSearchResponse {
  datas?: { task?: OnesRestTaskSearchItem[] }
}

// ============ Search helpers ============

type OnesSearchIntent = 'all_bugs' | 'all_tasks' | 'keyword'

function parseOnesSearchIntent(query: string): OnesSearchIntent {
  if (!query)
    return 'keyword'

  const normalized = query.toLowerCase()

  if (query.includes('\u7F3A\u9677') || normalized.includes('bug'))
    return 'all_bugs'

  if (query.includes('\u4EFB\u52A1'))
    return 'all_tasks'

  return 'keyword'
}

function extractAssigneeName(query: string, intent: OnesSearchIntent): string | null {
  if (intent === 'keyword')
    return null

  const trimmed = query.trim()
  if (!trimmed)
    return null

  const ownerStyleMatch = trimmed.match(/\u8D1F\u8D23\u4EBA\u4E3A(.+?)\u7684?(?:\u7F3A\u9677|bug)$/i)
  if (ownerStyleMatch?.[1]) {
    return ownerStyleMatch[1].trim()
  }

  const genericMatch = trimmed.match(/^(查询)?(.+?)的(?:缺陷|bug|任务)$/i)
  const candidate = genericMatch?.[2]?.trim()
  if (!candidate || candidate.includes('我')) {
    return null
  }

  return candidate
}

function extractNamedAssignee(query: string, intent: OnesSearchIntent): string | null {
  if (intent === 'keyword')
    return null

  const compact = query.replace(/\s+/g, '').trim()
  if (!compact)
    return null

  const ownerStyleMatch = compact.match(/(?:\u8D1F\u8D23\u4EBA\u4E3A|\u8D1F\u8D23\u4EBA\u662F|\u6307\u6D3E\u7ED9|\u5206\u914D\u7ED9)(.+?)\u7684?(?:\u7F3A\u9677|bug|\u4EFB\u52A1)$/i)
  if (ownerStyleMatch?.[1]) {
    return ownerStyleMatch[1].trim()
  }

  const genericMatch = compact.match(/^(?:\u67E5\u8BE2|\u67E5\u627E|\u641C\u7D22)?(.+?)\u7684?(?:\u7F3A\u9677|bug|\u4EFB\u52A1)$/i)
  const candidate = genericMatch?.[1]?.trim()

  if (
    !candidate
    || candidate.startsWith('\u6211')
    || /^(?:\u6211|\u6211\u7684|\u6211\u6240\u6709|\u6211\u5168\u90E8|\u672C\u4EBA|\u5F53\u524D\u7528\u6237)$/.test(candidate)
  ) {
    return null
  }

  return candidate
}

function getBugStatusPriority(task: Pick<OnesTaskNode, 'status'>): number {
  if (task.status?.category === 'to_do')
    return 0

  if (task.status?.category === 'in_progress')
    return 1

  return Number.POSITIVE_INFINITY
}

function isOpenOrInProgressBug(task: Pick<OnesTaskNode, 'status'>): boolean {
  const category = task.status?.category
  return category === 'to_do' || category === 'in_progress'
}

function extractTeamUsers(payload: unknown): Array<{ uuid: string, name: string }> {
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : null

  if (!record)
    return []

  const candidates = [
    record.users,
    record.items,
    record.list,
    record.results,
    (record.data as Record<string, unknown> | undefined)?.users,
    (record.data as Record<string, unknown> | undefined)?.items,
    (record.data as Record<string, unknown> | undefined)?.list,
    (record.data as Record<string, unknown> | undefined)?.results,
  ]

  const rawUsers = candidates.find(Array.isArray)
  if (!rawUsers)
    return []

  return rawUsers
    .map((item) => {
      const user = item && typeof item === 'object'
        ? item as OnesTeamUserNode
        : null

      if (!user)
        return null

      const uuid = user.uuid
        ?? user.user?.uuid
        ?? user.orgUser?.uuid
        ?? user.orgUserUuid
        ?? user.org_user_uuid
        ?? user.org_user?.org_user_uuid

      const name = user.name
        ?? user.user?.name
        ?? user.orgUser?.name
        ?? user.org_user?.name

      if (!uuid || !name)
        return null

      return { uuid, name }
    })
    .filter((item): item is { uuid: string, name: string } => item !== null)
}

// ============ ONES Adapter ============

export class OnesTaskAdapter extends BaseAdapter {
  private readonly api: OnesApiClient
  private readonly content: OnesTaskContent
  private readonly issueReader: OnesIssueReader
  private readonly planning: OnesTaskPlanning
  private readonly taskWriter: OnesTaskWriter
  private readonly testcaseReader: OnesTestcaseReader
  private readonly sourceIssuedImageUrls = new Set<string>()
  private readonly wikiReader: OnesWikiReader
  private readonly wikiProductWriter: OnesWikiProductWriter

  constructor(
    sourceType: SourceType,
    config: SourceConfig,
    resolvedAuth: Record<string, string>,
    resolvedOpenApiAuth?: Record<string, string>,
  ) {
    super(sourceType, config, resolvedAuth, resolvedOpenApiAuth)
    this.api = new OnesApiClient(config, resolvedAuth)
    this.wikiReader = new OnesWikiReader({
      apiBase: config.apiBase,
      openApiToken: resolvedOpenApiAuth?.token,
      getSession: () => this.login(),
    })
    this.wikiProductWriter = new OnesWikiProductWriter({
      apiBase: config.apiBase,
      getSession: () => this.login(),
      invalidateTree: (teamId, spaceId) => this.wikiReader.invalidateTree(teamId, spaceId),
    })
    this.content = new OnesTaskContent({
      apiBase: config.apiBase,
      wikiReader: this.wikiReader,
      fetchTaskInfo: taskUuid => this.fetchTaskInfo(taskUuid),
      fetchRelatedActivities: taskKey => this.fetchRelatedActivities(taskKey),
      getSession: () => this.login(),
      authorizedFetch: (path, init) => this.api.authorizedFetch(path, init),
      classifyRemoteImageUrl: url => this.classifyRemoteImageUrl(url),
      rememberSourceIssuedImageUrl: url => this.rememberSourceIssuedImageUrl(url),
    })
    this.planning = new OnesTaskPlanning({
      api: this.api,
      getRequirement: id => this.getRequirement({ id }),
      fetchTaskInfo: taskUuid => this.fetchTaskInfo(taskUuid),
      resolveProjectIdentifier: async (projectUuid) => {
        const project = (await this.fetchProjects()).find(candidate => candidate.uuid === projectUuid)
        return project?.identifier?.toUpperCase() ?? null
      },
    })
    this.issueReader = new OnesIssueReader({
      api: this.api,
      resolveTaskRef: input => this.resolveTaskRef(input),
      getFreshTaskDescriptions: task => this.content.getFreshTaskDescriptions(task),
    })
    this.taskWriter = new OnesTaskWriter({
      api: this.api,
      resolveTaskRef: input => this.resolveTaskRef(input),
    })
    this.testcaseReader = new OnesTestcaseReader({
      config,
      api: this.api,
      refreshImageUrls: html => this.content.refreshImageUrls(html),
    })
  }

  override classifyRemoteImageUrl(url: string): RemoteImageTrust {
    const configuredTrust = super.classifyRemoteImageUrl(url)
    if (configuredTrust === 'configured-origin')
      return configuredTrust

    try {
      return this.sourceIssuedImageUrls.has(new URL(url).toString())
        ? 'source-issued'
        : 'untrusted'
    }
    catch {
      return 'untrusted'
    }
  }

  private rememberSourceIssuedImageUrl(candidate: string): string | null {
    try {
      const normalized = new URL(candidate, this.config.apiBase).toString()
      const configuredTrust = super.classifyRemoteImageUrl(normalized)
      if (configuredTrust !== 'configured-origin' && new URL(normalized).protocol !== 'https:')
        return null

      if (configuredTrust !== 'configured-origin') {
        if (this.sourceIssuedImageUrls.size >= 256) {
          const oldest = this.sourceIssuedImageUrls.values().next().value
          if (typeof oldest === 'string')
            this.sourceIssuedImageUrls.delete(oldest)
        }
        this.sourceIssuedImageUrls.add(normalized)
      }
      return normalized
    }
    catch {
      return null
    }
  }

  private login(): Promise<OnesSession> {
    return this.api.getSession()
  }

  private graphql<T>(query: string, variables: Record<string, unknown>, tag?: string): Promise<T> {
    return this.api.graphql<T>(query, variables, tag)
  }

  private onesql<T>(query: string, variables: Record<string, unknown>, workItemType: string): Promise<T> {
    return this.api.onesql<T>(query, variables, workItemType)
  }

  private async fetchRelatedActivities(taskKey: string): Promise<OnesRelatedActivity[]> {
    try {
      const data = await this.onesql<{
        data?: {
          task?: {
            relatedActivities?: OnesRelatedActivity[]
          } | null
        }
      }>(RELATED_ACTIVITIES_QUERY, { key: taskKey }, 'Task')

      return data.data?.task?.relatedActivities ?? []
    }
    catch {
      // Related activities are optional enrichment and must not block work-item lookup.
      return []
    }
  }

  private async searchTaskByNumber(taskNumber: number): Promise<OnesTaskNode | null> {
    const session = await this.login()
    const url = `${this.config.apiBase}/project/api/project/team/${session.teamUuid}/search?q=${encodeURIComponent(String(taskNumber))}&start=0&limit=10&types=task`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })

    if (!response.ok)
      return null

    const data = await response.json() as OnesRestTaskSearchResponse
    const tasks = data.datas?.task ?? []
    const found = tasks
      .map(item => item.fields)
      .find(fields => fields?.uuid && fields.number === taskNumber)

    if (!found?.uuid)
      return null

    return {
      key: `task-${found.uuid}`,
      uuid: found.uuid,
      number: found.number ?? taskNumber,
      name: found.summary ?? '',
      status: { uuid: '', name: '', category: undefined },
      issueType: found.issue_type_uuid || found.issue_type_name
        ? {
            uuid: found.issue_type_uuid ?? '',
            name: found.issue_type_name ?? '',
          }
        : undefined,
      project: found.project_uuid || found.project_name
        ? {
            uuid: found.project_uuid ?? '',
            name: found.project_name ?? '',
          }
        : undefined,
    }
  }

  private async fetchProjects(): Promise<OnesProjectNode[]> {
    const data = await this.graphql<{ data?: { buckets?: Array<{ projects?: OnesProjectNode[] }> } }>(
      PROJECTS_QUERY,
      {
        projectOrderBy: { isPin: 'DESC', namePinyin: 'ASC', createTime: 'DESC' },
        projectFilterGroup: [{ visibleInProject_equal: true, isArchive_equal: false }],
        groupBy: { projects: {} },
        orderBy: null,
        pagination: { limit: 50, after: '', preciseCount: true },
      },
      'projects-group-list-for-project-view',
    )

    return data.data?.buckets?.flatMap(bucket => bucket.projects ?? []) ?? []
  }

  private async findTaskByNumber(taskNumber: number, projectUuid?: string): Promise<OnesTaskNode | null> {
    const filter: Record<string, unknown> = { number_in: [taskNumber] }
    if (projectUuid)
      filter.project_in = [projectUuid]

    const searchData = await this.graphql<{
      data?: { buckets?: Array<{ tasks?: OnesTaskNode[] }> }
    }>(
      SEARCH_TASKS_QUERY,
      {
        groupBy: { tasks: {} },
        groupOrderBy: null,
        orderBy: { createTime: 'DESC' },
        filterGroup: [filter],
        search: null,
        pagination: { limit: 10, preciseCount: false },
        limit: 10,
      },
      'group-task-data',
    )

    const allTasks = searchData.data?.buckets?.flatMap(b => b.tasks ?? []) ?? []
    const found = allTasks.find(task =>
      task.number === taskNumber
      && (!projectUuid || task.project?.uuid === projectUuid),
    )
    if (found)
      return found

    if (projectUuid)
      return null

    return this.searchTaskByNumber(taskNumber)
  }

  private async resolveTaskRef(input: string): Promise<OnesTaskRef> {
    const taskId = input.trim()
    if (!taskId)
      throw new Error('ONES: taskId is required')

    const numMatch = taskId.match(/^#?(\d+)$/)
    if (numMatch) {
      const taskNumber = Number.parseInt(numMatch[1], 10)
      const found = await this.findTaskByNumber(taskNumber)
      if (!found)
        throw new Error(`ONES: Task #${taskNumber} not found in current team`)

      return {
        key: found.key ?? `task-${found.uuid}`,
        uuid: found.uuid,
      }
    }

    const displayId = parseDisplayId(taskId)
    if (displayId) {
      const projects = await this.fetchProjects()
      const project = projects.find(item => item.identifier?.toLowerCase() === displayId.identifier.toLowerCase())
      if (!project)
        throw new Error(`ONES: Project identifier "${displayId.identifier}" not found in current team`)

      const found = await this.findTaskByNumber(displayId.number, project.uuid)
      if (!found)
        throw new Error(`ONES: Task "${taskId}" not found in current team`)

      return {
        key: found.key ?? `task-${found.uuid}`,
        uuid: found.uuid,
      }
    }

    const key = taskId.startsWith('task-') ? taskId : `task-${taskId}`
    return {
      key,
      uuid: key.slice('task-'.length),
    }
  }

  private async searchTeamUsers(keyword: string): Promise<Array<{ uuid: string, name: string }>> {
    const session = await this.login()
    const url = `${this.config.apiBase}/project/api/project/team/${session.teamUuid}/users/search`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyword,
        status: [1],
        team_member_status: [1, 4],
        types: [1, 10],
      }),
    })

    if (!response.ok)
      throw new Error(`ONES user search error: ${response.status}`)

    return extractTeamUsers(await response.json())
  }

  private async resolveAssigneeUuid(name: string): Promise<string | null> {
    const trimmed = name.trim()
    if (!trimmed)
      return null

    const users = await this.searchTeamUsers(trimmed)
    const exactMatch = users.find(user => user.name === trimmed)
    if (exactMatch)
      return exactMatch.uuid

    const normalizedTarget = trimmed.toLowerCase()
    const fuzzyMatch = users.find(user => user.name.toLowerCase().includes(normalizedTarget))
    return fuzzyMatch?.uuid ?? null
  }

  /**
   * Fetch task info via REST API (includes description/rich fields not available in GraphQL).
   * Reference: ones/packages/core/src/tasks.ts → fetchTaskInfo
   */
  private async fetchTaskInfo(taskUuid: string): Promise<Record<string, unknown>> {
    const session = await this.login()
    const teamUuid = encodeOnesPathIdentifier(session.teamUuid, 'team UUID')
    const encodedTaskUuid = encodeOnesPathIdentifier(taskUuid, 'task UUID')
    const url = `${this.config.apiBase}/project/api/project/team/${teamUuid}/task/${encodedTaskUuid}/info`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })

    if (!response.ok) {
      return {}
    }

    return response.json() as Promise<Record<string, unknown>>
  }

  /**
   * Fetch wiki page content via REST API.
   * Endpoint: /wiki/api/wiki/team/{teamUuid}/online_page/{wikiUuid}/content
   */
  async getWikiPage(params: WikiPageLocator): Promise<WikiPage> {
    return this.wikiReader.getPage(params)
  }

  async searchWikiPages(params: WikiPageSearchParams): Promise<WikiPageSummary[]> {
    return this.wikiReader.search(params)
  }

  async listWikiPageChildren(params: WikiPageChildrenParams): Promise<WikiPageSummary[]> {
    return this.wikiReader.listChildren(params)
  }

  async resolveWikiPath(params: WikiPathResolveParams): Promise<WikiPathResolution> {
    return this.wikiReader.resolvePath(params)
  }

  async createWikiPage(params: WikiCreateRequest): Promise<WikiWriteResult> {
    return this.wikiProductWriter.create(params)
  }

  async updateWikiPage(params: WikiUpdateRequest): Promise<WikiWriteResult> {
    return this.wikiProductWriter.update(params)
  }

  async deleteWikiPage(params: WikiDeleteRequest): Promise<WikiDeleteResult> {
    return this.wikiProductWriter.delete(params)
  }

  /**
   * Fetch a work item by UUID, number, display id, or wiki URL.
   * Routes by issueType.detailType: requirements (1 and 5) load wiki docs;
   * tasks (2) and defects (3) return the item itself without wiki expansion.
   */
  async getRequirement(params: GetRequirementParams): Promise<Requirement> {
    const wikiRoute = parseOnesWikiPageRoute(params.id)
    if (wikiRoute && !isConfiguredOriginUrl(params.id, this.config.apiBase))
      throw new Error('ONES: Wiki URL origin does not match the configured source')
    if (wikiRoute) {
      const rendered = await this.wikiReader.fetchContent(wikiRoute.wikiUuid, wikiRoute.teamUuid)

      return {
        id: wikiRoute.wikiUuid,
        source: 'ones',
        title: `Wiki ${wikiRoute.wikiUuid}`,
        description: rendered.content,
        status: 'open',
        priority: 'medium',
        type: 'feature',
        labels: [],
        reporter: '',
        assignee: null,
        createdAt: '',
        updatedAt: '',
        dueDate: null,
        attachments: rendered.attachments,
        raw: {
          input: params.id,
          teamUuid: wikiRoute.teamUuid,
          wikiUuid: wikiRoute.wikiUuid,
          workItemKind: 'requirement',
          sourceDescription: rendered.content,
          hasSourceDescription: Boolean(rendered.content.trim()),
          hasRequirementDocuments: Boolean(rendered.content.trim()),
        },
      }
    }
    if (isOnesWikiUrlInput(params.id)) {
      throw new Error('ONES: Unsupported wiki page URL. Expected /wiki/#/team/{teamUuid}/space/{spaceUuid}/page/{wikiUuid}')
    }

    const taskRef = await this.resolveTaskRef(params.id)

    const graphqlData = await this.graphql<{ data?: { task?: OnesTaskNode } }>(
      TASK_DETAIL_QUERY,
      { key: taskRef.key },
      'Task',
    )

    const task = graphqlData.data?.task
    if (!task) {
      throw new Error(`ONES: Task "${params.id}" not found`)
    }

    const kind = classifyOnesWorkItem(task.issueType, task.subIssueType)
    if (kind === 'unknown') {
      throw new Error(
        `ONES: Unable to classify "${params.id}". `
        + `issueType=${task.issueType?.name ?? 'missing'}, `
        + `detailType=${task.issueType?.detailType ?? 'missing'}, `
        + `subIssueType=${task.subIssueType?.name ?? 'missing'}, `
        + `subDetailType=${task.subIssueType?.detailType ?? 'missing'}`,
      )
    }
    if (kind === 'requirement')
      return this.content.buildRequirementDocument(params.id, taskRef.key, task)

    return this.content.buildWorkItemSummary(task, kind)
  }

  /**
   * Search tasks assigned to current user via GraphQL.
   * Uses keyword-based local filtering (matching ONES reference implementation).
   */
  async searchRequirements(params: SearchRequirementsParams): Promise<SearchResult> {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 50
    const intent = parseOnesSearchIntent(params.query)
    const assigneeName = extractNamedAssignee(params.query, intent) ?? extractAssigneeName(params.query, intent)
    const assigneeUuid = assigneeName
      ? await this.resolveAssigneeUuid(assigneeName)
      : null

    if (assigneeName && !assigneeUuid) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
      }
    }

    const filter: Record<string, unknown> = {
      status_notIn: DEFAULT_STATUS_NOT_IN,
    }

    if (assigneeName) {
      filter.assign_in = [assigneeUuid]
    }
    else {
      filter.assign_in = ['${currentUser}']
    }

    const data = await this.graphql<{
      data?: {
        buckets?: Array<{
          key: string
          tasks?: OnesTaskNode[]
        }>
      }
    }>(
      SEARCH_TASKS_QUERY,
      {
        groupBy: { tasks: {} },
        groupOrderBy: null,
        orderBy: { position: 'ASC', createTime: 'DESC' },
        filterGroup: [filter],
        search: null,
        // "all tasks" is filtered locally by work-item kind and status category.
        // Fetch the server-side safety cap first so requirements, defects, and
        // completed tasks near the front cannot hide later pending tasks.
        pagination: { limit: intent === 'all_tasks' ? 1000 : pageSize * page, preciseCount: false },
        limit: 1000,
      },
      'group-task-data',
    )

    let tasks = data.data?.buckets?.flatMap(b => b.tasks ?? []) ?? []

    if (intent === 'all_bugs') {
      tasks = tasks
        .filter(task => classifyOnesWorkItem(task.issueType, task.subIssueType) === 'defect')
        .filter(task => isOpenOrInProgressBug(task))
        .sort((a, b) => getBugStatusPriority(a) - getBugStatusPriority(b))
    }

    if (intent === 'all_tasks') {
      // Requirements are intentionally excluded from the “my tasks” entry.
      tasks = tasks
        .filter(task => classifyOnesWorkItem(task.issueType, task.subIssueType) === 'task')
        .filter(task => task.status?.category === 'to_do' || task.status?.category === 'in_progress')
    }

    if (assigneeUuid) {
      tasks = tasks.filter(task => task.assign?.uuid === assigneeUuid)
    }

    // Local keyword filter (matching ones-api.ts behavior)
    if (intent === 'keyword' && params.query) {
      const keyword = params.query.trim()
      const lower = keyword.toLowerCase()
      const numMatch = keyword.match(/^#?(\d+)$/)

      if (numMatch) {
        tasks = tasks.filter(t => t.number === Number.parseInt(numMatch[1], 10))
      }
      else {
        tasks = tasks.filter(t => t.name.toLowerCase().includes(lower))
      }
    }

    // Paginate locally
    const total = tasks.length
    const start = (page - 1) * pageSize
    const paged = tasks.slice(start, start + pageSize)

    return {
      items: paged.map(t => toRequirement(t)),
      total,
      page,
      pageSize,
    }
  }

  async listPendingWorkItems(): Promise<PendingWorkItemsResult> {
    return this.planning.listPendingWorkItems()
  }

  async getRequirementDecompositionContext(
    params: GetRequirementDecompositionContextParams,
  ): Promise<RequirementDecompositionContext> {
    return this.planning.getDecompositionContext(params)
  }

  async createRequirementDecomposition(
    params: CreateRequirementDecompositionParams,
  ): Promise<ApplyRequirementDecompositionResult> {
    return this.planning.createDecomposition(params)
  }

  async addManhour(params: AddManhourParams): Promise<AddManhourResult> {
    return this.taskWriter.addManhour(params)
  }

  async updateTaskPlanDates(params: UpdateTaskPlanDatesParams): Promise<UpdateTaskPlanDatesResult> {
    return this.taskWriter.updatePlanDates(params)
  }

  async getRelatedIssues(params: GetRelatedIssuesParams): Promise<RelatedIssue[]> {
    return this.issueReader.getRelatedIssues(params)
  }

  async getIssueDetail(params: GetIssueDetailParams): Promise<IssueDetail> {
    return this.issueReader.getIssueDetail(params)
  }

  async getTestcases(params: GetTestcasesParams): Promise<TestCaseResult> {
    return this.testcaseReader.get(params)
  }
}
