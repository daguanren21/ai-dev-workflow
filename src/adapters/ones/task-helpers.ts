import type { Attachment, Requirement } from '../../types/requirement'
import type { OnesWorkItemKind } from '../../utils/ones-issue-kind'
import type { OnesRelatedTask, OnesTaskNode } from './types'
import { mapOnesPriority, mapOnesStatus, mapOnesType } from '../../utils/map-status'
import { classifyOnesWorkItem, workItemKindLabel } from '../../utils/ones-issue-kind'

export function encodeOnesPathIdentifier(value: string, label: string): string {
  if (!/^[\w-]{1,128}$/.test(value))
    throw new Error(`ONES: Invalid ${label}`)
  return encodeURIComponent(value)
}

export function parseDisplayId(input: string): { identifier: string, number: number } | null {
  const match = input.trim().match(/^([a-z]\w*)-(\d+)$/i)
  if (!match?.[1] || !match[2])
    return null
  return { identifier: match[1], number: Number.parseInt(match[2], 10) }
}

export function isValidOnesDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const [yearText, monthText, dayText] = value.split('-')
  const year = Number.parseInt(yearText, 10)
  const month = Number.parseInt(monthText, 10)
  const day = Number.parseInt(dayText, 10)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function getTaskDetailText(task: OnesTaskNode): string {
  return task.descriptionText?.trim()
    || htmlToPlainText(task.desc_rich ?? task.description ?? '')
}

export function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim())
      return value.trim()
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value)
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function taskInfoFieldValue(record: Record<string, unknown>, fieldUuid: string): string | null {
  const direct = record[fieldUuid]
  if (typeof direct === 'string' && direct.trim())
    return direct.trim()
  const collections = [record.field_values, record.fieldValues, record.fields]
  for (const collection of collections) {
    if (Array.isArray(collection)) {
      for (const entry of collection) {
        if (!isRecord(entry) || firstString(entry, ['field_uuid', 'fieldUuid', 'uuid']) !== fieldUuid)
          continue
        const value = firstString(entry, ['date_value', 'dateValue', 'value', 'field_value', 'fieldValue'])
        if (value)
          return value
      }
    }
    else if (isRecord(collection)) {
      const entry = collection[fieldUuid]
      if (typeof entry === 'string' && entry.trim())
        return entry.trim()
      if (isRecord(entry)) {
        const value = firstString(entry, ['date_value', 'dateValue', 'value', 'field_value', 'fieldValue'])
        if (value)
          return value
      }
    }
  }
  return null
}

export function taskInfoDate(record: Record<string, unknown>, kind: 'start' | 'end'): string | null {
  const value = kind === 'start'
    ? firstString(record, ['planStartDate', 'plan_start_date', 'plan_start']) ?? taskInfoFieldValue(record, 'field027')
    : firstString(record, ['planEndDate', 'plan_end_date', 'plan_end']) ?? taskInfoFieldValue(record, 'field028')
  if (!value)
    return null
  if (isValidOnesDate(value))
    return value
  const unixSeconds = Number(value)
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0)
    return null
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

export function taskInfoHours(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      return value / 100000
  }
  return null
}

export function inferredParentDisplayId(task: OnesTaskNode, info: Record<string, unknown>): string | null {
  const explicit = firstString(info, ['parent_display_id', 'parentDisplayId'])
  if (explicit)
    return explicit
  return task.name.trim().match(/^([A-Z][A-Z0-9]*-\d+)\b/i)?.[1]?.toUpperCase() ?? null
}

export function compareNullableDate(left: string | null, right: string | null): number {
  if (left === right)
    return 0
  if (left === null)
    return 1
  if (right === null)
    return -1
  return left.localeCompare(right)
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await mapper(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

export function taskInfoDetail(record: Record<string, unknown>, fallback: OnesRelatedTask): string {
  const text = firstString(record, ['descriptionText', 'description_text'])
  if (text)
    return text
  const rich = firstString(record, ['desc_rich', 'description', 'desc'])
  return rich ? htmlToPlainText(rich) : getTaskDetailText(fallback as OnesTaskNode)
}

export function taskDisplayId(
  info: Record<string, unknown>,
  task: Pick<OnesRelatedTask, 'number'>,
  fallbackIdentifier: string | null,
): string {
  return firstString(info, ['displayId', 'display_id'])
    ?? (fallbackIdentifier ? `${fallbackIdentifier}-${task.number}` : `#${task.number}`)
}

export function unsupportedWorkItemToolError(
  id: string,
  kind: OnesWorkItemKind,
  tool: string,
  nextTool: string,
): Error {
  return new Error(
    `ONES: "${id}" is a ${workItemKindLabel(kind)} (${kind}). ${tool} does not apply. Use ${nextTool} instead.`,
  )
}

function mapOnesTypeFromTask(task: OnesTaskNode): Requirement['type'] {
  const kind = classifyOnesWorkItem(task.issueType, task.subIssueType)
  if (kind === 'requirement')
    return 'feature'
  if (kind === 'defect')
    return 'bug'
  if (kind === 'task')
    return 'task'
  return mapOnesType(task.subIssueType?.name ?? task.issueType?.name ?? '')
}

export function toRequirement(
  task: OnesTaskNode,
  description = '',
  attachments: Attachment[] = [],
): Requirement {
  return {
    id: task.uuid,
    source: 'ones',
    title: `#${task.number} ${task.name}`,
    description,
    status: mapOnesStatus(task.status?.category ?? 'to_do'),
    priority: mapOnesPriority(task.priority?.value ?? 'normal'),
    type: mapOnesTypeFromTask(task),
    labels: [],
    reporter: '',
    assignee: task.assign?.name ?? null,
    createdAt: '',
    updatedAt: '',
    dueDate: null,
    attachments,
    raw: task as unknown as Record<string, unknown>,
  }
}
