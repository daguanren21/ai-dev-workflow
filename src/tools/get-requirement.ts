import { z } from 'zod/v4'
import type { BaseAdapter } from '../adapters/base.js'

export const GetRequirementSchema = z.object({
  id: z.string().describe('The requirement/issue ID'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetRequirementInput = z.infer<typeof GetRequirementSchema>

export async function handleGetRequirement(
  input: GetRequirementInput,
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

  const requirement = await adapter.getRequirement({ id: input.id })

  return {
    content: [
      {
        type: 'text' as const,
        text: formatRequirement(requirement),
      },
    ],
  }
}

function formatRequirement(req: import('../types/requirement.js').Requirement): string {
  const lines = [
    `# ${req.title}`,
    '',
    `- **ID**: ${req.id}`,
    `- **Source**: ${req.source}`,
    `- **Status**: ${req.status}`,
    `- **Priority**: ${req.priority}`,
    `- **Type**: ${req.type}`,
    `- **Assignee**: ${req.assignee ?? 'Unassigned'}`,
    `- **Reporter**: ${req.reporter || 'Unknown'}`,
  ]

  if (req.createdAt) {
    lines.push(`- **Created**: ${req.createdAt}`)
  }
  if (req.updatedAt) {
    lines.push(`- **Updated**: ${req.updatedAt}`)
  }

  if (req.dueDate) {
    lines.push(`- **Due**: ${req.dueDate}`)
  }

  if (req.labels.length > 0) {
    lines.push(`- **Labels**: ${req.labels.join(', ')}`)
  }

  lines.push('', '## Description', '', req.description || '_No description_')

  if (req.attachments.length > 0) {
    lines.push('', '## Attachments')
    for (const att of req.attachments) {
      lines.push(`- [${att.name}](${att.url}) (${att.mimeType}, ${att.size} bytes)`)
    }
  }

  return lines.join('\n')
}
