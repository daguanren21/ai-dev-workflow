import { describe, it, expect, vi, beforeEach } from 'vitest'
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
        org_user: { org_user_uuid: 'org-user-1', name: 'Test User' },
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

describe('OnesAdapter', () => {
  let adapter: OnesAdapter

  beforeEach(() => {
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
      expect(result.type).toBe('feature') // 需求 → feature
      expect(result.assignee).toBe('张三')

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
})
