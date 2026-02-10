import type { SourceConfig } from '../types/config.js'
import type { Requirement, SearchResult, SourceType } from '../types/requirement.js'

import type { GetRequirementParams, SearchRequirementsParams } from './base.js'
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
  issueType?: { uuid: string, name: string }
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
        issueType { uuid name }
        status { uuid name category }
        priority { value }
        assign { uuid name }
        project { uuid name }
      }
    }
  }
`

// Query to find a task by its number
const TASK_BY_NUMBER_QUERY = SEARCH_TASKS_QUERY
const DEFAULT_STATUS_NOT_IN = ['FgMGkcaq', 'NvRwHBSo', 'Dn3k8ffK', 'TbmY2So5']

// ============ Helpers ============

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
        parts.push(`- #${related.number} ${related.name} [${related.issueType?.name}] (${related.status?.name})`)
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
        filterGroup: [
          {
            assign_in: ['${currentUser}'],
            status_notIn: DEFAULT_STATUS_NOT_IN,
          },
        ],
        search: null,
        pagination: { limit: pageSize * page, preciseCount: false },
        limit: 1000,
      },
      'group-task-data',
    )

    let tasks = data.data?.buckets?.flatMap(b => b.tasks ?? []) ?? []

    // Local keyword filter (matching ones-api.ts behavior)
    if (params.query) {
      const keyword = params.query
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
}
