import type { BaseAdapter } from '../adapters/base.js'
import type { IssueDetail } from '../types/requirement.js'
import { z } from 'zod/v4'

export const GetIssueDetailSchema = z.object({
  issueId: z.string().describe('The issue task ID or key (e.g. "6W9vW3y8J9DO66Pu" or "task-6W9vW3y8J9DO66Pu")'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetIssueDetailInput = z.infer<typeof GetIssueDetailSchema>

export async function handleGetIssueDetail(
  input: GetIssueDetailInput,
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

  const detail = await adapter.getIssueDetail({ issueId: input.issueId })

  return {
    content: [{ type: 'text' as const, text: formatIssueDetail(detail) }],
  }
}

function formatIssueDetail(detail: IssueDetail): string {
  const lines = [
    `# ${detail.name}`,
    '',
    `- **Key**: ${detail.key}`,
    `- **UUID**: ${detail.uuid}`,
    `- **Type**: ${detail.issueTypeName}`,
    `- **Status**: ${detail.statusName} (${detail.statusCategory})`,
    `- **Priority**: ${detail.priorityValue ?? 'N/A'}`,
    `- **Severity**: ${detail.severityLevel ?? 'N/A'}`,
    `- **Assignee**: ${detail.assignName ?? 'Unassigned'}`,
    `- **Owner**: ${detail.ownerName ?? 'Unknown'}`,
    `- **Solver**: ${detail.solverName ?? 'Unassigned'}`,
  ]

  if (detail.projectName)
    lines.push(`- **Project**: ${detail.projectName}`)
  if (detail.sprintName)
    lines.push(`- **Sprint**: ${detail.sprintName}`)
  if (detail.deadline)
    lines.push(`- **Deadline**: ${detail.deadline}`)

  lines.push('', '## Description', '')
  if (detail.descriptionRich) {
    lines.push(detail.descriptionRich)

    // Extract image URLs from rich text
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g
    const images = Array.from(detail.descriptionRich.matchAll(imgRegex), m => m[1])
    if (images.length > 0) {
      lines.push('', '## Images', '')
      for (const url of images) {
        lines.push(`- ![image](${url})`)
      }
    }
  }
  else if (detail.descriptionText) {
    lines.push(detail.descriptionText)
  }
  else {
    lines.push('_No description_')
  }

  return lines.join('\n')
}
