import type { BaseAdapter } from '../../src/adapters/base.js'
import type { TestCaseResult } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGetTestcases } from '../../src/tools/get-testcases.js'

const mockResult: TestCaseResult = {
  taskNumber: 302,
  taskName: '#302 RMA重构',
  moduleName: '#302 RMA重构',
  moduleUuid: 'Dkdie5Tu',
  totalCount: 2,
  cases: [
    {
      uuid: 'case-001',
      id: 'T166341',
      name: '01.检查seller端菜单设置',
      priority: 'P0',
      type: '功能测试',
      assignName: '戚明珠',
      condition: '',
      desc: '',
      modulePath: '',
      steps: [{ uuid: 's1', index: 0, desc: '使用seller账号登入', result: '新增菜单' }],
    },
    {
      uuid: 'case-002',
      id: 'T166342',
      name: '02.历史售后规则初始化检查',
      priority: 'P0',
      type: '功能测试',
      assignName: '戚明珠',
      condition: 'seller已有历史规则',
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
      { taskNumber: '302' },
      adapters,
      'ones',
    )

    const text = result.content[0].text
    expect(text).toContain('#302 RMA重构')
    expect(text).toContain('T166341')
    expect(text).toContain('检查seller端菜单设置')
    expect(text).toContain('seller账号')
    expect(text).toContain('2 个用例')
  })

  it('should include condition when present', async () => {
    const result = await handleGetTestcases(
      { taskNumber: '302' },
      adapters,
      'ones',
    )
    expect(result.content[0].text).toContain('seller已有历史规则')
  })

  it('should throw if no source specified', async () => {
    await expect(
      handleGetTestcases({ taskNumber: '302' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })

  it('should throw if invalid task number', async () => {
    await expect(
      handleGetTestcases({ taskNumber: 'abc' }, adapters, 'ones'),
    ).rejects.toThrow('Invalid task number')
  })
})
