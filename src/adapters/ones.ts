import type { SourceConfig } from '../types/config.js'
import type { IssueDetail, RelatedIssue, Requirement, SearchResult, SourceType, TestCase, TestCaseResult, TestCaseStep } from '../types/requirement.js'

import type { GetIssueDetailParams, GetRelatedIssuesParams, GetRequirementParams, GetTestcasesParams, SearchRequirementsParams } from './base.js'
import crypto from 'node:crypto'
import { mapOnesPriority, mapOnesStatus, mapOnesType } from '../utils/map-status.js'
import { BaseAdapter } from './base.js'

// ============ ONES GraphQL types ============

interface OnesTaskNode {
  key?: string
  uuid: string
  number: number
  name: string
  status: { uuid: string, name: string, category?: string }
  priority?: { value: string }
  issueType?: { uuid: string, name: string, detailType?: number }
  assign?: { uuid: string, name: string } | null
  owner?: { uuid: string, name: string } | null
  project?: { uuid: string, name: string }
  parent?: { uuid: string, number?: number, issueType?: { uuid: string, name: string } } | null
  relatedTasks?: OnesRelatedTask[]
  relatedWikiPages?: OnesWikiPage[]
  relatedWikiPagesCount?: number
  path?: string
}

interface OnesWikiPage {
  uuid: string
  title: string
  referenceType?: number
  subReferenceType?: string
  errorMessage?: string
}

interface OnesRelatedTask {
  uuid: string
  number: number
  name: string
  issueType: { uuid: string, name: string }
  status: { uuid: string, name: string, category?: string }
  assign?: { uuid: string, name: string } | null
}

interface OnesIssueTypeNode {
  uuid: string
  name: string
  detailType: number
}

interface OnesTeamUserNode {
  uuid?: string
  name?: string
  user?: {
    uuid?: string
    name?: string
  }
  org_user?: {
    org_user_uuid?: string
    name?: string
  }
  orgUser?: {
    uuid?: string
    name?: string
  }
  orgUserUuid?: string
  org_user_uuid?: string
}

interface OnesTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface OnesLoginResponse {
  sid: string
  auth_user_uuid: string
  org_users: Array<{
    region_uuid: string
    org_uuid: string
    org_user: { org_user_uuid: string, name: string }
    org: { org_uuid: string, name: string }
  }>
}

interface OnesSession {
  accessToken: string
  teamUuid: string
  orgUuid: string
  userUuid: string
  expiresAt: number
}

// ============ GraphQL queries ============

const TASK_DETAIL_QUERY = `
  query Task($key: Key) {
    task(key: $key) {
      key uuid number name
      issueType { uuid name }
      status { uuid name category }
      priority { value }
      assign { uuid name }
      owner { uuid name }
      project { uuid name }
      parent { uuid number issueType { uuid name } }
      relatedTasks {
        uuid number name
        issueType { uuid name }
        status { uuid name category }
        assign { uuid name }
      }
      relatedWikiPages {
        uuid
        title
        referenceType
        subReferenceType
        errorMessage
      }
      relatedWikiPagesCount
    }
  }
`

const SEARCH_TASKS_QUERY = `
  query GROUP_TASK_DATA($groupBy: GroupBy, $groupOrderBy: OrderBy, $orderBy: OrderBy, $filterGroup: [Filter!], $search: Search, $pagination: Pagination, $limit: Int) {
    buckets(groupBy: $groupBy, orderBy: $groupOrderBy, pagination: $pagination, filter: $search) {
      key
      tasks(filterGroup: $filterGroup, orderBy: $orderBy, limit: $limit, includeAncestors: { pathField: "path" }) {
        key uuid number name
        issueType { uuid name detailType }
        status { uuid name category }
        priority { value }
        assign { uuid name }
        project { uuid name }
      }
    }
  }
`

const ISSUE_TYPES_QUERY = `
  query IssueTypes($orderBy: OrderBy) {
    issueTypes(orderBy: $orderBy) {
      uuid
      name
      detailType
    }
  }
`

// Query to find a task by its number
const TASK_BY_NUMBER_QUERY = SEARCH_TASKS_QUERY
const RELATED_TASKS_QUERY = `
  query Task($key: Key) {
    task(key: $key) {
      key
      relatedTasks {
        key
        uuid
        name
        path
        deadline
        project { uuid name }
        priority { value }
        issueType {
          key uuid name detailType
        }
        subIssueType {
          key uuid name detailType
        }
        status {
          uuid name category
        }
        assign {
          uuid name
        }
        sprint {
          name uuid
        }
        statusCategory
      }
    }
  }
`

