import type { BaseAdapter } from '../../src/adapters/base.js'
import type { RelatedIssue } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGetRelatedIssues } from '../../src/tools/get-related-issues.js'

const mockIssues: RelatedIssue[] = [
  {
    key: 'task-bug-001',
    uuid: 'bug-uuid-001',
    name: '登录页面崩溃',
    issueTypeName: '缺陷',
    statusName: '待处理',
    statusCategory: 'to_do',
    assignName: '当前用户',
    assignUuid: 'current-user-uuid',
    priorityValue: 'high',
    projectName: 'StarCloud',
  },
  {
    key: 'task-bug-004',
    uuid: 'bug-uuid-004',
    name: '表单提交失败',
    issueTypeName: '缺陷',
    statusName: '待处理',
    statusCategory: 'to_do',
    assignName: '其他人',
    assignUuid: 'other-user-uuid',
    priorityValue: 'high',
    projectName: 'StarCloud',
  },
]

function createMockAdapter(issues?: RelatedIssue[]): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn(),
    searchRequirements: vi.fn(),
    getRelatedIssues: vi.fn().mockResolvedValue(issues ?? mockIssues),
    getIssueDetail: vi.fn(),
  } as unknown as BaseAdapter
}

describe('handleGetRelatedIssues', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should return formatted related issues list with all defects', async () => {
    const result = await handleGetRelatedIssues(
      { taskId: 'HRL2p8rTX4mQ9xMv' },
      adapters,
      'ones',
    )

    expect(result.content).toHaveLength(1)
    const text = result.content[0].text
    expect(text).toContain('登录页面崩溃')
    expect(text).toContain('表单提交失败')
    expect(text).toContain('task-bug-001')
    expect(text).toContain('task-bug-004')
    expect(text).toContain('2')
  })

  it('should handle empty results', async () => {
    adapters.set('ones', createMockAdapter([]))

    const result = await handleGetRelatedIssues(
      { taskId: 'xxx' },
      adapters,
      'ones',
    )

    expect(result.content[0].text).toContain('0')
  })

  it('should throw if no source specified and no default', async () => {
    await expect(
      handleGetRelatedIssues({ taskId: 'xxx' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })

  it('should throw if source not configured', async () => {
    await expect(
      handleGetRelatedIssues({ taskId: 'xxx', source: 'nonexistent' }, adapters, undefined),
    ).rejects.toThrow('not configured')
  })
})
