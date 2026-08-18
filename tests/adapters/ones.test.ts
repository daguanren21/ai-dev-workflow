import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnesAdapter } from '../../src/adapters/ones'
import onesFixture from '../fixtures/ones-response.json'

// Mock global fetch for ONES PKCE flow + GraphQL calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock crypto for deterministic PKCE values
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    default: {
      publicEncrypt: vi.fn(() => Buffer.from('encrypted-password')),
      randomBytes: vi.fn(() => Buffer.from('a'.repeat(32))),
      createHash: vi.fn(() => ({
        update: vi.fn(() => ({
          digest: vi.fn(() => Buffer.from('challenge-hash')),
        })),
      })),
      constants: { RSA_PKCS1_PADDING: 1 },
    },
  }
})

function mockLoginFlow(options: { authorizeLocation?: string, directCode?: boolean } = {}) {
  // 1. encryption_cert
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ public_key: '-----BEGIN PUBLIC KEY-----\nMOCK\n-----END PUBLIC KEY-----' }),
  })
  // 2. login
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      sid: 'test-sid',
      auth_user_uuid: 'auth-user-1',
      org_users: [{
        region_uuid: 'region-1',
        org_uuid: 'org-1',
        org_user: { org_user_uuid: 'current-user-uuid', name: 'Test User' },
        org: { org_uuid: 'org-1', name: 'Test Org' },
      }],
    }),
    headers: new Headers(),
  })
  // 3. authorize (302 redirect)
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 302,
    headers: new Headers({ location: options.authorizeLocation ?? 'https://ones.test/login?id=auth-req-1' }),
  })
  if (!options.directCode) {
    // 4. finalize
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') })
    // 5. callback (302 redirect with code)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: new Headers({ location: 'https://ones.test/callback?code=auth-code-1' }),
    })
  }
  // 6. token exchange
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      access_token: 'test-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    }),
  })
  // 7. fetch teams
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      org_my_team: {
        teams: [{ uuid: 'team-1', name: 'Default Team' }],
      },
    }),
  })
}

function makeRequirementTask(overrides: Record<string, unknown> = {}) {
  return {
    key: 'task-abc-123-def',
    uuid: 'abc-123-def',
    number: 1001,
    name: '实现用户认证模块',
    issueType: { uuid: 'it-requirement', name: '需求' },
    status: { uuid: 's1', name: '进行中', category: 'in_progress' },
    priority: { value: 'high' },
    assign: { uuid: 'u1', name: '虚拟用户丙' },
    owner: { uuid: 'owner-1', name: '虚拟用户甲' },
    project: { uuid: 'p1', name: 'MockProject' },
    parent: null,
    relatedTasks: [],
    relatedWikiPages: [],
    relatedWikiPagesCount: 0,
    ...overrides,
  }
}

function mockTaskResponse(task: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data: { task } }),
  })
}

function mockRelatedActivitiesResponse(relatedActivities: Record<string, unknown>[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      data: {
        task: {
          key: 'task-related-demo-uuid',
          relatedActivities,
          relatedActivitiesCount: relatedActivities.length,
        },
      },
    }),
  })
}

function mockWikiContent(content: string, overrides: Record<string, unknown> = {}) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ content, ...overrides }),
  })
}

function mockWikiPageDetail(detail: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(detail),
  })
}

function mockProjectList(identifier = 'DEMO', uuid = 'project-demo-uuid') {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      data: {
        buckets: [{
          key: 'bucket.0.__all',
          projects: [{
            key: `project-${uuid}`,
            uuid,
            name: 'Anonymous Project',
            identifier,
          }],
        }],
      },
    }),
  })
}

function mockTaskSearch(tasks: Record<string, unknown>[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      data: {
        buckets: [{
          key: 'default',
          tasks,
        }],
      },
    }),
  })
}

function mockRestTaskSearch(tasks: Record<string, unknown>[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      total: tasks.length,
      datas: {
        task: tasks.map(fields => ({ fields })),
      },
    }),
  })
}

