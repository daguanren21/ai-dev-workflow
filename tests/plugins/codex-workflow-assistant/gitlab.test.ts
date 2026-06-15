import { describe, expect, it, vi } from 'vitest'
import { fetchGitLabActivity } from '../../../plugins/codex-workflow-assistant/scripts/src/lib/gitlab.ts'

describe('gitlab activity client', () => {
  it('fetches commits and merge requests with token auth', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      expect(options?.headers).toMatchObject({ 'PRIVATE-TOKEN': 'secret' })
      const textUrl = String(url)

      if (textUrl.includes('/repository/commits')) {
        return jsonResponse([
          {
            id: 'abc123',
            short_id: 'abc123',
            title: 'fix: req 96706 optimize vxe table',
            message: 'fix: req 96706 optimize vxe table',
            committed_date: '2026-06-15T09:00:00Z',
            web_url: 'https://gitlab.example.com/group/project/-/commit/abc123',
            stats: { additions: 20, deletions: 5, total: 25 },
          },
        ])
      }

      if (textUrl.includes('/merge_requests')) {
        return jsonResponse([
          {
            iid: 7,
            title: '96706 vxe table optimization',
            source_branch: 'req/96706-vxe-table-optimization',
            web_url: 'https://gitlab.example.com/group/project/-/merge_requests/7',
            updated_at: '2026-06-15T10:00:00Z',
          },
        ])
      }

      return jsonResponse([])
    })

    const activity = await fetchGitLabActivity({
      url: 'https://gitlab.example.com',
      token: 'secret',
      projectId: '123',
      date: '2026-06-15',
      fetchImpl,
    })

    expect(activity.commits).toHaveLength(1)
    expect(activity.mergeRequests).toHaveLength(1)
    expect(activity.commits[0].additions).toBe(20)
    expect(activity.mergeRequests[0].sourceBranch).toBe('req/96706-vxe-table-optimization')
  })

  it('rejects missing GitLab configuration', async () => {
    await expect(fetchGitLabActivity({
      url: '',
      token: '',
      projectId: '',
      date: '2026-06-15',
      fetchImpl: vi.fn(),
    })).rejects.toThrow('GITLAB_URL, GITLAB_TOKEN, and GITLAB_PROJECT_ID are required')
  })
})

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers([['x-next-page', '']]),
    json: async () => value,
  } as Response
}
