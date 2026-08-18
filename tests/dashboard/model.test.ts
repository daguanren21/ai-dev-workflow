import type { PendingWorkItem } from '../../src/types/requirement'
import { formatHours, groupWorkItems, matchesFilters } from '../../apps/ones-task-dashboard/src/model'

function item(overrides: Partial<PendingWorkItem>): PendingWorkItem {
  return {
    uuid: 'uuid',
    displayId: 'DEMO-1',
    kind: 'task',
    title: '实现只读任务面板',
    statusName: '未开始',
    statusCategory: 'to_do',
    partial: false,
    warnings: [],
    ...overrides,
  }
}

describe('dashboard model', () => {
  it('formats zero and fractional hours without hiding zero', () => {
    expect(formatHours(undefined)).toBe('—')
    expect(formatHours(0)).toBe('0h')
    expect(formatHours(1.25)).toBe('1.25h')
  })

  it('filters by status, kind, and searchable parent id', () => {
    const workItem = item({ parentDisplayId: 'REQ-42', statusCategory: 'in_progress' })
    expect(matchesFilters(workItem, { query: 'req-42', status: 'in_progress', kind: 'task' })).toBe(true)
    expect(matchesFilters(workItem, { query: '', status: 'to_do', kind: 'all' })).toBe(false)
  })

  it('groups child tasks below their requirement and sorts dated groups first', () => {
    const requirement = item({ displayId: 'REQ-42', uuid: 'r1', kind: 'requirement', planStartDate: '2026-08-20' })
    const child = item({ displayId: 'TASK-1', uuid: 't1', parentDisplayId: 'REQ-42' })
    const standalone = item({ displayId: 'TASK-2', uuid: 't2' })
    const groups = groupWorkItems([standalone, child, requirement])
    expect(groups[0]).toMatchObject({ key: 'REQ-42', requirement, items: [child] })
    expect(groups[1]).toMatchObject({ key: 'standalone', items: [standalone] })
  })
})