describe('onesAdapter', () => {
  let adapter: OnesAdapter

  beforeEach(() => {
    mockFetch.mockReset()
    vi.clearAllMocks()
    adapter = new OnesAdapter(
      'ones',
      {
        enabled: true,
        apiBase: 'https://ones.test',
        auth: { type: 'ones-pkce', emailEnv: 'ONES_ACCOUNT', passwordEnv: 'ONES_PASSWORD' },
      },
      { email: 'test@example.com', password: 'test-pass' },
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getRequirement', () => {
    it('should parse auth_request_id from authorize redirect', async () => {
      mockLoginFlow({ authorizeLocation: 'https://ones.test/login?auth_request_id=auth-req-new' })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture),
      })

      await adapter.getRequirement({ id: 'abc-123-def' })

      const finalizeCall = mockFetch.mock.calls[3]
      const finalizeBody = JSON.parse(String(finalizeCall[1].body))
      expect(finalizeBody.auth_request_id).toBe('auth-req-new')
    })

    it('should exchange authorization code when authorize redirects directly to callback', async () => {
      mockLoginFlow({
        authorizeLocation: 'https://ones.test/auth/authorize/callback?code=direct-auth-code&state=org_uuid%3Dorg-1',
        directCode: true,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture),
      })

      await adapter.getRequirement({ id: 'abc-123-def' })

      const finalizeCall = mockFetch.mock.calls.find(call => String(call[0]).includes('/identity/api/auth_request/finalize'))
      expect(finalizeCall).toBeUndefined()

      const tokenCall = mockFetch.mock.calls.find(call => String(call[0]).includes('/identity/oauth/token'))
      expect(tokenCall).toBeDefined()
      const tokenBody = new URLSearchParams(String(tokenCall?.[1].body))
      expect(tokenBody.get('code')).toBe('direct-auth-code')
    })

    it('should login via PKCE and fetch task via GraphQL', async () => {
      mockLoginFlow()
      // 8. GraphQL task detail response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture),
      })

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.id).toBe('abc-123-def')
      expect(result.source).toBe('ones')
      expect(result.title).toBe('#1001 实现用户认证模块')
      expect(result.status).toBe('in_progress')
      expect(result.priority).toBe('high')
      expect(result.type).toBe('feature') // 需求 -> feature
      expect(result.assignee).toBe('虚拟用户丙')

      // Verify GraphQL call used correct endpoint
      const graphqlCall = mockFetch.mock.calls[7]
      expect(graphqlCall[0]).toContain('/project/api/project/team/team-1/items/graphql')
      expect(graphqlCall[1].headers.Authorization).toBe('Bearer test-access-token')
    })

    it('should resolve a display id to the matching project task', async () => {
      mockLoginFlow()
      mockProjectList('DEMO', 'project-demo-uuid')
      mockTaskSearch([
        {
          key: 'task-display-demo-uuid',
          uuid: 'display-demo-uuid',
          number: 1001,
          name: '匿名需求',
          issueType: { uuid: 'it-requirement', name: '需求' },
          status: { uuid: 's1', name: '进行中', category: 'in_progress' },
          project: { uuid: 'project-demo-uuid', name: 'Anonymous Project' },
        },
      ])
      mockTaskResponse(makeRequirementTask({
        key: 'task-display-demo-uuid',
        uuid: 'display-demo-uuid',
        number: 1001,
        name: '匿名需求',
        project: { uuid: 'project-demo-uuid', name: 'Anonymous Project' },
      }))
      mockRelatedActivitiesResponse([])

      const result = await adapter.getRequirement({ id: 'DEMO-1001' })

      expect(result.id).toBe('display-demo-uuid')
      expect(result.title).toBe('#1001 匿名需求')

      const graphQlCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('/items/graphql'))
      const searchCallBody = JSON.parse(String(graphQlCalls[1][1].body))
      expect(searchCallBody.variables.filterGroup).toEqual([
        { number_in: [1001], project_in: ['project-demo-uuid'] },
      ])
    })

    it('should fallback to REST search when numeric task is not returned by GraphQL', async () => {
      mockLoginFlow()
      mockTaskSearch([])
      mockRestTaskSearch([
        {
          uuid: 'rest-task-uuid',
          number: 2001,
          summary: '匿名任务',
          display_id: 'DEMO-2001',
          issue_type_name: '任务',
          project_uuid: 'project-demo-uuid',
          project_name: 'Anonymous Project',
        },
      ])
      mockTaskResponse(makeRequirementTask({
        key: 'task-rest-task-uuid',
        uuid: 'rest-task-uuid',
        number: 2001,
        name: '匿名任务',
        issueType: { uuid: 'it-task', name: '任务' },
        project: { uuid: 'project-demo-uuid', name: 'Anonymous Project' },
      }))

      const result = await adapter.getRequirement({ id: '2001' })

      expect(result.id).toBe('rest-task-uuid')
      expect(result.title).toBe('#2001 匿名任务')

      const restSearchCall = mockFetch.mock.calls.find(call => String(call[0]).includes('/search?q=2001'))
      expect(restSearchCall?.[0]).toBe('https://ones.test/project/api/project/team/team-1/search?q=2001&start=0&limit=10&types=task')
      expect(restSearchCall?.[1]).toMatchObject({
        headers: { Authorization: 'Bearer test-access-token' },
      })
    })

    it('should include related tasks in description', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture),
      })

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.description).toContain('Related Tasks')
      expect(result.description).toContain('#1002 前端页面开发')
      expect(result.description).toContain('虚拟用户丁')
    })

    it('should fetch related work items through onesql with the resolved requirement id', async () => {
      mockLoginFlow()
      mockProjectList('DEMO', 'project-demo-uuid')
      mockTaskSearch([
        {
          key: 'task-related-demo-uuid',
          uuid: 'related-demo-uuid',
          number: 2002,
          name: '匿名需求',
          issueType: { uuid: 'it-requirement', name: '需求' },
          status: { uuid: 's1', name: '开发已分派', category: 'in_progress' },
          project: { uuid: 'project-demo-uuid', name: 'Anonymous Project' },
        },
      ])
      mockTaskResponse(makeRequirementTask({
        key: 'task-related-demo-uuid',
        uuid: 'related-demo-uuid',
        number: 2002,
        name: '匿名需求',
        project: { uuid: 'project-demo-uuid', name: 'Anonymous Project' },
      }))
      mockRelatedActivitiesResponse([
        {
          uuid: 'activity-config-migration',
          name: 'DEMO-2002 配置迁移',
          projectUUID: 'ppm-project-uuid',
          project_uuid: 'ppm-project-uuid',
          relatedChild: 'related-child-uuid',
          related_child_uuid: 'related-child-uuid',
        },
      ])

      const result = await adapter.getRequirement({ id: 'DEMO-2002' })

      const oneSqlCall = mockFetch.mock.calls.find(call => String(call[0]).includes('/workitems/onesql'))
      expect(oneSqlCall?.[0]).toBe('https://ones.test/project/api/ones-project/team/team-1/workitems/onesql')
      expect(oneSqlCall?.[1].headers.Authorization).toBe('Bearer test-access-token')

      const requestBody = JSON.parse(String(oneSqlCall?.[1].body))
      expect(requestBody.variables).toEqual([
        { key: 'task-related-demo-uuid' },
        'Task',
        null,
        null,
      ])
      expect(result.description).toContain('## Related Work Items')
      expect(result.description).toContain('DEMO-2002 配置迁移')
      expect(result.description).toContain('activity-config-migration')
      expect(result.raw.relatedActivities).toEqual([
        expect.objectContaining({ uuid: 'activity-config-migration' }),
      ])
    })

    it('should omit the related work items section when onesql returns no activities', async () => {
      mockLoginFlow()
      mockProjectList('DEMO', 'project-demo-uuid')
      mockTaskSearch([{
        key: 'task-related-demo-uuid',
        uuid: 'related-demo-uuid',
        number: 2002,
        name: '匿名需求',
        issueType: { uuid: 'it-requirement', name: '需求' },
        status: { uuid: 's1', name: '开发已分派', category: 'in_progress' },
        project: { uuid: 'project-demo-uuid', name: 'Anonymous Project' },
      }])
      mockTaskResponse(makeRequirementTask({
        key: 'task-related-demo-uuid',
        uuid: 'related-demo-uuid',
        number: 2002,
        name: '匿名需求',
      }))
      mockRelatedActivitiesResponse([])

      const result = await adapter.getRequirement({ id: 'DEMO-2002' })

      expect(result.description).not.toContain('## Related Work Items')
      expect(result.raw.relatedActivities).toEqual([])
    })

    it('should return a display-id task when optional related activity lookup fails', async () => {
      mockLoginFlow()
      mockProjectList('DEMO', 'project-demo-uuid')
      mockTaskSearch([{
        key: 'task-related-demo-uuid',
        uuid: 'related-demo-uuid',
        number: 2002,
        name: '匿名需求',
        issueType: { uuid: 'it-requirement', name: '需求' },
        status: { uuid: 's1', name: '开发已分派', category: 'in_progress' },
        project: { uuid: 'project-demo-uuid', name: 'Anonymous Project' },
      }])
      mockTaskResponse(makeRequirementTask({
        key: 'task-related-demo-uuid',
        uuid: 'related-demo-uuid',
        number: 2002,
        name: '匿名需求',
      }))
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('{"errcode":"NotFound.WorkItemType"}'),
      })

      const result = await adapter.getRequirement({ id: 'DEMO-2002' })

      expect(result.id).toBe('related-demo-uuid')
      expect(result.title).toBe('#2002 匿名需求')
      expect(result.description).not.toContain('## Related Work Items')
      expect(result.raw.relatedActivities).toEqual([])
    })

    it('should fetch wiki content from an anchor link in task description', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        description: '<p>具体需求内容详见wiki：<a href="https://ones.test/wiki/#/team/team-mock-uuid/space/space-mock-uuid/page/wiki-anchor-uuid" target="_blank">点击查看</a></p>',
        descriptionText: '具体需求内容详见wiki：点击查看',
      }))
      mockWikiContent('## Wiki Anchor Requirement\n\n升级示例服务运行时和构建工具。')

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.description).toContain('## Requirement Documents')
      expect(result.description).toContain('### Wiki wiki-anchor-uuid')
      expect(result.description).toContain('升级示例服务运行时和构建工具')
    })

    it('should fetch wiki content from a plain pasted wiki URL in task description text', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        description: '',
        descriptionText: '具体需求内容详见wiki：https://ones.test/wiki/#/team/team-mock-uuid/space/space-mock-uuid/page/wiki-plain-uuid',
      }))
      mockWikiContent('## Wiki Plain Requirement\n\n升级示例代码检查配置。')

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.description).toContain('### Wiki wiki-plain-uuid')
      expect(result.description).toContain('升级示例代码检查配置')
    })

    it('should fetch wiki content directly from a pasted ONES wiki page URL', async () => {
      mockLoginFlow()
      mockWikiContent('## Direct Wiki Requirement\n\n支持直接粘贴 Wiki 页面 URL 获取需求详情。')

      const result = await adapter.getRequirement({
        id: 'https://ones.test/wiki/#/team/team-direct-uuid/space/space-direct-uuid/page/wiki-direct-uuid',
      })

      const graphqlCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('/items/graphql'))
      expect(graphqlCalls).toHaveLength(0)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://ones.test/wiki/api/wiki/team/team-direct-uuid/online_page/wiki-direct-uuid/content',
        { headers: { Authorization: 'Bearer test-access-token' } },
      )
      expect(result.id).toBe('wiki-direct-uuid')
      expect(result.title).toBe('Wiki wiki-direct-uuid')
      expect(result.description).toContain('## Direct Wiki Requirement')
      expect(result.description).toContain('支持直接粘贴 Wiki 页面 URL 获取需求详情')
    })

    it('should render tables from a short ONES wiki URL', async () => {
      mockLoginFlow()
      mockWikiContent(JSON.stringify({
        'blocks': [
          { id: 'table', type: 'table', rows: 2, cols: 2, children: ['cell-1', 'cell-2', 'cell-3', 'cell-4'] },
        ],
        'cell-1': [{ id: 'cell-1-text', type: 'text', text: [{ insert: 'Field' }] }],
        'cell-2': [{ id: 'cell-2-text', type: 'text', text: [{ insert: 'Value' }] }],
        'cell-3': [{ id: 'cell-3-text', type: 'text', text: [{ insert: 'Mode' }] }],
        'cell-4': [{ id: 'cell-4-text', type: 'text', text: [{ insert: 'Enabled' }] }],
      }))

      const result = await adapter.getRequirement({
        id: 'https://ones.test/wiki#/team/team-short-uuid/page/wiki-short-uuid',
      })

      const graphqlCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('/items/graphql'))
      expect(graphqlCalls).toHaveLength(0)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ones.test/wiki/api/wiki/team/team-short-uuid/online_page/wiki-short-uuid/content',
        { headers: { Authorization: 'Bearer test-access-token' } },
      )
      expect(result.description).toContain('| Field | Value |')
      expect(result.description).toContain('| --- | --- |')
      expect(result.description).toContain('| Mode | Enabled |')
      expect(result.description).not.toContain('{"blocks"')
    })

    it('should preserve a merged ONES wiki table column as HTML', async () => {
      mockLoginFlow()
      mockWikiContent(JSON.stringify({
        'blocks': [{
          'id': 'table-merged-column',
          'type': 'table',
          'rows': 2,
          'cols': 3,
          'children': ['cell-wide', 'cell-tail', 'cell-a', 'cell-b', 'cell-c'],
          'cell-wide_colSpan': 2,
        }],
        'cell-wide': [{ id: 'wide-text', type: 'text', text: [{ insert: 'Merged heading' }] }],
        'cell-tail': [{ id: 'tail-text', type: 'text', text: [{ insert: 'Tail' }] }],
        'cell-a': [{ id: 'a-text', type: 'text', text: [{ insert: 'A' }] }],
        'cell-b': [{ id: 'b-text', type: 'text', text: [{ insert: 'B' }] }],
        'cell-c': [{ id: 'c-text', type: 'text', text: [{ insert: 'C' }] }],
      }))

      const result = await adapter.getRequirement({
        id: 'https://ones.test/wiki#/team/team-table-uuid/page/wiki-table-uuid',
      })

      expect(result.description).toContain('<td colspan="2">')
      expect(result.description).toContain('Merged heading')
      expect(result.description).toContain('Tail')
      expect(result.description.match(/Merged heading/g)).toHaveLength(1)
      expect(result.description).not.toContain('| Merged heading |')
    })

    it('should preserve a merged ONES wiki table row as HTML', async () => {
      mockLoginFlow()
      mockWikiContent(JSON.stringify({
        'blocks': [{
          'id': 'table-merged-row',
          'type': 'table',
          'rows': 2,
          'cols': 2,
          'children': ['cell-tall', 'cell-top', 'cell-missing'],
          'cell-tall_rowSpan': 2,
        }],
        'cell-tall': [{ id: 'tall-text', type: 'text', text: [{ insert: 'Merged side' }] }],
        'cell-top': [{ id: 'top-text', type: 'text', text: [{ insert: 'Top' }] }],
      }))

      const result = await adapter.getRequirement({
        id: 'https://ones.test/wiki#/team/team-table-uuid/page/wiki-table-uuid',
      })

      expect(result.description).toContain('<td rowspan="2">')
      expect(result.description.match(/Merged side/g)).toHaveLength(1)
      expect(result.description).toMatch(/<tr>\s*<td><\/td>\s*<\/tr>/)
      expect(result.description).not.toContain('cell-missing')
    })

    it('should clamp invalid ONES wiki table spans to table bounds', async () => {
      mockLoginFlow()
      mockWikiContent(JSON.stringify({
        'blocks': [{
          'id': 'table-invalid-span',
          'type': 'table',
          'rows': 1,
          'cols': 2,
          'children': ['cell-wide', 'cell-extra'],
          'cell-wide_colSpan': 99,
          'cell-wide_rowSpan': -2,
          'cell-extra_rowSpan': 'invalid',
        }],
        'cell-wide': [{ id: 'wide-text', type: 'text', text: [{ insert: '<Unsafe & value>' }] }],
        'cell-extra': [{ id: 'extra-text', type: 'text', text: [{ insert: 'Extra row' }] }],
      }))

      const result = await adapter.getRequirement({
        id: 'https://ones.test/wiki#/team/team-table-uuid/page/wiki-table-uuid',
      })

      expect(result.description).toContain('<td colspan="2">')
      expect(result.description).not.toContain('rowspan=')
      expect(result.description).toContain('&lt;Unsafe &amp; value&gt;')
      expect(result.description).not.toContain('colspan="99"')
      expect(result.description).toContain('Extra row')
    })

    it('should preserve a nested ONES wiki table as nested HTML', async () => {
      mockLoginFlow()
      mockWikiContent(JSON.stringify({
        'blocks': [{ id: 'outer-table', type: 'table', rows: 1, cols: 1, children: ['outer-cell'] }],
        'outer-cell': [{ id: 'inner-table', type: 'table', rows: 1, cols: 2, children: ['inner-a', 'inner-b'] }],
        'inner-a': [{ id: 'inner-a-text', type: 'text', text: [{ insert: 'Nested A', attributes: { bold: true } }] }],
        'inner-b': [{ id: 'inner-b-text', type: 'text', text: [{ insert: 'Nested B', attributes: { link: 'https://example.test/nested?a=1&b=2' } }] }],
      }))

      const result = await adapter.getRequirement({
        id: 'https://ones.test/wiki#/team/team-table-uuid/page/wiki-table-uuid',
      })

      expect(result.description.match(/<table>/g)).toHaveLength(2)
      expect(result.description).toContain('<strong>Nested A</strong>')
      expect(result.description).toContain('<a href="https://example.test/nested?a=1&amp;b=2">Nested B</a>')
      expect(result.description).not.toContain('| Nested A | Nested B |')
    })

    it('should reject a pasted ONES wiki URL without a page route', async () => {
      await expect(adapter.getRequirement({
        id: 'https://ones.example/wiki/#/team/team-direct-uuid/space/space-direct-uuid',
      })).rejects.toThrow('ONES: Unsupported wiki page URL')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should reject a wiki URL from a different origin or with encoded path injection', async () => {
      await expect(adapter.getRequirement({
        id: 'https://attacker.test/wiki/#/team/team-direct-uuid/space/space-direct-uuid/page/wiki-direct-uuid',
      })).rejects.toThrow('origin does not match')
      await expect(adapter.getRequirement({
        id: 'https://ones.test/wiki/#/team/%2e%2e%2fadmin%3Fx=/space/space-direct-uuid/page/wiki-direct-uuid',
      })).rejects.toThrow('Unsupported wiki page URL')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should render ONES wiki block content instead of exposing raw JSON', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        relatedWikiPages: [
          { uuid: 'wiki-block-uuid', title: '示例页面交互优化' },
        ],
        relatedWikiPagesCount: 1,
      }))
      mockWikiContent(JSON.stringify({
        'blocks': [
          { id: 'h1', type: 'text', heading: 1, text: [{ insert: '#10001 示例页面交互优化' }] },
          { id: 'section', type: 'text', heading: 3, text: [{ insert: '1、示例模块-列表页' }] },
          { id: 'body', type: 'text', text: [{ insert: '输入查询时，忽略前后空格' }] },
          { id: 'link', type: 'text', text: [{ insert: 'UI图详见：' }, { insert: '点击查看', attributes: { link: 'https://figma.example/design' } }] },
          { id: 'list', type: 'list', ordered: false, level: 1, text: [{ insert: '支持换行批量查询' }] },
          { id: 'table', type: 'table', rows: 2, cols: 2, children: ['cell-1', 'cell-2', 'cell-3', 'cell-4'] },
          { id: 'image', type: 'embed', embedType: 'image', embedData: { src: 'order.png' } },
        ],
        'cell-1': [{ id: 'cell-1-text', type: 'text', text: [{ insert: '更新时间' }] }],
        'cell-2': [{ id: 'cell-2-text', type: 'text', text: [{ insert: '更新内容' }] }],
        'cell-3': [{ id: 'cell-3-text', type: 'text', text: [{ insert: '2025.12.26' }] }],
        'cell-4': [{ id: 'cell-4-text', type: 'text', text: [{ insert: '创建文档' }] }],
      }), { token: 'wiki-content-token' })
      mockWikiPageDetail({ ref_uuid: 'wiki-ref-uuid' })

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.description).toContain('### 示例页面交互优化')
      expect(result.description).toContain('# #10001 示例页面交互优化')
      expect(result.description).toContain('### 1、示例模块-列表页')
      expect(result.description).toContain('输入查询时，忽略前后空格')
      expect(result.description).toContain('[点击查看](https://figma.example/design)')
      expect(result.description).toContain('- 支持换行批量查询')
      expect(result.description).toContain('| 更新时间 | 更新内容 |')
      expect(result.description).toContain('| 2025.12.26 | 创建文档 |')
      expect(result.description).toContain('[Image: order.png]')
      expect(result.attachments).toEqual([
        expect.objectContaining({
          name: 'order.png',
          url: 'https://ones.test/wiki/api/wiki/editor/team-1/wiki-ref-uuid/resources/order.png?token=wiki-content-token',
          mimeType: 'image/png',
        }),
      ])
      expect(result.description).not.toContain('{"blocks"')
    })

    it('should dedupe wiki pages from related wiki pages and task description links', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        description: '具体需求内容详见wiki：https://ones.test/wiki/#/team/team-mock-uuid/space/space-mock-uuid/page/wiki-dup-uuid',
        descriptionText: '具体需求内容详见wiki：https://ones.test/wiki/#/team/team-mock-uuid/space/space-mock-uuid/page/wiki-dup-uuid',
        relatedWikiPages: [
          { uuid: 'wiki-dup-uuid', title: '关联需求 Wiki' },
        ],
        relatedWikiPagesCount: 1,
      }))
      mockWikiContent('## Deduped Requirement\n\n只应出现一次。')

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      const wikiFetchCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('/wiki/api/wiki/team/team-1/online_page/wiki-dup-uuid/content'))
      expect(wikiFetchCalls).toHaveLength(1)
      expect(result.description.match(/### 关联需求 Wiki/g)).toHaveLength(1)
      expect(result.description).toContain('只应出现一次')
    })

    it('should ignore wiki-like links from an unconfigured origin', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        description: 'https://attacker.test/wiki/#/team/team-mock-uuid/space/space-mock-uuid/page/private-wiki-uuid',
        descriptionText: 'external link',
      }))

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.description).toContain('external link')
      expect(mockFetch.mock.calls.some(call => String(call[0]).includes('/online_page/private-wiki-uuid/'))).toBe(false)
    })

    it('should fallback to task detail description when no wiki content is available', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        description: '<p>需求简述：【系统优化】升级示例运行时和构建工具。</p>',
        descriptionText: '需求简述：【系统优化】升级示例运行时和构建工具。',
      }))

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.description).toContain('## Requirement Detail')
      expect(result.description).toContain('需求简述：【系统优化】升级示例运行时和构建工具。')
    })

    it('should refresh inline requirement images and expose them as attachments', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        description: '<p>需求正文</p><img data-uuid="requirement-node-uuid" src="https://ones.test/project/api/project/team/team-1/res/attachment/requirement-resource-uuid">',
        desc_rich: '<p>需求正文</p><img data-uuid="requirement-node-uuid" src="https://ones.test/project/api/project/team/team-1/res/attachment/requirement-resource-uuid">',
        descriptionText: '需求正文\n[image]',
      }))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          desc: '<p>需求正文</p><img data-uuid="requirement-node-uuid" src="https://ones.test/project/api/project/team/team-1/res/attachment/requirement-resource-uuid">',
          desc_rich: '<p>需求正文</p><img data-uuid="requirement-node-uuid" src="https://ones.test/project/api/project/team/team-1/res/attachment/requirement-resource-uuid">',
        }),
      })
      mockFetch.mockResolvedValueOnce({
        status: 302,
        headers: new Headers({
          location: 'https://cdn.ones.test/fresh-requirement.png?X-Amz-Signature=fresh',
        }),
      })

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.description).toContain('需求正文\n[image]')
      expect(result.description).not.toContain('X-Amz-Signature')
      expect(result.attachments).toEqual([
        {
          id: 'requirement-node-uuid',
          name: 'fresh-requirement.png',
          url: 'https://cdn.ones.test/fresh-requirement.png?X-Amz-Signature=fresh',
          mimeType: 'image/png',
          size: 0,
        },
      ])
      const refreshCalls = mockFetch.mock.calls.filter(call =>
        String(call[0]).includes('/res/attachment/requirement-resource-uuid'),
      )
      expect(refreshCalls).toHaveLength(1)
    })

    it('should throw if task not found', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { task: null } }),
      })

      await expect(adapter.getRequirement({ id: 'nonexistent' })).rejects.toThrow('not found')
    })

    it('should reuse session on subsequent calls', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture),
      })

      await adapter.getRequirement({ id: 'abc-123-def' })

      // Second call should not re-login (only 1 more fetch for GraphQL)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture),
      })

      await adapter.getRequirement({ id: 'abc-123-def' })

      // 7 login calls + 1 graphql for first + 1 graphql for second = 9
      expect(mockFetch).toHaveBeenCalledTimes(9)
    })

    it('should skip wiki expansion for a task and point to the next tool', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
        name: '匿名任务',
        relatedWikiPages: [{ uuid: 'wiki-should-not-load', title: '不应加载' }],
        relatedWikiPagesCount: 1,
        descriptionText: '实现导出接口。',
      }))

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.type).toBe('task')
      expect(result.raw.workItemKind).toBe('task')
      expect(result.description).toContain('## Task Detail')
      expect(result.description).toContain('get_related_issues / get_testcases')
      expect(result.description).not.toContain('## Requirement Documents')
      expect(mockFetch.mock.calls.some(call => String(call[0]).includes('/online_page/'))).toBe(false)
    })

    it('should skip wiki expansion for a defect and point to get_issue_detail', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
        subIssueType: { uuid: 'it-bug', name: '缺陷', detailType: 3 },
        name: '登录崩溃',
        relatedWikiPages: [{ uuid: 'wiki-should-not-load', title: '不应加载' }],
        relatedWikiPagesCount: 1,
        descriptionText: '登录页白屏。',
      }))

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.type).toBe('bug')
      expect(result.raw.workItemKind).toBe('defect')
      expect(result.description).toContain('## Defect Detail')
      expect(result.description).toContain('get_issue_detail')
      expect(result.description).not.toContain('## Requirement Documents')
    })

    it('should fail closed when a work-item type cannot be classified', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        issueType: { uuid: 'it-custom', name: '自定义类型' },
      }))

      await expect(adapter.getRequirement({ id: 'abc-123-def' }))
        .rejects
        .toThrow('Unable to classify')
    })
  })

  describe('searchRequirements', () => {
    it('should search tasks via GraphQL and filter by keyword', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.search),
      })

      const result = await adapter.searchRequirements({ query: '认证' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0].title).toContain('认证')
      expect(result.total).toBe(1)
    })

    it('should return current user bugs in to_do and in_progress when query asks for all bugs', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.searchMine),
      })

      const result = await adapter.searchRequirements({ query: '查询我所有缺陷' })

      expect(result.items.map(item => item.id)).toEqual(['bug-001', 'bug-002'])
      expect(result.items.every(item => item.type === 'bug')).toBe(true)
    })

    it('should return current user tasks when query asks for all tasks', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...onesFixture.searchMine,
          data: {
            buckets: [{
              ...onesFixture.searchMine.data.buckets[0],
              tasks: [
                ...onesFixture.searchMine.data.buckets[0].tasks,
                {
                  key: 'task-done-005',
                  uuid: 'task-done-005',
                  number: 105,
                  name: '已经完成的任务',
                  issueType: { uuid: 'it-task', name: '任务' },
                  status: { uuid: 's-done', name: '已完成', category: 'done' },
                  assign: { uuid: 'current-user-uuid', name: '当前用户' },
                },
              ],
            }],
          },
        }),
      })

      const result = await adapter.searchRequirements({ query: '查询我所有任务' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe('task-003')
      expect(result.items[0].type).toBe('task')
      expect(result.items.find(item => item.id === 'req-004')).toBeUndefined()
    })

    it('should classify concrete subtypes without filtering by parent issue type', async () => {
      mockLoginFlow()
      const subtypeSearch = {
        data: {
          buckets: [{
            key: 'default',
            tasks: [
              {
                key: 'task-subtype-bug',
                uuid: 'subtype-bug',
                number: 2101,
                name: '父任务下的缺陷',
                issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
                subIssueType: { uuid: 'it-bug', name: '缺陷', detailType: 3 },
                status: { uuid: 's-todo', name: '待处理', category: 'to_do' },
                priority: { value: 'high' },
                assign: { uuid: 'current-user-uuid', name: '当前用户' },
              },
              {
                key: 'task-subtype-task',
                uuid: 'subtype-task',
                number: 2102,
                name: '父需求下的任务',
                issueType: { uuid: 'it-requirement', name: '需求', detailType: 1 },
                subIssueType: { uuid: 'it-task', name: '任务', detailType: 2 },
                status: { uuid: 's-progress', name: '进行中', category: 'in_progress' },
                priority: { value: 'medium' },
                assign: { uuid: 'current-user-uuid', name: '当前用户' },
              },
            ],
          }],
        },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(subtypeSearch),
      })

      const bugs = await adapter.searchRequirements({ query: '查询我所有缺陷' })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(subtypeSearch),
      })
      const tasks = await adapter.searchRequirements({ query: '查询我所有任务' })

      expect(bugs.items.map(item => item.id)).toEqual(['subtype-bug'])
      expect(tasks.items.map(item => item.id)).toEqual(['subtype-task'])
      const graphQlCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('t=group-task-data'))
      for (const call of graphQlCalls) {
        const body = JSON.parse(String(call[1].body))
        expect(body.variables.filterGroup[0]).not.toHaveProperty('issueType_in')
      }
    })

    it('should return bugs assigned to a named assignee when query uses 负责人为', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.userSearch),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.searchAssignee),
      })

      const result = await adapter.searchRequirements({ query: '负责人为虚拟用户甲的缺陷' })

      expect(result.items.map(item => item.id)).toEqual(['bug-wtl-001', 'bug-wtl-002'])
      expect(result.items.every(item => item.assignee === '虚拟用户甲')).toBe(true)

      const userSearchCall = mockFetch.mock.calls.find(call => String(call[0]).includes('/users/search'))
      expect(userSearchCall).toBeTruthy()
      expect(JSON.parse(String(userSearchCall?.[1].body))).toMatchObject({
        keyword: '虚拟用户甲',
        status: [1],
        team_member_status: [1, 4],
        types: [1, 10],
      })

      const graphQlCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('t=group-task-data'))
      const searchCallBody = JSON.parse(String(graphQlCalls.at(-1)?.[1].body))
      expect(searchCallBody.variables.filterGroup[0].assign_in).toEqual(['user-wtl'])
    })

    it('should return bugs assigned to a named assignee when query uses 查询某人的缺陷', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.userSearch),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.searchAssignee),
      })

      const result = await adapter.searchRequirements({ query: '查询虚拟用户甲的缺陷' })

      expect(result.items.map(item => item.id)).toEqual(['bug-wtl-001', 'bug-wtl-002'])
      expect(result.items.find(item => item.id === 'bug-other-003')).toBeUndefined()
    })

    it('should match assignee names when ONES display name includes English suffix', async () => {
      mockLoginFlow()

      const userSearchWithDisplayName = {
        ...onesFixture.userSearch,
        users: onesFixture.userSearch.users.map((user, index) =>
          index === 0 ? { ...user, name: '虚拟用户甲 Demo User A' } : user),
      }

      const searchAssigneeWithDisplayName = {
        ...onesFixture.searchAssignee,
        data: {
          ...onesFixture.searchAssignee.data,
          buckets: onesFixture.searchAssignee.data.buckets.map(bucket => ({
            ...bucket,
            tasks: (bucket.tasks ?? []).map((task) => {
              if (task.assign?.uuid !== 'user-wtl')
                return task

              return {
                ...task,
                assign: {
                  ...task.assign,
                  name: '虚拟用户甲 Demo User A',
                },
              }
            }),
          })),
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(userSearchWithDisplayName),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(searchAssigneeWithDisplayName),
      })

      const result = await adapter.searchRequirements({ query: '查询虚拟用户甲的缺陷' })

      expect(result.items.map(item => item.id)).toEqual(['bug-wtl-001', 'bug-wtl-002'])
    })

    it('should return empty result when named assignee cannot be resolved to a user uuid', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [] }),
      })

      const result = await adapter.searchRequirements({ query: '查询不存在的人的缺陷' })

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)

      const graphQlCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('t=group-task-data'))
      expect(graphQlCalls).toHaveLength(0)
    })

    it('should filter by task number with # prefix', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.search),
      })

      const result = await adapter.searchRequirements({ query: '#1001' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe('abc-123-def')
    })

    it('should return all tasks when query is empty', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.search),
      })

      const result = await adapter.searchRequirements({ query: '' })

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
    })
  })

  describe('listPendingWorkItems', () => {
    it('enriches current-user requirements and tasks with hours and plan dates', async () => {
      mockLoginFlow()
      mockTaskSearch([
        makeRequirementTask({
          uuid: 'task-progress',
          number: 2002,
          name: 'DEMO-1001 实现查询',
          issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
          status: { uuid: 's-progress', name: '进行中', category: 'in_progress' },
          project: { uuid: 'project-demo', name: 'Anonymous Project', identifier: 'DEMO' },
          parent: { uuid: 'req-parent', number: 1001, issueType: { uuid: 'it-requirement', name: '需求' } },
        }),
        makeRequirementTask({
          uuid: 'req-todo',
          number: 1001,
          name: '报表需求',
          issueType: { uuid: 'it-requirement', name: '需求', detailType: 1 },
          status: { uuid: 's-todo', name: '未开始', category: 'to_do' },
          project: { uuid: 'project-demo', name: 'Anonymous Project', identifier: 'DEMO' },
        }),
        makeRequirementTask({
          uuid: 'defect-todo',
          issueType: { uuid: 'it-defect', name: '缺陷', detailType: 3 },
          status: { uuid: 's-todo', name: '待处理', category: 'to_do' },
        }),
      ])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          display_id: 'DEMO-2002',
          summary: 'DEMO-1001 实现查询',
          parent_uuid: 'req-parent',
          assess_manhour: 1200000,
          total_manhour: 700000,
          remaining_manhour: 500000,
          field_values: [
            { field_uuid: 'field027', value: 1787673600, date_value: '2026-08-26' },
            { field_uuid: 'field028', value: 1787846400, date_value: '2026-08-28' },
            { field_uuid: 'field027', value: null, date_value: '' },
          ],
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          display_id: 'DEMO-1001',
          summary: '报表需求',
          assess_manhour: 2400000,
          total_manhour: 0,
          remaining_manhour: 2400000,
          field_values: [
            { field_uuid: 'field027', value: 1788969600, date_value: '2026-09-10' },
            { field_uuid: 'field028', value: 1789488000, date_value: '2026-09-16' },
          ],
        }),
      })

      const result = await adapter.listPendingWorkItems()

      expect(result.total).toBe(2)
      expect(result.partialCount).toBe(0)
      expect(result.items.map(item => item.displayId)).toEqual(['DEMO-2002', 'DEMO-1001'])
      expect(result.items[0]).toMatchObject({
        kind: 'task',
        parentDisplayId: 'DEMO-1001',
        actualHours: 7,
        remainingHours: 5,
        estimatedHours: 12,
        planStartDate: '2026-08-26',
        planEndDate: '2026-08-28',
      })
      expect(result.items[1]).toMatchObject({
        kind: 'requirement',
        actualHours: 0,
        remainingHours: 24,
        estimatedHours: 24,
      })
      expect(mockFetch.mock.calls.some(call => String(call[0]).includes('/task/defect-todo/info'))).toBe(false)
      expect(mockFetch.mock.calls.some(call => String(call[0]).includes('/tasks/update'))).toBe(false)
    })

    it('keeps a partial row when the detail GET fails', async () => {
      mockLoginFlow()
      mockTaskSearch([makeRequirementTask({
        uuid: 'task-partial',
        number: 2003,
        name: 'DEMO-1001 部分数据',
        issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
        status: { uuid: 's-todo', name: '未开始', category: 'to_do' },
        project: { uuid: 'project-demo', name: 'Anonymous Project', identifier: 'DEMO' },
      })])
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })

      const result = await adapter.listPendingWorkItems()

      expect(result.partialCount).toBe(1)
      expect(result.items[0]).toMatchObject({
        displayId: 'DEMO-2003',
        partial: true,
        actualHours: null,
        planStartDate: null,
      })
    })
  })

  describe('getRequirementDecompositionContext', () => {
    it('returns task details and stable plan-date ordering while excluding defects', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        descriptionText: '需求详情',
        relatedTasks: [
          {
            key: 'task-late',
            uuid: 'late',
            number: 2002,
            name: 'DEMO-1001 后续实现',
            issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
            status: { uuid: 's-progress', name: '进行中', category: 'in_progress' },
            assign: { uuid: 'user-1', name: '示例用户' },
          },
          {
            key: 'task-early',
            uuid: 'early',
            number: 2001,
            name: 'DEMO-1001 前置实现',
            issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
            status: { uuid: 's-todo', name: '未开始', category: 'to_do' },
            assign: { uuid: 'user-1', name: '示例用户' },
          },
          {
            key: 'task-no-date',
            uuid: 'no-date',
            number: 2003,
            name: 'DEMO-1001 已完成任务',
            issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
            status: { uuid: 's-done', name: '已完成', category: 'done' },
          },
          {
            key: 'task-defect',
            uuid: 'defect',
            number: 2004,
            name: '关联缺陷',
            issueType: { uuid: 'it-defect', name: '缺陷', detailType: 3 },
            status: { uuid: 's-todo', name: '待处理', category: 'to_do' },
          },
        ],
      }))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          display_id: 'DEMO-1001',
          project_identifier: 'DEMO',
          version: 'v8',
          updated_at: '2026-08-17T00:00:00Z',
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          display_id: 'DEMO-2002',
          desc: '<p>后续任务详情</p>',
          field_values: [
            { field_uuid: 'field027', value: '2026-08-20' },
            { field_uuid: 'field028', value: '2026-08-21' },
          ],
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          display_id: 'DEMO-2001',
          description_text: '前置任务详情',
          plan_start_date: '2026-08-18',
          plan_end_date: '2026-08-19',
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          display_id: 'DEMO-2003',
          desc: '<p>已完成任务详情</p>',
        }),
      })

      const result = await adapter.getRequirementDecompositionContext({ requirementId: 'abc-123-def' })

      expect(result.requirement).toMatchObject({
        workItemKind: 'requirement',
        displayId: 'DEMO-1001',
        detail: '需求详情',
      })
      expect(result.decompositionRelation).toEqual({
        verified: false,
        uuid: null,
        name: null,
      })
      expect(result.tasks.map(task => task.displayId)).toEqual([
        'DEMO-2001',
        'DEMO-2002',
        'DEMO-2003',
      ])
      expect(result.tasks[0]).toMatchObject({
        detail: '前置任务详情',
        planStartDate: '2026-08-18',
        planEndDate: '2026-08-19',
      })
      expect(result.pendingTasks.map(task => task.uuid)).toEqual(['early', 'late'])
      expect(result.baseline).toMatchObject({
        requirementVersion: 'v8',
        requirementUpdatedAt: '2026-08-17T00:00:00Z',
      })
      expect(mockFetch.mock.calls.some(call => String(call[0]).includes('/task/defect/info'))).toBe(false)
      expect(mockFetch.mock.calls.some(call => String(call[0]).includes('/tasks/update'))).toBe(false)
    })

    it('rejects a task before reading decomposition metadata', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
        name: '普通任务',
      }))

      await expect(adapter.getRequirementDecompositionContext({ requirementId: 'abc-123-def' }))
        .rejects
        .toThrow('Only requirements can be decomposed')

      const taskInfoCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('/task/abc-123-def/info'))
      expect(taskInfoCalls).toHaveLength(0)
    })

    it('rejects a defect before reading decomposition metadata', async () => {
      mockLoginFlow()
      mockTaskResponse(makeRequirementTask({
        issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
        subIssueType: { uuid: 'it-defect', name: '缺陷', detailType: 3 },
        name: '普通缺陷',
      }))

      await expect(adapter.getRequirementDecompositionContext({ requirementId: 'abc-123-def' }))
        .rejects
        .toThrow('Only requirements can be decomposed')

      const taskInfoCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('/task/abc-123-def/info'))
      expect(taskInfoCalls).toHaveLength(0)
    })

    it('fails closed without any network request when the create contract is unavailable', async () => {
      await expect(adapter.createRequirementDecomposition({
        requirementUuid: 'requirement-uuid',
        planHash: 'a'.repeat(64),
        operations: [{
          operation: 'create',
          title: 'DEMO-1001 实现导出接口',
          shortContent: '实现导出接口',
          detail: '实现详情',
        }],
      })).rejects.toThrow('contract has not been confirmed')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('addManhour', () => {
    it('should add manhour with the current user and convert hours to ONES units', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-12T10:00:00.000Z'))
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { addManhour: { key: 'manhour-demo-key' } } }),
      })

      const result = await adapter.addManhour({
        taskId: 'work-item-demo-uuid',
        hours: 2,
        description: 'anonymous work log',
      })

      expect(result.key).toBe('manhour-demo-key')
      expect(result.taskUuid).toBe('work-item-demo-uuid')
      expect(result.hours).toBe(2)

      const manhourCall = mockFetch.mock.calls.find(call => String(call[0]).includes('t=add-manhour'))
      expect(manhourCall).toBeTruthy()
      const body = JSON.parse(String(manhourCall?.[1].body))
      expect(body.variables).toMatchObject({
        mode: 'simple',
        type: 'recorded',
        customData: {},
        owner: 'current-user-uuid',
        task: 'work-item-demo-uuid',
        hours: 200000,
        description: 'anonymous work log',
      })
      expect(body.variables.start_time).toEqual(expect.any(Number))
    })

    it('should add manhour on an explicit full date', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { addManhour: { key: 'manhour-date-key' } } }),
      })

      const result = await adapter.addManhour({
        taskId: 'work-item-demo-uuid',
        hours: 2,
        description: 'anonymous dated work log',
        date: '2026-06-11',
      })

      expect(result.date).toBe('2026-06-11')

      const manhourCall = mockFetch.mock.calls.find(call => String(call[0]).includes('t=add-manhour'))
      const body = JSON.parse(String(manhourCall?.[1].body))
      expect(body.variables.start_time).toBe(Math.floor(new Date(2026, 5, 11).getTime() / 1000))
    })

    it('should add manhour on a day-of-month date using the current year and month', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-12T10:00:00.000Z'))
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { addManhour: { key: 'manhour-day-key' } } }),
      })

      const result = await adapter.addManhour({
        taskId: 'work-item-demo-uuid',
        hours: 2,
        description: 'anonymous day work log',
        date: '11号',
      })

      expect(result.date).toBe('2026-06-11')

      const manhourCall = mockFetch.mock.calls.find(call => String(call[0]).includes('t=add-manhour'))
      const body = JSON.parse(String(manhourCall?.[1].body))
      expect(body.variables.start_time).toBe(Math.floor(new Date(2026, 5, 11).getTime() / 1000))
    })

    it('should reject an invalid manhour date', async () => {
      await expect(adapter.addManhour({
        taskId: 'work-item-demo-uuid',
        hours: 2,
        description: 'anonymous invalid date work log',
        date: '32号',
      })).rejects.toThrow('ONES: date must be a valid YYYY-MM-DD date or day of current month')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should add manhour after resolving a display id', async () => {
      mockLoginFlow()
      mockProjectList('DEMO', 'project-demo-uuid')
      mockTaskSearch([
        {
          key: 'task-display-demo-uuid',
          uuid: 'display-demo-uuid',
          number: 1001,
          name: '匿名任务项',
          issueType: { uuid: 'it-task', name: '任务' },
          status: { uuid: 's1', name: '进行中', category: 'in_progress' },
          project: { uuid: 'project-demo-uuid', name: 'Anonymous Project' },
        },
      ])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { addManhour: { key: 'manhour-display-key' } } }),
      })

      await adapter.addManhour({
        taskId: 'DEMO-1001',
        hours: 1.5,
        description: 'anonymous display id work log',
      })

      const manhourCall = mockFetch.mock.calls.find(call => String(call[0]).includes('t=add-manhour'))
      const body = JSON.parse(String(manhourCall?.[1].body))
      expect(body.variables.task).toBe('display-demo-uuid')
      expect(body.variables.hours).toBe(150000)
    })

    it('should add manhour after resolving a numeric task through REST search fallback', async () => {
      mockLoginFlow()
      mockTaskSearch([])
      mockRestTaskSearch([
        {
          uuid: 'requirement-rest-uuid',
          number: 3001,
          summary: '匿名需求',
          display_id: 'DEMO-3001',
          issue_type_name: '需求',
          project_uuid: 'project-demo-uuid',
          project_name: 'Anonymous Project',
        },
      ])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { addManhour: { key: 'manhour-rest-key' } } }),
      })

      const result = await adapter.addManhour({
        taskId: '3001',
        hours: 5,
        description: 'anonymous upload component work log',
      })

      expect(result.taskUuid).toBe('requirement-rest-uuid')

      const manhourCall = mockFetch.mock.calls.find(call => String(call[0]).includes('t=add-manhour'))
      const body = JSON.parse(String(manhourCall?.[1].body))
      expect(body.variables.task).toBe('requirement-rest-uuid')
      expect(body.variables.hours).toBe(500000)
      expect(body.variables.description).toBe('anonymous upload component work log')
    })
  })

  describe('updateTaskPlanDates', () => {
    it('should update plan start and end dates', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await adapter.updateTaskPlanDates({
        taskId: 'work-item-demo-uuid',
        planStartDate: '2026-06-05',
        planEndDate: '2026-07-10',
      })

      expect(result.taskUuid).toBe('work-item-demo-uuid')
      expect(result.planStartDate).toBe('2026-06-05')
      expect(result.planEndDate).toBe('2026-07-10')

      const updateCall = mockFetch.mock.calls.find(call => String(call[0]).includes('/tasks/update3'))
      expect(updateCall).toBeTruthy()
      const body = JSON.parse(String(updateCall?.[1].body))
      expect(body).toEqual({
        tasks: [{
          uuid: 'work-item-demo-uuid',
          field_values: [
            { field_uuid: 'field027', value: '2026-06-05' },
            { field_uuid: 'field028', value: '2026-07-10' },
          ],
        }],
      })
    })

    it('should update only the plan end date when start date is omitted', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      await adapter.updateTaskPlanDates({
        taskId: 'work-item-demo-uuid',
        planEndDate: '2026-07-10',
      })

      const updateCall = mockFetch.mock.calls.find(call => String(call[0]).includes('/tasks/update3'))
      const body = JSON.parse(String(updateCall?.[1].body))
      expect(body.tasks[0].field_values).toEqual([
        { field_uuid: 'field028', value: '2026-07-10' },
      ])
    })
  })

  describe('getRelatedIssues', () => {
    it('should return all pending defects (detailType=3 + to_do), current user first', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.relatedIssues),
      })

      const result = await adapter.getRelatedIssues({ taskId: 'mock-parent-task-uuid' })

      expect(result).toHaveLength(2)
      expect(result[0].key).toBe('task-bug-001')
      expect(result[0].name).toBe('登录页面崩溃')
      expect(result[0].assignUuid).toBe('current-user-uuid')
      expect(result[1].key).toBe('task-bug-004')
      expect(result[1].name).toBe('表单提交失败')
      expect(result[1].assignUuid).toBe('other-user-uuid')
    })

    it('should exclude non-defects and non-todo defects', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.relatedIssues),
      })

      const result = await adapter.getRelatedIssues({ taskId: 'mock-parent-task-uuid' })

      const uuids = result.map(r => r.uuid)
      expect(uuids).not.toContain('bug-uuid-002')
      expect(uuids).not.toContain('feat-uuid-003')
    })

    it('should return empty array when no matching defects', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            task: {
              key: 'task-xxx',
              issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
              relatedTasks: [],
            },
          },
        }),
      })

      const result = await adapter.getRelatedIssues({ taskId: 'xxx' })
      expect(result).toHaveLength(0)
    })

    it('should reject a defect parent for getRelatedIssues', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            task: {
              key: 'task-bug-parent',
              issueType: { uuid: 'it-bug', name: '缺陷', detailType: 3 },
              relatedTasks: [],
            },
          },
        }),
      })

      await expect(adapter.getRelatedIssues({ taskId: 'bug-parent' }))
        .rejects
        .toThrow('get_issue_detail')
    })
  })

  describe('getIssueDetail', () => {
    it('should fetch issue detail with fresh description from REST API', async () => {
      mockLoginFlow()
      // 8. GraphQL issue detail
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.issueDetail),
      })
      // 9. REST fetchTaskInfo (fresh signed URLs)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          desc: '<p>Fresh description</p><p><img src="https://ones.test/fresh-signed-img.png" /></p>',
          desc_rich: '<p>Fresh rich</p><p><img src="https://ones.test/fresh-signed-img.png" /></p>',
        }),
      })

      const result = await adapter.getIssueDetail({ issueId: 'mock-issue-uuid' })

      expect(result.key).toBe('task-mock-issue-uuid')
      expect(result.name).toContain('登录页面')
      // Should use fresh URLs from REST API, not stale GraphQL ones
      expect(result.descriptionRich).toContain('fresh-signed-img.png')
      expect(result.description).toContain('Fresh description')
      expect(result.descriptionText).toContain('页面崩溃')
      expect(result.issueTypeName).toBe('缺陷')
      expect(result.statusCategory).toBe('to_do')
      expect(result.solverName).toBe('当前用户')
    })

    it('should fallback to GraphQL description when REST API fails', async () => {
      mockLoginFlow()
      // 8. GraphQL issue detail
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.issueDetail),
      })
      // 9. REST fetchTaskInfo fails
      mockFetch.mockResolvedValueOnce({ ok: false })

      const result = await adapter.getIssueDetail({ issueId: 'mock-issue-uuid' })

      // Falls back to GraphQL description
      expect(result.descriptionRich).toContain('<img')
      expect(result.descriptionText).toContain('页面崩溃')
    })

    it('should resolve issue by number (e.g. "2001" or "#2001")', async () => {
      mockLoginFlow()
      // 8. search by number
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            buckets: [{
              key: 'default',
              tasks: [{
                uuid: 'bug-uuid-001',
                number: 2001,
                name: '登录页面崩溃',
              }],
            }],
          },
        }),
      })
      // 9. issue detail
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.issueDetail),
      })
      // 10. REST fetchTaskInfo
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ desc: '<p>Fresh</p>', desc_rich: '<p>Fresh</p>' }),
      })

      const result = await adapter.getIssueDetail({ issueId: '2001' })

      expect(result.key).toBe('task-mock-issue-uuid')
      expect(result.name).toContain('登录页面')
    })

    it('should resolve issue by display id', async () => {
      mockLoginFlow()
      mockProjectList('DEMO', 'project-demo-uuid')
      mockTaskSearch([{
        key: 'task-mock-issue-uuid',
        uuid: 'bug-uuid-001',
        number: 2001,
        name: '登录页面崩溃',
        issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
        subIssueType: { uuid: 'it-bug', name: '缺陷', detailType: 3 },
        status: { uuid: 's-todo', name: '待处理', category: 'to_do' },
        project: { uuid: 'project-demo-uuid', name: 'Demo Project' },
      }])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.issueDetail),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ desc: '<p>Fresh</p>', desc_rich: '<p>Fresh</p>' }),
      })

      const result = await adapter.getIssueDetail({ issueId: 'DEMO-2001' })

      expect(result.key).toBe('task-mock-issue-uuid')
      const graphQlCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('/items/graphql'))
      const searchCallBody = JSON.parse(String(graphQlCalls[1][1].body))
      expect(searchCallBody.variables.filterGroup).toEqual([
        { number_in: [2001], project_in: ['project-demo-uuid'] },
      ])
    })

    it('should refresh image URLs via attachment API when data-uuid present', async () => {
      mockLoginFlow()
      // 8. GraphQL issue detail
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.issueDetail),
      })
      // 9. REST fetchTaskInfo with data-uuid img tags
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          desc: '<p>Bug desc</p><p><img data-uuid="res-uuid-1" src="https://ones.test/stale-url.png" /></p>',
          desc_rich: '<p>Bug desc</p><p><img data-uuid="res-uuid-1" src="https://ones.test/stale-url.png" /></p><p><img data-uuid="res-uuid-2" src="https://ones.test/stale-url2.png" /></p>',
        }),
      })
      // 10. getAttachmentUrl for res-uuid-1 in desc (302 redirect)
      mockFetch.mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: 'https://cdn.ones.test/fresh-img1.png?X-Amz-Signature=new1' }),
      })
      // 11. getAttachmentUrl for res-uuid-2; res-uuid-1 is shared by desc and desc_rich
      mockFetch.mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: 'https://cdn.ones.test/fresh-img2.png?X-Amz-Signature=new2' }),
      })

      const result = await adapter.getIssueDetail({ issueId: 'mock-issue-uuid' })

      // Stale URLs should be replaced with fresh ones
      expect(result.description).toContain('fresh-img1.png')
      expect(result.description).not.toContain('stale-url.png')
      expect(result.descriptionRich).toContain('fresh-img1.png')
      expect(result.descriptionRich).toContain('fresh-img2.png')
      expect(result.descriptionRich).not.toContain('stale-url.png')
      expect(result.descriptionRich).not.toContain('stale-url2.png')
    })

    it('should reject path injection in attachment resource UUIDs before fetching', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.issueDetail),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          desc: '<img data-uuid="../admin?token=steal" src="https://ones.test/stale.png" />',
          desc_rich: '<img data-uuid="../admin?token=steal" src="https://ones.test/stale.png" />',
        }),
      })

      const result = await adapter.getIssueDetail({ issueId: 'mock-issue-uuid' })

      expect(result.description).toContain('stale.png')
      expect(mockFetch).toHaveBeenCalledTimes(9)
      expect(mockFetch.mock.calls.map(call => String(call[0])).join('\n')).not.toContain('/admin')
    })

    it('should throw if issue not found', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { task: null } }),
      })

      await expect(adapter.getIssueDetail({ issueId: 'nonexistent' }))
        .rejects
        .toThrow('not found')
    })

    it('should reject a requirement ID for getIssueDetail', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            task: {
              key: 'task-req',
              uuid: 'req-uuid',
              name: '导出报表',
              description: '',
              descriptionText: '',
              desc_rich: '',
              issueType: { name: '需求', detailType: 1 },
              status: { name: '进行中', category: 'in_progress' },
            },
          },
        }),
      })

      await expect(adapter.getIssueDetail({ issueId: 'req-uuid' }))
        .rejects
        .toThrow('get_work_item')
    })
  })

  describe('getTestcases', () => {
    it('should find module by task number and return testcases with steps', async () => {
      mockLoginFlow()
      // 8. search task by number
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.taskSearch302),
      })
      // 9. search testcase module
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.testcaseModuleSearch),
      })
      // 10. list testcases
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.testcaseList),
      })
      // 11. testcase detail + steps
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.testcaseDetail),
      })

      const result = await adapter.getTestcases({ taskNumber: 100, libraryUuid: 'lib-uuid-001' })
      const searchRequest = JSON.parse(String(mockFetch.mock.calls[7][1].body))
      expect(searchRequest.query).toContain('subIssueType { uuid name detailType }')

      expect(result.taskNumber).toBe(100)
      expect(result.taskName).toBe('#100 功能模块重构')
      expect(result.moduleName).toBe('#100 功能模块重构')
      expect(result.totalCount).toBe(2)
      expect(result.cases).toHaveLength(2)

      // First case has 1 step
      expect(result.cases[0].name).toBe('01.检查登录页面样式')
      expect(result.cases[0].steps).toHaveLength(1)
      expect(result.cases[0].steps[0].desc).toBe('打开登录页面，检查页面元素')

      // Second case has 2 steps and a condition
      expect(result.cases[1].name).toBe('02.检查列表页数据加载')
      expect(result.cases[1].steps).toHaveLength(2)
      expect(result.cases[1].condition).toBe('用户已有历史数据')
    })

    it('should throw if task number not found', async () => {
      mockLoginFlow()
      // 8. empty search result
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { buckets: [{ key: 'default', tasks: [] }] } }),
      })

      await expect(adapter.getTestcases({ taskNumber: 999, libraryUuid: 'lib-uuid-001' }))
        .rejects
        .toThrow('Task #999 not found')
    })

    it('should throw if no matching module found', async () => {
      mockLoginFlow()
      // 8. task found
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.taskSearch302),
      })
      // 9. empty modules
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { testcaseModules: [] } }),
      })

      await expect(adapter.getTestcases({ taskNumber: 100, libraryUuid: 'lib-uuid-001' }))
        .rejects
        .toThrow('No testcase module matching "#100"')
    })

    it('should reject a defect number for getTestcases', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            buckets: [{
              key: 'default',
              tasks: [{
                uuid: 'bug-100',
                number: 100,
                name: '登录崩溃',
                issueType: { uuid: 'it-task', name: '任务', detailType: 2 },
                subIssueType: { uuid: 'it-bug', name: '缺陷', detailType: 3 },
              }],
            }],
          },
        }),
      })

      await expect(adapter.getTestcases({ taskNumber: 100 }))
        .rejects
        .toThrow('get_issue_detail')
      expect(mockFetch).toHaveBeenCalledTimes(8)
      expect(mockFetch.mock.calls.some(call => String(call[0]).includes('t=library-select'))).toBe(false)
    })
  })
})
