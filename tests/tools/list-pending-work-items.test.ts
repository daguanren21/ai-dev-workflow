import type { BaseAdapter } from '../../src/adapters/base'
import type { PendingWorkItemsResult } from '../../src/types/requirement'
import { describe, expect, it, vi } from 'vitest'
import { handleListPendingWorkItems } from '../../src/tools/list-pending-work-items'

const pendingResult: PendingWorkItemsResult = {
  items: [{
    uuid: 'task-1',
    displayId: 'DEMO-101',
    kind: 'task',
    title: 'DEMO-100 实现查询',
    statusName: '进行中',
    statusCategory: 'in_progress',
    assigneeName: '示例用户',
    projectName: '匿名项目',
    parentUuid: 'req-1',
    parentDisplayId: 'DEMO-100',
    actualHours: 7,
    remainingHours: 5,
    estimatedHours: 12,
    planStartDate: '2026-08-26',
    planEndDate: '2026-08-28',
    partial: false,
    warnings: [],
  }],
  total: 1,
  partialCount: 0,
  fetchedAt: '2026-08-17T00:00:00.000Z',
}

describe('handleListPendingWorkItems', () => {
  it('returns structured read data and a complete hour/date table', async () => {
    const adapter = {
      sourceType: 'ones',
      listPendingWorkItems: vi.fn().mockResolvedValue(pendingResult),
    } as unknown as BaseAdapter

    const result = await handleListPendingWorkItems(
      {},
      new Map([['ones', adapter]]),
      'ones',
    )

    expect(result.structuredContent).toMatchObject({
      total: 1,
      items: [{
        displayId: 'DEMO-101',
        actualHours: 7,
        remainingHours: 5,
        estimatedHours: 12,
        planStartDate: '2026-08-26',
        planEndDate: '2026-08-28',
      }],
    })
    expect(result.content[0].text).toContain('7h')
    expect(result.content[0].text).toContain('5h')
    expect(result.content[0].text).toContain('12h')
    expect(result.content[0].text).toContain('2026-08-26')
  })
})
