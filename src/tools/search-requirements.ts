import type { BaseAdapter } from '../adapters/base.js'
import { z } from 'zod/v4'

export const SearchRequirementsSchema = z.object({
  query: z.string().describe('Search keywords'),
  source: z.string().optional().describe('Source to search. If omitted, searches the default source.'),
  page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
  pageSize: z.number().int().min(1).max(50).optional().describe('Results per page (default: 20, max: 50)'),
})

export type SearchRequirementsInput = z.infer<typeof SearchRequirementsSchema>

function formatStatusMarker(status: string): string {
  return `[${status.toUpperCase()}]`
}

export async function handleSearchRequirements(
  input: SearchRequirementsInput,
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

  const result = await adapter.searchRequirements({
    query: input.query,
    page: input.page,
    pageSize: input.pageSize,
  })

  const lines = [
    `Found **${result.total}** items (page ${result.page}/${Math.ceil(result.total / result.pageSize) || 1}):`,
    '',
  ]

  if (/\u6211.*\u7F3A\u9677|bug|\u6211.*\u4EFB\u52A1/i.test(input.query)) {
    lines.push(`Query: ${input.query}`)
    lines.push('Use an item ID or number in the next step to fetch detail.')
    lines.push('')
  }

  for (const item of result.items) {
    lines.push(`### ${formatStatusMarker(item.status)} ${item.id}: ${item.title}`)
    lines.push(`- Status: ${item.status} | Priority: ${item.priority} | Type: ${item.type}`)
    lines.push(`- Assignee: ${item.assignee ?? 'Unassigned'}`)
    const desc = item.description
      ? (item.description.length > 200 ? `${item.description.slice(0, 200)}...` : item.description)
      : '(empty)'
    lines.push(`- Content: ${desc}`)
    lines.push('')
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: lines.join('\n'),
      },
    ],
  }
}
