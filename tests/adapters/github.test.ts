import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubAdapter } from '../../src/adapters/github.js'
import githubResponse from '../fixtures/github-response.json'

vi.mock('../../src/utils/http.js', () => ({
  authFetch: vi.fn(),
}))

import { authFetch } from '../../src/utils/http.js'

const mockAuthFetch = vi.mocked(authFetch)

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new GitHubAdapter(
      'github',
      {
        enabled: true,
        apiBase: 'https://api.github.com',
        auth: { type: 'token', tokenEnv: 'GITHUB_TOKEN' },
        options: { owner: 'my-org', repo: 'my-repo' },
      },
      { token: 'ghp_test123' },
    )
  })

  describe('getRequirement', () => {
    it('should map GitHub issue to Requirement', async () => {
      mockAuthFetch.mockResolvedValueOnce(githubResponse)

      const result = await adapter.getRequirement({ id: '42' })

      expect(result.id).toBe('my-org/my-repo#42')
      expect(result.source).toBe('github')
      expect(result.title).toBe('Add user authentication')
      expect(result.status).toBe('open')
      expect(result.priority).toBe('high')
      expect(result.type).toBe('feature')
      expect(result.reporter).toBe('johndoe')
      expect(result.assignee).toBe('janesmith')
      expect(result.labels).toEqual(['feature', 'high', 'backend'])
    })

    it('should handle "owner/repo#number" ID format', async () => {
      mockAuthFetch.mockResolvedValueOnce(githubResponse)

      const result = await adapter.getRequirement({ id: 'my-org/my-repo#42' })

      expect(result.id).toBe('my-org/my-repo#42')
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ path: '/repos/my-org/my-repo/issues/42' }),
      )
    })

    it('should reject pull requests', async () => {
      mockAuthFetch.mockResolvedValueOnce({
        ...githubResponse,
        pull_request: { url: 'https://api.github.com/repos/my-org/my-repo/pulls/42' },
      })

      await expect(adapter.getRequirement({ id: '42' })).rejects.toThrow('pull request')
    })

    it('should throw if owner/repo not configured', async () => {
      const adapterNoOptions = new GitHubAdapter(
        'github',
        {
          enabled: true,
          apiBase: 'https://api.github.com',
          auth: { type: 'token', tokenEnv: 'GITHUB_TOKEN' },
        },
        { token: 'ghp_test123' },
      )

      await expect(adapterNoOptions.getRequirement({ id: '42' })).rejects.toThrow('owner')
    })
  })

  describe('searchRequirements', () => {
    it('should return search results and filter PRs', async () => {
      mockAuthFetch.mockResolvedValueOnce({
        total_count: 2,
        items: [
          githubResponse,
          { ...githubResponse, number: 43, pull_request: { url: 'some-pr-url' } },
        ],
      })

      const result = await adapter.searchRequirements({ query: 'auth' })

      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(2)
      expect(result.items[0].id).toBe('my-org/my-repo#42')
    })

    it('should handle empty results', async () => {
      mockAuthFetch.mockResolvedValueOnce({
        total_count: 0,
        items: [],
      })

      const result = await adapter.searchRequirements({ query: 'nonexistent' })

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
    })
  })
})