const ISSUE_DETAIL_QUERY = `
  query Task($key: Key) {
    task(key: $key) {
      key uuid
      description
      descriptionText
      desc_rich: description
      name
      issueType { key uuid name detailType }
      subIssueType { key uuid name detailType }
      status { uuid name category }
      priority { value }
      assign { uuid name }
      owner { uuid name }
      solver { uuid name }
      project { uuid name }
      severityLevel { value }
      deadline(unit: ONESDATE)
      sprint { name uuid }
    }
  }
`

const DEFAULT_STATUS_NOT_IN = ['FgMGkcaq', 'NvRwHBSo', 'Dn3k8ffK', 'TbmY2So5']

// ============ Testcase GraphQL queries ============

const TESTCASE_LIBRARY_LIST_QUERY = `
  query Q {
    testcaseLibraries {
      uuid name key
      testcaseCaseCount
    }
  }
`

const TESTCASE_MODULE_SEARCH_QUERY = `
  query Q($filter: Filter) {
    testcaseModules(filter: $filter) {
      uuid name key
      parent { uuid name }
    }
  }
`

const TESTCASE_LIST_PAGED_QUERY = `
  query PAGED_LIBRARY_TESTCASE_LIST($testCaseFilter: Filter, $pagination: Pagination) {
    buckets(groupBy: {testcaseCases: {}}, pagination: $pagination) {
      testcaseCases(filterGroup: $testCaseFilter, limit: 10000) {
        uuid name key id
        priority { uuid value }
        type { uuid value }
        assign { uuid name }
        testcaseModule { uuid }
      }
      key
      pageInfo { count totalCount hasNextPage endCursor }
    }
  }
`

const TESTCASE_DETAIL_QUERY = `
  query QUERY_TESTCASES_DETAIL($testCaseFilter: Filter, $stepFilter: Filter) {
    testcaseCases(filter: $testCaseFilter) {
      uuid name key id condition desc path
      assign { uuid name }
      priority { uuid value }
      type { uuid value }
      testcaseLibrary { uuid }
      testcaseModule { uuid }
      relatedTasks { uuid name number }
    }
    testcaseCaseSteps(filter: $stepFilter, orderBy: { index: ASC }) {
      key uuid
      testcaseCase { uuid }
      desc result index
    }
  }
`

// ============ Helpers ============

function _getTaskStatusPriority(task: Pick<OnesTaskNode, 'status'>): number {
  const category = task.status?.category
  const name = task.status?.name

  if (category === 'to_do')
    return 0

  if (category === 'in_progress' && name === '修复中')
    return 1

  return Number.POSITIVE_INFINITY
}

function _isCommonTaskIssueType(task: Pick<OnesTaskNode, 'issueType'>): boolean {
  const detailType = task.issueType?.detailType

  if (detailType === 2 || detailType === 3)
    return true

  return task.issueType?.name === '任务' || task.issueType?.name === '缺陷'
}

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

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function getSetCookies(response: Response): string[] {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] }
  if (headers.getSetCookie) {
    return headers.getSetCookie()
  }
  const raw = response.headers.get('set-cookie')
  return raw ? [raw] : []
}

function toRequirement(task: OnesTaskNode, description = ''): Requirement {
  return {
    id: task.uuid,
    source: 'ones',
    title: `#${task.number} ${task.name}`,
    description,
    status: mapOnesStatus(task.status?.category ?? 'to_do'),
    priority: mapOnesPriority(task.priority?.value ?? 'normal'),
    type: mapOnesType(task.issueType?.name ?? '任务'),
    labels: [],
    reporter: '',
    assignee: task.assign?.name ?? null,
    // ONES GraphQL does not return timestamps; these are fetch-time placeholders
    createdAt: '',
    updatedAt: '',
    dueDate: null,
    attachments: [],
    raw: task as unknown as Record<string, unknown>,
  }
}

// ============ ONES Adapter ============

export class OnesAdapter extends BaseAdapter {
  private session: OnesSession | null = null
  private issueTypesCache: OnesIssueTypeNode[] | null = null

  constructor(
    sourceType: SourceType,
    config: SourceConfig,
    resolvedAuth: Record<string, string>,
  ) {
    super(sourceType, config, resolvedAuth)
  }

