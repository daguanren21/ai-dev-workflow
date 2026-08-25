import type { OnesApiClient } from '../../src/adapters/ones/api-client'
import type { OnesWikiReader } from '../../src/adapters/ones/wiki-reader'
import type { Requirement } from '../../src/types/requirement'
import { describe, expect, it, vi } from 'vitest'
import { OnesIssueReader } from '../../src/adapters/ones/issue-reader'
import { OnesTaskContent } from '../../src/adapters/ones/task-content'
import { OnesTaskPlanning } from '../../src/adapters/ones/task-planning'
import { OnesTaskWriter } from '../../src/adapters/ones/task-writer'

describe('ones task modules', () => {
  it('keeps image-free content local', async () => {
    const authorizedFetch = vi.fn()
    const content = new OnesTaskContent({
      apiBase: 'https://ones.example.test',
      wikiReader: {} as OnesWikiReader,
      fetchTaskInfo: vi.fn(),
      fetchRelatedActivities: vi.fn(),
      getSession: vi.fn(),
      authorizedFetch,
      classifyRemoteImageUrl: vi.fn(),
      rememberSourceIssuedImageUrl: vi.fn(),
    })

    const request = content.refreshImageUrls('<p>No images</p>')
    await expect(request).resolves.toBe('<p>No images</p>')
    expect(authorizedFetch).not.toHaveBeenCalled()
  })

  it('refuses unconfirmed decomposition writes without API access', async () => {
    const api = { graphql: vi.fn() } as unknown as OnesApiClient
    const planning = new OnesTaskPlanning({
      api,
      getRequirement: vi.fn<() => Promise<Requirement>>(),
      fetchTaskInfo: vi.fn(),
    })

    const request = planning.createDecomposition({} as never)
    await expect(request).rejects.toThrow('No write request was sent')
    expect(api.graphql).not.toHaveBeenCalled()
  })

  it('rejects defect parents before returning related issues', async () => {
    const graphql = vi.fn().mockResolvedValue({
      data: {
        task: {
          key: 'task-defect',
          issueType: { uuid: 'defect', name: '缺陷', detailType: 3 },
          relatedTasks: [],
        },
      },
    })
    const issueReader = new OnesIssueReader({
      api: {
        getSession: vi.fn().mockResolvedValue({ userUuid: 'user-1' }),
        graphql,
      } as unknown as OnesApiClient,
      resolveTaskRef: vi.fn(),
      getFreshTaskDescriptions: vi.fn(),
    })

    const request = issueReader.getRelatedIssues({ taskId: 'defect' })
    await expect(request).rejects.toThrow('get_related_issues does not apply')
  })

  it('validates plan dates before resolving a task', async () => {
    const resolveTaskRef = vi.fn()
    const writer = new OnesTaskWriter({
      api: {} as OnesApiClient,
      resolveTaskRef,
    })

    const request = writer.updatePlanDates({ taskId: 'task-1', planStartDate: '2026-02-30' })
    await expect(request).rejects.toThrow('planStartDate must be a valid YYYY-MM-DD date')
    expect(resolveTaskRef).not.toHaveBeenCalled()
  })
})
