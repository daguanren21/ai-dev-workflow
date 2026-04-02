import type { BaseAdapter } from '../../src/adapters/base.js'
import type { TestCaseResult } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGetTestcases } from '../../src/tools/get-testcases.js'

const mockResult: TestCaseResult = {
  taskNumber: 100,
  taskName: '#100 功能模块重构',
  moduleName: '#100 功能模块重构',
  moduleUuid: 'mod-uuid-100',
  totalCount: 2,
  cases: [
    {
      uuid: 'case-001',
      id: 'T100001',
      name: '01.检查登录页面样式',
      priority: 'P0',
      type: '功能测试',
      assignName: '测试用户A',
      condition: '',
      desc: '',
      modulePath: '',
      steps: [{ uuid: 's1', index: 0, desc: '打开登录页面，检查页面元素', result: '页面元素显示正确' }],
    },
    {
      uuid: 'case-002',
      id: 'T100002',
      name: '02.检查列表页数据加载',
      priority: 'P0',
      type: '功能测试',
      assignName: '测试用户A',
      condition: '用户已有历史数据',
      desc: '',
      modulePath: '',
      steps: [
        { uuid: 's2', index: 0, desc: '打开页面', result: '显示列表' },
        { uuid: 's3', index: 1, desc: '检查状态', result: '已生效' },
      ],
    },
  ],
}

function createMockAdapter(): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn(),
    searchRequirements: vi.fn(),
    getRelatedIssues: vi.fn(),
    getIssueDetail: vi.fn(),
    getTestcases: vi.fn().mockResolvedValue(mockResult),
  } as unknown as BaseAdapter
}

describe('handleGetTestcases', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should return formatted testcase list with steps', async () => {
    const result = await handleGetTestcases(
      { taskNumber: '100' },
      adapters,
      'ones',
    )

    const text = result.content[0].text
    expect(text).toContain('#100 功能模块重构')
    expect(text).toContain('T100001')
    expect(text).toContain('检查登录页面样式')
    expect(text).toContain('登录页面')
    expect(text).toContain('2 个用例')
  })

  it('should include condition when present', async () => {
    const result = await handleGetTestcases(
      { taskNumber: '100' },
      adapters,
      'ones',
    )
    expect(result.content[0].text).toContain('用户已有历史数据')
  })

  it('should throw if no source specified', async () => {
    await expect(
      handleGetTestcases({ taskNumber: '100' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })

  it('should throw if invalid task number', async () => {
    await expect(
      handleGetTestcases({ taskNumber: 'abc' }, adapters, 'ones'),
    ).rejects.toThrow('Invalid task number')
  })
})
