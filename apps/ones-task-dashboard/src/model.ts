import type { PendingWorkItem } from '../../../src/types/requirement'

export interface DashboardFilters {
  query: string
  status: 'all' | 'to_do' | 'in_progress'
  kind: 'all' | 'requirement' | 'task'
}

export interface WorkItemGroup {
  key: string
  requirement?: PendingWorkItem
  items: PendingWorkItem[]
}

export function formatHours(value?: number | null): string {
  if (value == null)
    return '—'
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)}h`
}

export function matchesFilters(item: PendingWorkItem, filters: DashboardFilters): boolean {
  if (filters.status !== 'all' && item.statusCategory !== filters.status)
    return false
  if (filters.kind !== 'all' && item.kind !== filters.kind)
    return false
  const query = filters.query.trim().toLocaleLowerCase('zh-CN')
  if (!query)
    return true
  return [item.displayId, item.title, item.assigneeName, item.projectName, item.parentDisplayId]
    .some(value => value?.toLocaleLowerCase('zh-CN').includes(query))
}

export function groupWorkItems(items: PendingWorkItem[]): WorkItemGroup[] {
  const requirements = new Map(items.filter(item => item.kind === 'requirement').map(item => [item.displayId, item]))
  const groups = new Map<string, WorkItemGroup>()

  for (const item of items) {
    if (item.kind === 'requirement') {
      const current = groups.get(item.displayId)
      groups.set(item.displayId, { key: item.displayId, requirement: item, items: current?.items ?? [] })
      continue
    }
    const key = item.parentDisplayId ?? 'standalone'
    const group = groups.get(key) ?? { key, requirement: requirements.get(key), items: [] }
    group.items.push(item)
    groups.set(key, group)
  }

  return [...groups.values()].sort((left, right) => {
    const leftDate = left.requirement?.planStartDate ?? left.items[0]?.planStartDate
    const rightDate = right.requirement?.planStartDate ?? right.items[0]?.planStartDate
    if (leftDate && rightDate)
      return leftDate.localeCompare(rightDate)
    if (leftDate)
      return -1
    if (rightDate)
      return 1
    return left.key.localeCompare(right.key)
  })
}
