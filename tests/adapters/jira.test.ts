import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JiraAdapter } from '../../src/adapters/jira.js'
import jiraResponse from '../fixtures/jira-response.json'

vi.mock('../../src/utils/http.js', () => ({
  authFetch: vi.fn(),
}))

import { authFetch } from '../../src/utils/http.js'

const mockAuthFetch = vi.mocked(authFetch)

describe('JiraAdapter', () => {
  let adapter: JiraAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new JiraAdapter(
      'jira',
      {
        enabled: true,
        apiBase: 'https://jira.example.com',
        auth: { type: 'token', tokenEnv: 'JIRA_API_TOKEN' },
      },
      { token: 'test-token' },
    )
  })

  describe('getRequirement', () => {
    it('should map Jira issue to Requirement', async () => {
      mockAuthFetch.mockResolvedValueOnce(jiraResponse)

      const result = await adapter.getRequirement({ id: 'PROJ-123' })

      expect(result.id).toBe('PROJ-123')
      expect(result.source).toBe('jira')
      expect(result.title).toBe('Add user authentication')
      expect(result.status).toBe('in_progress')
      expect(result.priority).toBe('high')
      expect(result.type).toBe('story')
      expect(result.reporter).toBe('John Doe')
      expect(result.assignee).toBe('Jane Smith')
      expect(result.labels).toEqual(['backend', 'auth'])
      expect(result.dueDate).toBe('2025-02-28')
      expect(result.attachments).toHaveLength(1)
      expect(result.attachments[0].name).toBe('auth-design.pdf')
    })

    it('should convert ADF description to text', async () => {
      mockAuthFetch.mockResolvedValueOnce(jiraResponse)

      const result = await adapter.getRequirement({ id: 'PROJ-123' })

      expect(result.description).toContain('Implement JWT-based authentication')
      expect(result.description).toContain('Requirements:')
    })

    it('should handle null description', async () => {
      mockAuthFetch.mockResolvedValueOnce({
        key: 'PROJ-999',
        fields: {
          summary: 'No description issue',
          description: null,
          status: { name: 'Open', statusCategory: { key: 'new' } },
          priority: { name: 'Low' },
          issuetype: { name: 'Bug' },
          labels: [],
          reporter: null,
          assignee: null,
          created: '2025-02-01T00:00:00.000Z',
          updated: '2025-02-01T00:00:00.000Z',
          duedate: null,
        },
      })

      const result = await adapter.getRequirement({ id: 'PROJ-999' })

      expect(result.description).toBe('')
      expect(result.status).toBe('open')
      expect(result.type).toBe('bug')
      expect(result.assignee).toBeNull()
    })
  })

  describe('searchRequirements', () => {
    it('should return search results with pagination', async () => {
      mockAuthFetch.mockResolvedValueOnce({
        issues: [jiraResponse],
        total: 1,
        startAt: 0,
        maxResults: 20,
      })

      const result = await adapter.searchRequirements({ query: 'authentication' })

      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.items[0].id).toBe('PROJ-123')
    })
  })
})
