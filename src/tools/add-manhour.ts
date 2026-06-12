import type { BaseAdapter } from '../adapters/base.js'
import type { AddManhourResult } from '../types/requirement.js'
import { z } from 'zod/v4'

export const AddManhourSchema = z.object({
  taskId: z.string().min(1).describe('The task or requirement ID, key, number, or displayId (e.g. "task-mock-uuid", "mock-uuid", "1001", or "DEMO-1001")'),
  hours: z.number().positive().describe('Work hours to record. Natural hours are converted to ONES internal units.'),
  description: z.string().min(1).describe('Work log description.'),
  date: z.string().optional().describe('Optional work date. Accepts YYYY-MM-DD, a day number like "11", or a day-of-month phrase like "11号"; day-only values use the current year and month.'),
  source: z.string().optional().describe('Source to update. If omitted, uses the default source.'),
})

export type AddManhourInput = z.infer<typeof AddManhourSchema>

export async function handleAddManhour(
  input: AddManhourInput,
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

  const result = await adapter.addManhour({
    taskId: input.taskId,
    hours: input.hours,
    description: input.description,
    date: input.date,
  })

  return {
    content: [{ type: 'text' as const, text: formatAddManhourResult(result) }],
  }
}

function formatAddManhourResult(result: AddManhourResult): string {
  return [
    'Added manhour.',
    '',
    `- **Key**: ${result.key}`,
    `- **Task UUID**: ${result.taskUuid}`,
    `- **Hours**: ${result.hours}`,
    `- **Date**: ${result.date ?? 'today'}`,
    `- **Description**: ${result.description}`,
  ].join('\n')
}
