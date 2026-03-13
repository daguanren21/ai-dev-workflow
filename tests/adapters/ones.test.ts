import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnesAdapter } from '../../src/adapters/ones.js'
import onesFixture from '../fixtures/ones-response.json'

// Mock global fetch for ONES PKCE flow + GraphQL calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock crypto for deterministic PKCE values
vi.mock('node:crypto', () => ({
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
}))

function mockLoginFlow() {
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
    headers: new Headers({ location: 'https://ones.test/login?id=auth-req-1' }),
  })
  // 4. finalize
  mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') })
  // 5. callback (302 redirect with code)
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 302,
    headers: new Headers({ location: 'https://ones.test/callback?code=auth-code-1' }),
  })
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

  describe('getRequirement', () => {
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
      expect(result.title).toBe('#95945 实现用户认证模块')
      expect(result.status).toBe('in_progress')
      expect(result.priority).toBe('high')
      expect(result.type).toBe('feature') // 需求 -> feature
      expect(result.assignee).toBe('虚拟用户丙')

      // Verify GraphQL call used correct endpoint
      const graphqlCall = mockFetch.mock.calls[7]
      expect(graphqlCall[0]).toContain('/project/api/project/team/team-1/items/graphql')
      expect(graphqlCall[1].headers.Authorization).toBe('Bearer test-access-token')
    })

    it('should include related tasks in description', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture),
      })

      const result = await adapter.getRequirement({ id: 'abc-123-def' })

      expect(result.description).toContain('Related Tasks')
      expect(result.description).toContain('#95946 前端页面开发')
      expect(result.description).toContain('虚拟用户丁')
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
        json: () => Promise.resolve(onesFixture.issueTypes),
      })
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
        json: () => Promise.resolve(onesFixture.issueTypes),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.searchMine),
      })

      const result = await adapter.searchRequirements({ query: '查询我所有任务' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe('task-003')
      expect(result.items[0].type).toBe('task')
      expect(result.items.find(item => item.id === 'req-004')).toBeUndefined()
    })

    it('should reuse issue type cache across repeated search queries', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.issueTypes),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.searchMine),
      })

      await adapter.searchRequirements({ query: '查询我所有缺陷' })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.searchMine),
      })

      await adapter.searchRequirements({ query: '查询我所有任务' })

      const issueTypeCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('t=issueTypes'))
      expect(issueTypeCalls).toHaveLength(1)
    })

    it('should return bugs assigned to a named assignee when query uses 负责人为', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.userSearch),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.issueTypes),
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
        json: () => Promise.resolve(onesFixture.issueTypes),
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
        json: () => Promise.resolve(onesFixture.issueTypes),
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

      const result = await adapter.searchRequirements({ query: '#95945' })

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

  describe('getRelatedIssues', () => {
    it('should return all pending defects (detailType=3 + to_do), current user first', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(onesFixture.relatedIssues),
      })

      const result = await adapter.getRelatedIssues({ taskId: 'HRL2p8rTX4mQ9xMv' })

      // 2 pending defects: bug-001 (current user) and bug-004 (other user)
      expect(result).toHaveLength(2)
      // Current user's defect first
      expect(result[0].key).toBe('task-bug-001')
      expect(result[0].name).toBe('登录页面崩溃')
      expect(result[0].assignUuid).toBe('current-user-uuid')
      // Other user's defect second
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

      const result = await adapter.getRelatedIssues({ taskId: 'HRL2p8rTX4mQ9xMv' })

      const uuids = result.map(r => r.uuid)
      expect(uuids).not.toContain('bug-uuid-002') // done, not to_do
      expect(uuids).not.toContain('feat-uuid-003') // not a defect
    })

    it('should return empty array when no matching defects', async () => {
      mockLoginFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { task: { key: 'task-xxx', relatedTasks: [] } },
        }),
      })

      const result = await adapter.getRelatedIssues({ taskId: 'xxx' })
      expect(result).toHaveLength(0)
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

      const result = await adapter.getIssueDetail({ issueId: '6W9vW3y8J9DO66Pu' })

      expect(result.key).toBe('task-6W9vW3y8J9DO66Pu')
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

      const result = await adapter.getIssueDetail({ issueId: '6W9vW3y8J9DO66Pu' })

      // Falls back to GraphQL description
      expect(result.descriptionRich).toContain('<img')
      expect(result.descriptionText).toContain('页面崩溃')
    })

    it('should resolve issue by number (e.g. "98086" or "#98086")', async () => {
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
                number: 98086,
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

      const result = await adapter.getIssueDetail({ issueId: '98086' })

      expect(result.key).toBe('task-6W9vW3y8J9DO66Pu')
      expect(result.name).toContain('登录页面')
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
      // 11. getAttachmentUrl for res-uuid-1 in desc_rich (302 redirect)
      mockFetch.mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: 'https://cdn.ones.test/fresh-img1.png?X-Amz-Signature=new1' }),
      })
      // 12. getAttachmentUrl for res-uuid-2 in desc_rich (302 redirect)
      mockFetch.mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: 'https://cdn.ones.test/fresh-img2.png?X-Amz-Signature=new2' }),
      })

      const result = await adapter.getIssueDetail({ issueId: '6W9vW3y8J9DO66Pu' })

      // Stale URLs should be replaced with fresh ones
      expect(result.description).toContain('fresh-img1.png')
      expect(result.description).not.toContain('stale-url.png')
      expect(result.descriptionRich).toContain('fresh-img1.png')
      expect(result.descriptionRich).toContain('fresh-img2.png')
      expect(result.descriptionRich).not.toContain('stale-url.png')
      expect(result.descriptionRich).not.toContain('stale-url2.png')
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
  })
})
