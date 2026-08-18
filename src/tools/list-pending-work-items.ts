import type { BaseAdapter } from '../adapters/base'
import type { PendingWorkItem, PendingWorkItemsResult } from '../types/requirement'
import { z } from 'zod/v4'
import { sanitizeExternalInline, UNTRUSTED_SOURCE_NOTICE } from '../utils/external-content'

export const ListPendingWorkItemsSchema = z.object({
  source: z.string().optional().describe('Source to read. If omitted, uses the default source.'),
})

export type ListPendingWorkItemsInput = z.infer<typeof ListPendingWorkItemsSchema>

function resolveAdapter(
  source: string | undefined,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
): BaseAdapter {
  const sourceType = source ?? defaultSource
  if (!sourceType)
    throw new Error('No source specified and no default source configured')
  const adapter = adapters.get(sourceType)
  if (!adapter) {
    throw new Error(
      `Source "${sourceType}" is not configured. Available: ${[...adapters.keys()].join(', ')}`,
    )
  }
  return adapter
}

function sanitizeItem(item: PendingWorkItem): PendingWorkItem {
  return {
    ...item,
    displayId: sanitizeExternalInline(item.displayId),
    title: sanitizeExternalInline(item.title),
    statusName: sanitizeExternalInline(item.statusName),
    assigneeName: item.assigneeName ? sanitizeExternalInline(item.assigneeName) : null,
    projectName: item.projectName ? sanitizeExternalInline(item.projectName) : null,
    parentDisplayId: item.parentDisplayId ? sanitizeExternalInline(item.parentDisplayId) : null,
    warnings: item.warnings.map(sanitizeExternalInline),
  }
}

function formatHours(value: number | null): string {
  if (value === null)
    return '—'
  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function formatResult(result: PendingWorkItemsResult): string {
  const lines = [
    '# Pending ONES Work Items',
    '',
    `- Total: ${result.total}`,
    `- Partial rows: ${result.partialCount}`,
    `- Fetched at: ${result.fetchedAt}`,
    '- Scope: current assignee; requirements and tasks; status is not started or in progress; defects excluded.',
    '',
    UNTRUSTED_SOURCE_NOTICE,
    '',
    '| Display ID | Type | Title | Status | Actual | Remaining | Estimate | Plan Start | Plan End |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |',
  ]

  for (const item of result.items) {
    lines.push(`| ${escapeTable(item.displayId)} | ${item.kind} | ${escapeTable(item.title)} | ${escapeTable(item.statusName)} | ${formatHours(item.actualHours)} | ${formatHours(item.remainingHours)} | ${formatHours(item.estimatedHours)} | ${item.planStartDate ?? '—'} | ${item.planEndDate ?? '—'} |`)
  }

  return lines.join('\n')
}

export async function handleListPendingWorkItems(
  input: ListPendingWorkItemsInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const result = await resolveAdapter(input.source, adapters, defaultSource).listPendingWorkItems()
  const safeResult: PendingWorkItemsResult = {
    ...result,
    items: result.items.map(sanitizeItem),
  }

  return {
    content: [{ type: 'text' as const, text: formatResult(safeResult) }],
    structuredContent: safeResult as unknown as Record<string, unknown>,
  }
}
