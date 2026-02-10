import type { RequirementStatus, RequirementPriority, RequirementType } from '../types/requirement.js'

// --- ONES status mapping ---
const ONES_STATUS_MAP: Record<string, RequirementStatus> = {
  to_do: 'open',
  in_progress: 'in_progress',
  done: 'done',
  closed: 'closed',
}

// --- Jira status category mapping ---
const JIRA_STATUS_CATEGORY_MAP: Record<string, RequirementStatus> = {
  new: 'open',
  indeterminate: 'in_progress',
  done: 'done',
  undefined: 'open',
}

// --- GitHub state mapping ---
const GITHUB_STATE_MAP: Record<string, RequirementStatus> = {
  open: 'open',
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

const JIRA_PRIORITY_MAP: Record<string, RequirementPriority> = {
  highest: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  lowest: 'low',
}

// --- Type mappings ---
const ONES_TYPE_MAP: Record<string, RequirementType> = {
  demand: 'feature',
  '需求': 'feature',
  task: 'task',
  '任务': 'task',
  bug: 'bug',
  '缺陷': 'bug',
  story: 'story',
  '子任务': 'task',
  '工单': 'task',
  '测试任务': 'task',
}

const JIRA_TYPE_MAP: Record<string, RequirementType> = {
  story: 'story',
  bug: 'bug',
  task: 'task',
  'new feature': 'feature',
  epic: 'feature',
  'sub-task': 'task',
}

export function mapOnesStatus(status: string): RequirementStatus {
  return ONES_STATUS_MAP[status.toLowerCase()] ?? 'open'
}

export function mapJiraStatusCategory(category: string): RequirementStatus {
  return JIRA_STATUS_CATEGORY_MAP[category.toLowerCase()] ?? 'open'
}

export function mapGitHubState(state: string): RequirementStatus {
  return GITHUB_STATE_MAP[state.toLowerCase()] ?? 'open'
}

export function mapOnesPriority(priority: string): RequirementPriority {
  return ONES_PRIORITY_MAP[priority.toLowerCase()] ?? 'medium'
}

export function mapJiraPriority(priority: string): RequirementPriority {
  return JIRA_PRIORITY_MAP[priority.toLowerCase()] ?? 'medium'
}

export function mapGitHubLabelsToType(labels: string[]): RequirementType {
  const lower = labels.map(l => l.toLowerCase())
  if (lower.includes('bug')) return 'bug'
  if (lower.includes('feature') || lower.includes('enhancement')) return 'feature'
  if (lower.includes('story')) return 'story'
  return 'task'
}

export function mapGitHubLabelsToPriority(labels: string[]): RequirementPriority {
  const lower = labels.map(l => l.toLowerCase())
  if (lower.some(l => l.includes('critical') || l.includes('urgent'))) return 'critical'
  if (lower.some(l => l.includes('high') || l.includes('important'))) return 'high'
  if (lower.some(l => l.includes('low'))) return 'low'
  return 'medium'
}

export function mapOnesType(type: string): RequirementType {
  return ONES_TYPE_MAP[type.toLowerCase()] ?? 'task'
}

export function mapJiraType(type: string): RequirementType {
  return JIRA_TYPE_MAP[type.toLowerCase()] ?? 'task'
}
