import type { BaseAdapter } from '../adapters/base'
import type { Attachment, IssueDetail, Requirement } from '../types/requirement'
import type { OnesWorkItemKind } from '../utils/ones-issue-kind'
import { z } from 'zod/v4'
import { sanitizeExternalInline, sanitizeExternalText, UNTRUSTED_SOURCE_NOTICE } from '../utils/external-content'
import { classifyOnesWorkItem, workItemKindLabel } from '../utils/ones-issue-kind'

export const GetGrillingBriefSchema = z.object({
  id: z.string().describe('ONES work-item ID, number, displayId, or wiki URL'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetGrillingBriefInput = z.infer<typeof GetGrillingBriefSchema>

export const GrillingGapSchema = z.object({
  id: z.string(),
  kind: z.enum(['fact', 'decision']),
  title: z.string(),
  reason: z.string(),
  recommendedAction: z.string(),
})

export const GrillingContextSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
  priority: z.string(),
  type: z.string(),
  assignee: z.string().nullable(),
  attachments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    mimeType: z.string(),
    size: z.number(),
  })),
})

export const GrillingFollowUpSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('get_related_issues'),
    arguments: z.object({ taskId: z.string() }),
  }),
  z.object({
    tool: z.literal('get_testcases'),
    arguments: z.object({ taskNumber: z.string() }),
  }),
])

export const GrillingBriefOutputSchema = z.object({
  workItemKind: z.enum(['requirement', 'task', 'defect']),
  workItemLabel: z.string(),
  contextSourceTool: z.enum(['get_work_item', 'get_issue_detail']),
  context: GrillingContextSchema.extend({
    taskNumber: z.number().int().nullable(),
  }),
  followUps: z.array(GrillingFollowUpSchema),
  facts: z.array(z.string()),
  gaps: z.array(GrillingGapSchema),
})

export type GrillingGap = z.infer<typeof GrillingGapSchema>
export type GrillingBrief = z.infer<typeof GrillingBriefOutputSchema>

function workItemKindFromRequirement(req: Requirement): OnesWorkItemKind {
  const rawKind = req.raw.workItemKind
  if (rawKind === 'requirement' || rawKind === 'task' || rawKind === 'defect' || rawKind === 'unknown')
    return rawKind

  return classifyOnesWorkItem({
    name: req.type === 'feature' ? '需求' : req.type === 'bug' ? '缺陷' : '任务',
  })
}

function sourceDescription(req: Requirement, issueDetail?: IssueDetail): string {
  if (issueDetail) {
    return sanitizeExternalText(
      issueDetail.descriptionText
      || issueDetail.description
      || issueDetail.descriptionRich,
    )
  }

  const rawDescription = req.raw.sourceDescription
  return typeof rawDescription === 'string' ? sanitizeExternalText(rawDescription) : ''
}

function collectGaps(
  req: Requirement,
  kind: Exclude<OnesWorkItemKind, 'unknown'>,
  description: string,
  issueDetail?: IssueDetail,
): GrillingGap[] {
  const gaps: GrillingGap[] = []
  const hasSourceDescription = issueDetail
    ? Boolean(description)
    : req.raw.hasSourceDescription === true

  if (!hasSourceDescription) {
    gaps.push({
      id: 'missing-description',
      kind: 'fact',
      title: '缺少正文',
      reason: 'ONES 工作项没有可用的原始描述，不能从格式化摘要推断需求边界。',
      recommendedAction: '补充 ONES 正文，或提供可核对的导出内容。',
    })
  }

  if (kind === 'requirement' && req.raw.hasRequirementDocuments !== true) {
    gaps.push({
      id: 'missing-requirement-doc',
      kind: 'fact',
      title: '缺少需求文档',
      reason: '需求没有可用的关联 wiki 文档，必须以 ONES 正文或用户提供的原始材料替代。',
      recommendedAction: '检查 ONES 关联 wiki，或提供需求文档导出。',
    })
  }

  if (kind === 'requirement' && !/验收|acceptance|Given|When|Then/i.test(description)) {
    gaps.push({
      id: 'missing-acceptance',
      kind: 'decision',
      title: '缺少验收标准',
      reason: '原始需求内容没有可执行的验收条件，需要用户确认完成定义。',
      recommendedAction: '在 grill-me 中确认 Given/When/Then 验收标准。',
    })
  }

  if (kind === 'defect' && !/复现|reproduce|步骤/i.test(description)) {
    gaps.push({
      id: 'missing-repro',
      kind: 'decision',
      title: '缺少复现步骤',
      reason: '缺陷详情没有明确复现路径，修复范围不能默认推断。',
      recommendedAction: '在 grill-me 中确认最小复现路径、期望行为和影响范围。',
    })
  }

  const assignee = issueDetail?.assignName ?? req.assignee
  if (!assignee) {
    gaps.push({
      id: 'missing-assignee',
      kind: 'decision',
      title: '未指定负责人',
      reason: '当前工作项没有 assignee，执行边界和计划日期无法默认。',
      recommendedAction: '在 grill-me 中确认负责人或明确由当前执行者承担。',
    })
  }

  return gaps
}

function sanitizeAttachmentUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  }
  catch {
    return url.replace(/[?#].*$/, '')
  }
}

function contextAttachments(attachments: Attachment[]): GrillingBrief['context']['attachments'] {
  return attachments.map(attachment => ({
    id: sanitizeExternalInline(attachment.id),
    name: sanitizeExternalInline(attachment.name),
    url: sanitizeAttachmentUrl(attachment.url),
    mimeType: sanitizeExternalInline(attachment.mimeType),
    size: attachment.size,
  }))
}

export function buildGrillingBrief(req: Requirement, issueDetail?: IssueDetail): GrillingBrief {
  const workItemKind = workItemKindFromRequirement(req)
  if (workItemKind === 'unknown') {
    throw new Error(`Unable to build grilling brief for unclassified work item "${req.id}"`)
  }

  const description = sourceDescription(req, issueDetail)
  const rawAssignee = issueDetail?.assignName ?? req.assignee
  const assignee = rawAssignee ? sanitizeExternalInline(rawAssignee) : null
  const rawNumber = req.raw.number
  const taskNumber = typeof rawNumber === 'number' && Number.isInteger(rawNumber)
    ? rawNumber
    : null
  const hasTaskIdentity = typeof req.raw.key === 'string' || taskNumber !== null
  const followUps: GrillingBrief['followUps'] = workItemKind === 'defect' || !hasTaskIdentity
    ? []
    : [
        { tool: 'get_related_issues', arguments: { taskId: req.id } },
        ...(taskNumber === null
          ? []
          : [{ tool: 'get_testcases' as const, arguments: { taskNumber: String(taskNumber) } }]),
      ]
  return {
    workItemKind,
    workItemLabel: workItemKindLabel(workItemKind),
    contextSourceTool: workItemKind === 'defect' ? 'get_issue_detail' : 'get_work_item',
    context: {
      id: sanitizeExternalInline(req.id),
      taskNumber,
      title: sanitizeExternalInline(issueDetail?.name ?? req.title),
      description,
      status: sanitizeExternalInline(issueDetail?.statusCategory ?? req.status),
      priority: sanitizeExternalInline(issueDetail?.priorityValue ?? req.priority),
      type: sanitizeExternalInline(req.type),
      assignee,
      attachments: contextAttachments(req.attachments),
    },
    followUps,
    facts: [
      `ID: ${sanitizeExternalInline(req.id)}`,
      `Kind: ${workItemKindLabel(workItemKind)}`,
      `Status: ${sanitizeExternalInline(issueDetail?.statusName ?? req.status)}`,
      `Priority: ${sanitizeExternalInline(issueDetail?.priorityValue ?? req.priority)}`,
      `Assignee: ${assignee ?? 'Unassigned'}`,
    ],
    gaps: collectGaps(req, workItemKind, description, issueDetail),
  }
}

function formatGrillingBrief(brief: GrillingBrief): string {
  const lines = [
    `# Grilling Brief: ${brief.context.title}`,
    '',
    `- **ID**: ${brief.context.id}`,
    `- **Work Item Kind**: ${brief.workItemLabel} (${brief.workItemKind})`,
    `- **Context Loaded By**: ${brief.contextSourceTool}`,
    `- **Follow-up Calls**: ${brief.followUps.length
      ? brief.followUps.map(followUp => `${followUp.tool}(${JSON.stringify(followUp.arguments)})`).join(', ')
      : 'None'}`,
    '',
    '## Facts',
    '',
    ...brief.facts.map(fact => `- ${fact}`),
    '',
    '## Untrusted ONES Source Context',
    '',
    UNTRUSTED_SOURCE_NOTICE,
    '',
    brief.context.description || '(No source description available)',
    '',
    '## Gaps',
    '',
  ]

  if (brief.gaps.length === 0) {
    lines.push('No blocking gaps. Confirm shared understanding, then continue the harness.')
    return lines.join('\n')
  }

  for (const gap of brief.gaps) {
    lines.push(`### ${gap.title}`)
    lines.push(`- Kind: ${gap.kind}`)
    lines.push(`- Reason: ${gap.reason}`)
    lines.push(`- Recommended action: ${gap.recommendedAction}`)
    lines.push('')
  }

  lines.push('Ask only decision gaps. Resolve fact gaps from ONES, MCP follow-up calls, or the codebase before asking the user.')
  return lines.join('\n')
}

export async function handleGetGrillingBrief(
  input: GetGrillingBriefInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const sourceType = input.source ?? defaultSource
  if (!sourceType)
    throw new Error('No source specified and no default source configured')

  const adapter = adapters.get(sourceType)
  if (!adapter) {
    throw new Error(
      `Source "${sourceType}" is not configured. Available: ${[...adapters.keys()].join(', ')}`,
    )
  }

  const workItem = await adapter.getRequirement({ id: input.id })
  const kind = workItemKindFromRequirement(workItem)
  if (kind === 'unknown')
    throw new Error(`Unable to classify work item "${input.id}"`)

  const issueDetail = kind === 'defect'
    ? await adapter.getIssueDetail({ issueId: workItem.id })
    : undefined
  const brief = buildGrillingBrief(workItem, issueDetail)

  return {
    content: [{ type: 'text' as const, text: formatGrillingBrief(brief) }],
    structuredContent: brief,
  }
}
