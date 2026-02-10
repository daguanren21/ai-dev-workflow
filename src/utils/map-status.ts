import type { RequirementPriority, RequirementStatus, RequirementType } from '../types/requirement.js'

// --- ONES status mapping ---
const ONES_STATUS_MAP: Record<string, RequirementStatus> = {
  to_do: 'open',
  in_progress: 'in_progress',
  done: 'done',
  closed: 'closed',
}

// --- Priority mappings ---
const ONES_PRIORITY_MAP: Record<string, RequirementPriority> = {
  urgent: 'critical',
  high: 'high',
  normal: 'medium',
  medium: 'medium',
  low: 'low',
}

// --- Type mappings ---
const ONES_TYPE_MAP: Record<string, RequirementType> = {
  demand: 'feature',
  需求: 'feature',
  task: 'task',
  任务: 'task',
  bug: 'bug',
  缺陷: 'bug',
  story: 'story',
  子任务: 'task',
  工单: 'task',
  测试任务: 'task',
}

export function mapOnesStatus(status: string): RequirementStatus {
  return ONES_STATUS_MAP[status.toLowerCase()] ?? 'open'
}

export function mapOnesPriority(priority: string): RequirementPriority {
  return ONES_PRIORITY_MAP[priority.toLowerCase()] ?? 'medium'
}

export function mapOnesType(type: string): RequirementType {
  return ONES_TYPE_MAP[type.toLowerCase()] ?? 'task'
}
