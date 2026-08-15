export type OnesWorkItemKind = 'requirement' | 'task' | 'defect' | 'unknown'

export interface OnesIssueTypeLike {
  detailType?: number | null
  name?: string | null
}

/**
 * ONES issueType.detailType / subIssueType.detailType:
 * 1 = 需求, 2 = 任务, 3 = 缺陷.
 *
 * A concrete sub-type is more specific than its parent issue type. Some ONES
 * teams model defects as a task parent type with a defect sub-type, so the
 * sub-type must win when both are present.
 */
export function classifyOnesWorkItem(
  issueType?: OnesIssueTypeLike | null,
  subIssueType?: OnesIssueTypeLike | null,
): OnesWorkItemKind {
  for (const candidate of [subIssueType, issueType]) {
    const detailType = candidate?.detailType
    if (detailType === 1)
      return 'requirement'
    if (detailType === 2)
      return 'task'
    if (detailType === 3)
      return 'defect'

    const name = (candidate?.name ?? '').trim().toLowerCase()
    if (name === '需求' || name === 'demand' || name === 'story' || name === 'feature')
      return 'requirement'
    if (name === '缺陷' || name === 'bug' || name === 'defect')
      return 'defect'
    if (name === '任务' || name === 'task' || name === '子任务' || name === '工单' || name === '测试任务')
      return 'task'
  }

  return 'unknown'
}

export function workItemKindLabel(kind: OnesWorkItemKind): string {
  switch (kind) {
    case 'requirement':
      return '需求'
    case 'task':
      return '任务'
    case 'defect':
      return '缺陷'
    default:
      return '未知类型'
  }
}