  /**
   * ONES OAuth2 PKCE login flow.
   * Reference: D:\company code\ones\packages\core\src\auth.ts
   */
  private async login(): Promise<OnesSession> {
    if (this.session && Date.now() < this.session.expiresAt) {
      return this.session
    }

    const baseUrl = this.config.apiBase
    const email = this.resolvedAuth.email
    const password = this.resolvedAuth.password

    if (!email || !password) {
      throw new Error('ONES auth requires email and password (ones-pkce auth type)')
    }

    // 1. Get encryption certificate
    const certRes = await fetch(`${baseUrl}/identity/api/encryption_cert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!certRes.ok) {
      throw new Error(`ONES: Failed to get encryption cert: ${certRes.status}`)
    }
    const cert = (await certRes.json()) as { public_key: string }

    // 2. Encrypt password with RSA public key
    const encrypted = crypto.publicEncrypt(
      { key: cert.public_key, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(password, 'utf-8'),
    )
    const encryptedPassword = encrypted.toString('base64')

    // 3. Login
    const loginRes = await fetch(`${baseUrl}/identity/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: encryptedPassword }),
    })
    if (!loginRes.ok) {
      const text = await loginRes.text().catch(() => '')
      throw new Error(`ONES: Login failed: ${loginRes.status} ${text}`)
    }

    const cookies = getSetCookies(loginRes)
      .map(cookie => cookie.split(';')[0])
      .join('; ')
    const loginData = (await loginRes.json()) as OnesLoginResponse

    // Pick org user (first one, or match by config option)
    const orgUuid = this.config.options?.orgUuid as string | undefined
    let orgUser = loginData.org_users[0]
    if (orgUuid) {
      const match = loginData.org_users.find(u => u.org_uuid === orgUuid)
      if (match)
        orgUser = match
    }

    // 4. PKCE: generate code verifier + challenge
    const codeVerifier = base64Url(crypto.randomBytes(32))
    const codeChallenge = base64Url(
      crypto.createHash('sha256').update(codeVerifier).digest(),
    )

    // 5. Authorize
    const authorizeParams = new URLSearchParams({
      client_id: 'ones.v1',
      scope: `openid offline_access ones:org:${orgUser.region_uuid}:${orgUser.org_uuid}:${orgUser.org_user.org_user_uuid}`,
      response_type: 'code',
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: `${baseUrl}/auth/authorize/callback`,
      state: `org_uuid=${orgUser.org_uuid}`,
    })

    const authorizeRes = await fetch(`${baseUrl}/identity/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
      },
      body: authorizeParams.toString(),
      redirect: 'manual',
    })

    const authorizeLocation = authorizeRes.headers.get('location')
    if (!authorizeLocation) {
      throw new Error('ONES: Authorize response missing location header')
    }
    const authRequestId = new URL(authorizeLocation).searchParams.get('id')
    if (!authRequestId) {
      throw new Error('ONES: Cannot parse auth_request_id from authorize redirect')
    }

    // 6. Finalize auth request
    const finalizeRes = await fetch(`${baseUrl}/identity/api/auth_request/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Cookie': cookies,
      },
      body: JSON.stringify({
        auth_request_id: authRequestId,
        region_uuid: orgUser.region_uuid,
        org_uuid: orgUser.org_uuid,
        org_user_uuid: orgUser.org_user.org_user_uuid,
      }),
    })
    if (!finalizeRes.ok) {
      const text = await finalizeRes.text().catch(() => '')
      throw new Error(`ONES: Finalize failed: ${finalizeRes.status} ${text}`)
    }

    // 7. Callback to get authorization code
    const callbackRes = await fetch(
      `${baseUrl}/identity/authorize/callback?id=${authRequestId}&lang=zh`,
      {
        method: 'GET',
        headers: { Cookie: cookies },
        redirect: 'manual',
      },
    )

    const callbackLocation = callbackRes.headers.get('location')
    if (!callbackLocation) {
      throw new Error('ONES: Callback response missing location header')
    }
    const code = new URL(callbackLocation).searchParams.get('code')
    if (!code) {
      throw new Error('ONES: Cannot parse authorization code from callback redirect')
    }

    // 8. Exchange code for token
    const tokenRes = await fetch(`${baseUrl}/identity/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'ones.v1',
        code,
        code_verifier: codeVerifier,
        redirect_uri: `${baseUrl}/auth/authorize/callback`,
      }).toString(),
    })
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => '')
      throw new Error(`ONES: Token exchange failed: ${tokenRes.status} ${text}`)
    }

    const token = (await tokenRes.json()) as OnesTokenResponse

    // 9. Get teams to find teamUuid
    const teamsRes = await fetch(
      `${baseUrl}/project/api/project/organization/${orgUser.org_uuid}/stamps/data?t=org_my_team`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json;charset=UTF-8',
        },
        body: JSON.stringify({ org_my_team: 0 }),
      },
    )
    if (!teamsRes.ok) {
      throw new Error(`ONES: Failed to fetch teams: ${teamsRes.status}`)
    }

    const teamsData = (await teamsRes.json()) as {
      org_my_team?: { teams?: Array<{ uuid: string, name: string }> }
    }
    const teams = teamsData.org_my_team?.teams ?? []

    // Pick team by config option or default to first
    const configTeamUuid = this.config.options?.teamUuid as string | undefined
    let teamUuid = teams[0]?.uuid
    if (configTeamUuid) {
      const match = teams.find(t => t.uuid === configTeamUuid)
      if (match)
        teamUuid = match.uuid
    }

    if (!teamUuid) {
      throw new Error('ONES: No teams found for this user')
    }

    this.session = {
      accessToken: token.access_token,
      teamUuid,
      orgUuid: orgUser.org_uuid,
      userUuid: orgUser.org_user.org_user_uuid,
      expiresAt: Date.now() + (token.expires_in - 60) * 1000, // refresh 60s early
    }

    return this.session
  }

  /**
   * Execute a GraphQL query against ONES project API.
   */
  private async graphql<T>(query: string, variables: Record<string, unknown>, tag?: string): Promise<T> {
    const session = await this.login()
    const url = `${this.config.apiBase}/project/api/project/team/${session.teamUuid}/items/graphql${tag ? `?t=${encodeURIComponent(tag)}` : ''}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`ONES GraphQL error: ${response.status} ${text}`)
    }

    return response.json() as Promise<T>
  }

  private async fetchIssueTypes(): Promise<OnesIssueTypeNode[]> {
    if (this.issueTypesCache)
      return this.issueTypesCache

    const data = await this.graphql<{ data?: { issueTypes?: OnesIssueTypeNode[] } }>(
      ISSUE_TYPES_QUERY,
      { orderBy: { namePinyin: 'ASC' } },
      'issueTypes',
    )

    this.issueTypesCache = data.data?.issueTypes ?? []
    return this.issueTypesCache
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

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`ONES user search error: ${response.status} ${text}`)
    }

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
    const url = `${this.config.apiBase}/project/api/project/team/${session.teamUuid}/task/${taskUuid}/info`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })

    if (!response.ok) {
      return {}
    }

    return response.json() as Promise<Record<string, unknown>>
  }

  /**
   * Resolve a fresh signed URL for an attachment resource via ONES attachment API.
   * Endpoint: /project/api/project/team/{teamUuid}/res/attachment/{resourceUuid}
   * Returns a redirect URL with a fresh OSS signature.
   */
  private async getAttachmentUrl(resourceUuid: string): Promise<string | null> {
    const session = await this.login()
    const url = `${this.config.apiBase}/project/api/project/team/${session.teamUuid}/res/attachment/${resourceUuid}?op=${encodeURIComponent('imageMogr2/auto-orient')}`

    try {
      // First try with redirect: 'manual' to capture 302 Location header
      const manualRes = await fetch(url, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        redirect: 'manual',
      })

      if (manualRes.status === 302 || manualRes.status === 301) {
        const location = manualRes.headers.get('location')
        if (location)
          return location
      }

      // Fallback: follow redirects and use the final URL
      const followRes = await fetch(url, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        redirect: 'follow',
      })

      // If redirected, response.url will be the final signed URL
      if (followRes.url && followRes.url !== url) {
        return followRes.url
      }

      if (followRes.ok) {
        const text = await followRes.text()
        if (text.startsWith('http')) {
          return text.trim()
        }
        try {
          const data = JSON.parse(text) as { url?: string }
          return data.url ?? null
        }
        catch {
          return null
        }
      }

      console.error(`[getAttachmentUrl] Failed for resource ${resourceUuid}: status ${followRes.status}`)
      return null
    }
    catch (err) {
      console.error(`[getAttachmentUrl] Error for resource ${resourceUuid}:`, err)
      return null
    }
  }

  /**
   * Replace stale image URLs in HTML with fresh signed URLs from the attachment API.
   * Extracts data-uuid from <img> tags and resolves fresh URLs in parallel.
   */
  private async refreshImageUrls(html: string): Promise<string> {
    if (!html)
      return html

    // Extract all img tags with data-uuid
    const imgRegex = /<img\s[^>]*data-uuid="([^"]+)"[^>]*>/g
    const matches = Array.from(html.matchAll(imgRegex))

    if (matches.length === 0)
      return html

    // Resolve fresh URLs in parallel
    const replacements = await Promise.all(
      matches.map(async (match) => {
        const dataUuid = match[1]
        const freshUrl = await this.getAttachmentUrl(dataUuid)
        return { fullMatch: match[0], dataUuid, freshUrl }
      }),
    )

    let result = html
    for (const { fullMatch, freshUrl } of replacements) {
      if (freshUrl) {
        // Replace the src attribute in the img tag with the fresh URL
        const updatedImg = fullMatch.replace(/src="[^"]*"/, `src="${freshUrl}"`)
        result = result.replace(fullMatch, updatedImg)
      }
    }

    return result
  }

  /**
   * Fetch wiki page content via REST API.
   * Endpoint: /wiki/api/wiki/team/{teamUuid}/online_page/{wikiUuid}/content
   */
  private async fetchWikiContent(wikiUuid: string): Promise<string> {
    const session = await this.login()
    const url = `${this.config.apiBase}/wiki/api/wiki/team/${session.teamUuid}/online_page/${wikiUuid}/content`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })

    if (!response.ok) {
      return ''
    }

    const data = await response.json() as { content?: string }
    return data.content ?? ''
  }

  /**
   * Fetch a single task by UUID or number (e.g. "#95945" or "95945").
   * If a number is given, searches first to resolve the UUID.
   */
  async getRequirement(params: GetRequirementParams): Promise<Requirement> {
    let taskUuid = params.id

    // If the ID looks like a number (with or without #), search to find the UUID
    const numMatch = taskUuid.match(/^#?(\d+)$/)
    if (numMatch) {
      const taskNumber = Number.parseInt(numMatch[1], 10)
      const searchData = await this.graphql<{
        data?: { buckets?: Array<{ tasks?: OnesTaskNode[] }> }
      }>(
        TASK_BY_NUMBER_QUERY,
        {
          groupBy: { tasks: {} },
          groupOrderBy: null,
          orderBy: { createTime: 'DESC' },
          filterGroup: [{ number_in: [taskNumber] }],
          search: null,
          pagination: { limit: 10, preciseCount: false },
          limit: 10,
        },
        'group-task-data',
      )

      const allTasks = searchData.data?.buckets?.flatMap(b => b.tasks ?? []) ?? []
      const found = allTasks.find(t => t.number === taskNumber)

      if (!found) {
        throw new Error(`ONES: Task #${taskNumber} not found in current team`)
      }
      taskUuid = found.uuid
    }

    // Fetch GraphQL data (structure, relations, wiki pages)
    const graphqlData = await this.graphql<{ data?: { task?: OnesTaskNode } }>(
      TASK_DETAIL_QUERY,
      { key: `task-${taskUuid}` },
      'Task',
    )

    const task = graphqlData.data?.task
    if (!task) {
      throw new Error(`ONES: Task "${taskUuid}" not found`)
    }

    // Fetch wiki page content for related requirement docs (in parallel)
    const wikiPages = task.relatedWikiPages ?? []
    const wikiContents = await Promise.all(
      wikiPages
        .filter(w => !w.errorMessage)
        .map(async (wiki) => {
          const content = await this.fetchWikiContent(wiki.uuid)
          return { title: wiki.title, uuid: wiki.uuid, content }
        }),
    )

    // Build description: task info + wiki requirement docs
    const parts: string[] = []

    // Task basic info
    parts.push(`# #${task.number} ${task.name}`)
    parts.push('')
    parts.push(`- **Type**: ${task.issueType?.name ?? 'Unknown'}`)
    parts.push(`- **Status**: ${task.status?.name ?? 'Unknown'}`)
    parts.push(`- **Assignee**: ${task.assign?.name ?? 'Unassigned'}`)
    if (task.owner?.name) {
      parts.push(`- **Owner**: ${task.owner.name}`)
    }
    if (task.project?.name) {
      parts.push(`- **Project**: ${task.project.name}`)
    }
    parts.push(`- **UUID**: ${task.uuid}`)

    // Related tasks
    if (task.relatedTasks?.length) {
      parts.push('')
      parts.push('## Related Tasks')
      for (const related of task.relatedTasks) {
        const assignee = related.assign?.name ?? 'Unassigned'
        parts.push(`- #${related.number} ${related.name} [${related.issueType?.name}] (${related.status?.name}) — ${assignee}`)
      }
    }

    // Parent task
    if (task.parent?.uuid) {
      parts.push('')
      parts.push('## Parent Task')
      parts.push(`- UUID: ${task.parent.uuid}`)
      if (task.parent.number) {
        parts.push(`- Number: #${task.parent.number}`)
      }
    }

    // Wiki requirement documents (the core requirement content)
    if (wikiContents.length > 0) {
      parts.push('')
      parts.push('---')
      parts.push('')
      parts.push('## Requirement Documents')
      for (const wiki of wikiContents) {
        parts.push('')
        parts.push(`### ${wiki.title}`)
        parts.push('')
        if (wiki.content) {
          parts.push(wiki.content)
        }
        else {
          parts.push('(No content available)')
        }
      }
    }

    const req = toRequirement(task, parts.join('\n'))

    return req
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

    let bugTypeUuids: string[] = []
    let taskTypeUuids: string[] = []

    if (intent === 'all_bugs' || intent === 'all_tasks') {
      const issueTypes = await this.fetchIssueTypes()
      bugTypeUuids = issueTypes.filter(item => item.detailType === 3).map(item => item.uuid)
      taskTypeUuids = issueTypes.filter(item => item.detailType === 2).map(item => item.uuid)
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

    if (intent === 'all_bugs')
      filter.issueType_in = bugTypeUuids

    if (intent === 'all_tasks')
      filter.issueType_in = taskTypeUuids

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
        pagination: { limit: pageSize * page, preciseCount: false },
        limit: 1000,
      },
      'group-task-data',
    )

    let tasks = data.data?.buckets?.flatMap(b => b.tasks ?? []) ?? []

    if (intent === 'all_bugs') {
      tasks = tasks
        .filter(task => task.issueType?.uuid ? bugTypeUuids.includes(task.issueType.uuid) : false)
        .filter(task => isOpenOrInProgressBug(task))
        .sort((a, b) => getBugStatusPriority(a) - getBugStatusPriority(b))
    }

    if (intent === 'all_tasks') {
      // detailType = 1 的需求不属于“我的任务”列表入口。
      // 需求详情查询继续走 getRequirement(id/number)，因为需求通常由产品负责人维护，
      // 当前登录用户不一定能通过 assign_in: ['${currentUser}'] 查到需求项。
      tasks = tasks.filter(task => task.issueType?.uuid ? taskTypeUuids.includes(task.issueType.uuid) : false)
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

  async getRelatedIssues(params: GetRelatedIssuesParams): Promise<RelatedIssue[]> {
    const session = await this.login()

    const taskKey = params.taskId.startsWith('task-')
      ? params.taskId
      : `task-${params.taskId}`

    const data = await this.graphql<{
      data?: {
        task?: {
          key: string
          relatedTasks: Array<{
            key: string
            uuid: string
            name: string
            issueType: { key: string, uuid: string, name: string, detailType: number }
            subIssueType?: { key: string, uuid: string, name: string, detailType: number } | null
            status: { uuid: string, name: string, category: string }
            assign?: { uuid: string, name: string } | null
            priority?: { value: string } | null
            project?: { uuid: string, name: string } | null
          }>
        }
      }
    }>(RELATED_TASKS_QUERY, { key: taskKey }, 'Task')

    const relatedTasks = data.data?.task?.relatedTasks ?? []

    // Filter: detailType === 3 (defect) + status.category === "to_do" (pending)
    // Returns ALL pending defects, not just current user's
    const filtered = relatedTasks.filter((t) => {
      const isDefect = t.issueType?.detailType === 3
        || t.subIssueType?.detailType === 3
      const isTodo = t.status?.category === 'to_do'
      return isDefect && isTodo
    })

    // Sort: current user's defects first
    const currentUserUuid = session.userUuid
    filtered.sort((a, b) => {
      const aIsCurrent = a.assign?.uuid === currentUserUuid ? 0 : 1
      const bIsCurrent = b.assign?.uuid === currentUserUuid ? 0 : 1
      return aIsCurrent - bIsCurrent
    })

    return filtered.map(t => ({
      key: t.key,
      uuid: t.uuid,
      name: t.name,
      issueTypeName: t.issueType?.name ?? 'Unknown',
      statusName: t.status?.name ?? 'Unknown',
      statusCategory: t.status?.category ?? 'unknown',
      assignName: t.assign?.name ?? null,
      assignUuid: t.assign?.uuid ?? null,
      priorityValue: t.priority?.value ?? null,
      projectName: t.project?.name ?? null,
    }))
  }

  async getIssueDetail(params: GetIssueDetailParams): Promise<IssueDetail> {
    let issueKey: string

    // Support number lookup (e.g. "98086" or "#98086")
    const numMatch = params.issueId.match(/^#?(\d+)$/)
    if (numMatch) {
      const taskNumber = Number.parseInt(numMatch[1], 10)
      const searchData = await this.graphql<{
        data?: { buckets?: Array<{ tasks?: Array<{ uuid: string, number: number }> }> }
      }>(
        SEARCH_TASKS_QUERY,
        {
          groupBy: { tasks: {} },
          groupOrderBy: null,
          orderBy: { createTime: 'DESC' },
          filterGroup: [{ number_in: [taskNumber] }],
          search: null,
          pagination: { limit: 10, preciseCount: false },
          limit: 10,
        },
        'group-task-data',
      )

      const allTasks = searchData.data?.buckets?.flatMap(b => b.tasks ?? []) ?? []
      const found = allTasks.find(t => t.number === taskNumber)
      if (!found) {
        throw new Error(`ONES: Issue #${taskNumber} not found in current team`)
      }
      issueKey = `task-${found.uuid}`
    }
    else {
      issueKey = params.issueId.startsWith('task-')
        ? params.issueId
        : `task-${params.issueId}`
    }

    const data = await this.graphql<{
      data?: {
        task?: {
          key: string
          uuid: string
          name: string
          description: string
          descriptionText: string
          desc_rich: string
          issueType: { name: string }
          status: { name: string, category: string }
          priority?: { value: string } | null
          assign?: { uuid: string, name: string } | null
          owner?: { uuid: string, name: string } | null
          solver?: { uuid: string, name: string } | null
          project?: { uuid: string, name: string } | null
          severityLevel?: { value: string } | null
          deadline?: string | null
          sprint?: { name: string } | null
        }
      }
    }>(ISSUE_DETAIL_QUERY, { key: issueKey }, 'Task')

    const task = data.data?.task
    if (!task) {
      throw new Error(`ONES: Issue "${issueKey}" not found`)
    }

    // Fetch fresh description via REST API
    const taskInfo = await this.fetchTaskInfo(task.uuid)
    const rawDescription = (taskInfo.desc as string) ?? task.description ?? ''
    const rawDescRich = (taskInfo.desc_rich as string) ?? task.desc_rich ?? ''

    // Refresh image URLs via attachment API (signed URLs expire after 1 hour)
    const freshDescription = await this.refreshImageUrls(rawDescription)
    const freshDescRich = await this.refreshImageUrls(rawDescRich)

    return {
      key: task.key,
      uuid: task.uuid,
      name: task.name,
      description: freshDescription,
      descriptionRich: freshDescRich,
      descriptionText: task.descriptionText ?? '',
      issueTypeName: task.issueType?.name ?? 'Unknown',
      statusName: task.status?.name ?? 'Unknown',
      statusCategory: task.status?.category ?? 'unknown',
      assignName: task.assign?.name ?? null,
      ownerName: task.owner?.name ?? null,
      solverName: task.solver?.name ?? null,
      priorityValue: task.priority?.value ?? null,
      severityLevel: task.severityLevel?.value ?? null,
      projectName: task.project?.name ?? null,
      deadline: task.deadline ?? null,
      sprintName: task.sprint?.name ?? null,
      raw: task as unknown as Record<string, unknown>,
    }
  }

  async getTestcases(params: GetTestcasesParams): Promise<TestCaseResult> {
    let libraryUuid = params.libraryUuid
      ?? (this.config.options?.testcaseLibraryUuid as string)

    // Auto-fetch library UUID if not configured
    if (!libraryUuid) {
      const libData = await this.graphql<{
        data?: { testcaseLibraries?: Array<{ uuid: string, name: string, testcaseCaseCount: number }> }
      }>(TESTCASE_LIBRARY_LIST_QUERY, {}, 'library-select')

      const libs = libData.data?.testcaseLibraries ?? []
      if (libs.length === 0) {
        throw new Error('ONES: No testcase libraries found for this team')
      }
      // Pick the library with the most cases (most likely the main one)
      libs.sort((a, b) => b.testcaseCaseCount - a.testcaseCaseCount)
      libraryUuid = libs[0].uuid
    }

    // Step 1: Search task by number to get task name
    const searchData = await this.graphql<{
      data?: { buckets?: Array<{ tasks?: Array<{ uuid: string, number: number, name: string }> }> }
    }>(
      SEARCH_TASKS_QUERY,
      {
        groupBy: { tasks: {} },
        groupOrderBy: null,
        orderBy: { createTime: 'DESC' },
        filterGroup: [{ number_in: [params.taskNumber] }],
        search: null,
        pagination: { limit: 10, preciseCount: false },
        limit: 10,
      },
      'group-task-data',
    )

    const allTasks = searchData.data?.buckets?.flatMap(b => b.tasks ?? []) ?? []
    const task = allTasks.find(t => t.number === params.taskNumber)
    if (!task) {
      throw new Error(`ONES: Task #${params.taskNumber} not found`)
    }

    // Step 2: Search testcase module by task number pattern (e.g. "#302")
    const moduleData = await this.graphql<{
      data?: { testcaseModules?: Array<{ uuid: string, name: string }> }
    }>(
      TESTCASE_MODULE_SEARCH_QUERY,
      { filter: { testcaseLibrary_in: [libraryUuid], name_match: `#${params.taskNumber}` } },
      'find-testcase-module',
    )

    const modules = moduleData.data?.testcaseModules ?? []
    if (modules.length === 0) {
      throw new Error(`ONES: No testcase module matching "#${params.taskNumber}" in library ${libraryUuid}`)
    }
    const mod = modules[0]

    // Step 3: List ALL testcases under this module (paginated)
    const caseList: Array<{ uuid: string, id: string, name: string }> = []
    let cursor = ''
    let totalCount = 0

    while (true) {
      const listData = await this.graphql<{
        data?: {
          buckets?: Array<{
            pageInfo: { totalCount: number, hasNextPage: boolean, endCursor: string }
            testcaseCases: Array<{ uuid: string, id: string, name: string }>
          }>
        }
      }>(
        TESTCASE_LIST_PAGED_QUERY,
        {
          testCaseFilter: [{ testcaseLibrary_in: [libraryUuid], path_match: mod.uuid }],
          pagination: { limit: 50, after: cursor, preciseCount: true },
        },
        'testcase-list-paged',
      )

      const bucket = listData.data?.buckets?.[0]
      if (!bucket)
        break

      caseList.push(...(bucket.testcaseCases ?? []))
      totalCount = bucket.pageInfo.totalCount

      if (!bucket.pageInfo.hasNextPage)
        break
      cursor = bucket.pageInfo.endCursor
    }

    if (caseList.length === 0) {
      return { taskNumber: params.taskNumber, taskName: task.name, moduleName: mod.name, moduleUuid: mod.uuid, totalCount: 0, cases: [] }
    }

    // Step 4: Fetch details + steps in batches of 20
    const allCases: TestCase[] = []
    const BATCH_SIZE = 20
    for (let i = 0; i < caseList.length; i += BATCH_SIZE) {
      const batch = caseList.slice(i, i + BATCH_SIZE)
      const uuids = batch.map(c => c.uuid)

      const detailData = await this.graphql<{
        data?: {
          testcaseCases: Array<{
            uuid: string
            id: string
            name: string
            condition: string
            desc: string
            path: string
            assign?: { name: string } | null
            priority?: { value: string } | null
            type?: { value: string } | null
          }>
          testcaseCaseSteps: Array<{
            uuid: string
            desc: string
            result: string
            index: number
            testcaseCase: { uuid: string }
          }>
        }
      }>(
        TESTCASE_DETAIL_QUERY,
        { testCaseFilter: { uuid_in: [...uuids, null] }, stepFilter: { testcaseCase_in: uuids } },
        'library-testcase-detail',
      )

      const cases = detailData.data?.testcaseCases ?? []
      const steps = detailData.data?.testcaseCaseSteps ?? []

      const stepsByCase = new Map<string, TestCaseStep[]>()
      for (const step of steps) {
        const caseUuid = step.testcaseCase.uuid
        if (!stepsByCase.has(caseUuid))
          stepsByCase.set(caseUuid, [])
        stepsByCase.get(caseUuid)!.push({ uuid: step.uuid, index: step.index, desc: step.desc ?? '', result: step.result ?? '' })
      }

      for (const c of cases) {
        // Refresh stale image URLs in desc (ONES returns placeholder base64 for lazy-loaded images)
        const freshDesc = c.desc ? await this.refreshImageUrls(c.desc) : ''

        allCases.push({
          uuid: c.uuid,
          id: c.id,
          name: c.name,
          priority: c.priority?.value ?? 'N/A',
          type: c.type?.value ?? 'Unknown',
          assignName: c.assign?.name ?? null,
          condition: c.condition ?? '',
          desc: freshDesc,
          steps: (stepsByCase.get(c.uuid) ?? []).sort((a, b) => a.index - b.index),
          modulePath: c.path ?? '',
        })
      }
    }

    return { taskNumber: params.taskNumber, taskName: task.name, moduleName: mod.name, moduleUuid: mod.uuid, totalCount, cases: allCases }
  }
}
