import type { BaseAdapter } from '../../src/adapters/base'
import type { UpdateTaskPlanDatesResult } from '../../src/types/requirement'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleUpdateTaskPlanDates } from '../../src/tools/update-task-plan-dates'

const mockResult: UpdateTaskPlanDatesResult = {
  taskUuid: 'work-item-demo-uuid',
  planStartDate: '2026-06-05',
  planEndDate: '2026-07-10',
}

function createMockAdapter(result: UpdateTaskPlanDatesResult = mockResult): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn(),
    searchRequirements: vi.fn(),
    getRelatedIssues: vi.fn(),
    getIssueDetail: vi.fn(),
    getTestcases: vi.fn(),
    addManhour: vi.fn(),
    updateTaskPlanDates: vi.fn().mockResolvedValue(result),
  } as unknown as BaseAdapter
}

describe('handleUpdateTaskPlanDates', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should update plan dates and return formatted output', async () => {
    const result = await handleUpdateTaskPlanDates({
      taskId: 'work-item-demo-uuid',
      planStartDate: '2026-06-05',
      planEndDate: '2026-07-10',
    }, adapters, 'ones')

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('Updated task plan dates')
    expect(result.content[0].text).toContain('work-item-demo-uuid')
    expect(result.content[0].text).toContain('2026-06-05')
    expect(result.content[0].text).toContain('2026-07-10')
  })

  it('should pass optional dates to the selected adapter', async () => {
    const onesAdapter = createMockAdapter({
      taskUuid: 'work-item-demo-uuid',
      planStartDate: null,
      planEndDate: '2026-07-10',
    })
    adapters.set('ones', onesAdapter)

    await handleUpdateTaskPlanDates({
      taskId: 'work-item-demo-uuid',
      planEndDate: '2026-07-10',
      source: 'ones',
    }, adapters, undefined)

    expect(onesAdapter.updateTaskPlanDates).toHaveBeenCalledWith({
      taskId: 'work-item-demo-uuid',
      planStartDate: undefined,
      planEndDate: '2026-07-10',
    })
  })

  it('should throw if source is unavailable', async () => {
    await expect(handleUpdateTaskPlanDates({
      taskId: 'work-item-demo-uuid',
      planStartDate: '2026-06-05',
      source: 'missing',
    }, adapters, undefined)).rejects.toThrow('not configured')
  })
})
