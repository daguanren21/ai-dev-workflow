import type { BaseAdapter } from '../../src/adapters/base.js'
import type { IssueDetail } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGetIssueDetail } from '../../src/tools/get-issue-detail.js'

const mockDetail: IssueDetail = {
  key: 'task-6W9vW3y8J9DO66Pu',
  uuid: 'bug-uuid-001',
  name: '登录页面崩溃',
  description: '<p>页面崩溃描述</p>',
  descriptionRich: '<p>页面崩溃描述</p><p><img src="https://ones.test/img.png" /></p>',
  descriptionText: '页面崩溃描述',
  issueTypeName: '缺陷',
  statusName: '待处理',
  statusCategory: 'to_do',
  assignName: '当前用户',
  ownerName: '产品经理',
  solverName: '当前用户',
  priorityValue: 'high',
  severityLevel: '严重',
  projectName: 'StarCloud',
  deadline: '2026-03-20',
  sprintName: 'Sprint 12',
  raw: {},
}

function createMockAdapter(detail?: IssueDetail): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn(),
    searchRequirements: vi.fn(),
    getRelatedIssues: vi.fn(),
    getIssueDetail: vi.fn().mockResolvedValue(detail ?? mockDetail),
  } as unknown as BaseAdapter
}

describe('handleGetIssueDetail', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should return formatted issue detail with description', async () => {
    const result = await handleGetIssueDetail(
      { issueId: '6W9vW3y8J9DO66Pu' },
      adapters,
      'ones',
    )

    expect(result.content).toHaveLength(1)
    const text = result.content[0].text
    expect(text).toContain('登录页面崩溃')
    expect(text).toContain('task-6W9vW3y8J9DO66Pu')
    expect(text).toContain('页面崩溃描述')
    expect(text).toContain('缺陷')
    expect(text).toContain('待处理')
    expect(text).toContain('严重')
  })

  it('should include image URLs from rich description', async () => {
    const result = await handleGetIssueDetail(
      { issueId: '6W9vW3y8J9DO66Pu' },
      adapters,
      'ones',
    )

    expect(result.content[0].text).toContain('https://ones.test/img.png')
  })

  it('should throw if no source specified and no default', async () => {
    await expect(
      handleGetIssueDetail({ issueId: 'xxx' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })

  it('should throw if source not configured', async () => {
    await expect(
      handleGetIssueDetail({ issueId: 'xxx', source: 'nonexistent' }, adapters, undefined),
    ).rejects.toThrow('not configured')
  })
})
