import type { BaseAdapter } from '../adapters/base.js'
import type { RelatedIssue } from '../types/requirement.js'
import { z } from 'zod/v4'

export const GetRelatedIssuesSchema = z.object({
  taskId: z.string().describe('The parent task ID or key (e.g. "HRL2p8rTX4mQ9xMv" or "task-HRL2p8rTX4mQ9xMv")'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetRelatedIssuesInput = z.infer<typeof GetRelatedIssuesSchema>

export async function handleGetRelatedIssues(
  input: GetRelatedIssuesInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const sourceType = input.source ?? defaultSource
  if (!sourceType) {
    throw new Error('No source specified and no default source configured')
  }

  const adapter = adapters.get(sourceType)
  if (!adapter) {
    throw new Error(
      `Source "${sourceType}" is not configured. Available: ${[...adapters.keys()].join(', ')}`,
    )
  }

  const issues = await adapter.getRelatedIssues({ taskId: input.taskId })

  return {
    content: [{ type: 'text' as const, text: formatRelatedIssues(issues) }],
  }
}

function formatRelatedIssues(issues: RelatedIssue[]): string {
  const lines = [
    `Found **${issues.length}** pending defects:`,
    '',
  ]

  if (issues.length === 0) {
    lines.push('No pending defects found for this task.')
    return lines.join('\n')
  }

  // Group by assignee name
  const grouped = new Map<string, RelatedIssue[]>()
  for (const issue of issues) {
    const assignee = issue.assignName ?? 'Unassigned'
    if (!grouped.has(assignee))
      grouped.set(assignee, [])
    grouped.get(assignee)!.push(issue)
  }

  for (const [assignee, group] of grouped) {
    lines.push(`## ${assignee} (${group.length})`)
    lines.push('')
    for (const issue of group) {
      lines.push(`### ${issue.key}: ${issue.name}`)
      lines.push(`- Status: ${issue.statusName} | Priority: ${issue.priorityValue ?? 'N/A'}`)
      if (issue.projectName) {
        lines.push(`- Project: ${issue.projectName}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}
