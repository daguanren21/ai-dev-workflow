import type { BaseAdapter } from '../adapters/base.js'
import type { UpdateTaskPlanDatesResult } from '../types/requirement.js'
import { z } from 'zod/v4'

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const UpdateTaskPlanDatesSchema = z.object({
  taskId: z.string().min(1).describe('The task or requirement ID, key, number, or displayId (e.g. "task-mock-uuid", "mock-uuid", "1001", or "DEMO-1001")'),
  planStartDate: DateSchema.optional().describe('Plan start date in YYYY-MM-DD format.'),
  planEndDate: DateSchema.optional().describe('Plan end date in YYYY-MM-DD format.'),
  source: z.string().optional().describe('Source to update. If omitted, uses the default source.'),
})

export type UpdateTaskPlanDatesInput = z.infer<typeof UpdateTaskPlanDatesSchema>

export async function handleUpdateTaskPlanDates(
  input: UpdateTaskPlanDatesInput,
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

  const result = await adapter.updateTaskPlanDates({
    taskId: input.taskId,
    planStartDate: input.planStartDate,
    planEndDate: input.planEndDate,
  })

  return {
    content: [{ type: 'text' as const, text: formatUpdateTaskPlanDatesResult(result) }],
  }
}

function formatUpdateTaskPlanDatesResult(result: UpdateTaskPlanDatesResult): string {
  const lines = [
    'Updated task plan dates.',
    '',
    `- **Task UUID**: ${result.taskUuid}`,
  ]

  if (result.planStartDate)
    lines.push(`- **Plan Start Date**: ${result.planStartDate}`)
  if (result.planEndDate)
    lines.push(`- **Plan End Date**: ${result.planEndDate}`)

  return lines.join('\n')
}
