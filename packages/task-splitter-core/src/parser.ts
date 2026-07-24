import type { Confidence, DraftDocument, DraftTask } from './model.js'

const KEY_RE = /\b[A-Z][A-Z0-9]{1,15}-\d{1,12}\b/g
const HOUR_RE = /(?:^|[\s-])(\d+(?:\.\d+)?)[ \t]*(?:h|hr|hrs|hour|hours)\b/i
const DATE_TOKEN_RE = /(?:(\d{4})[-/])?(\d{1,2})[./月-](\d{1,2})日?/g
const NUMBERED_RE = /^\s*(\d+)[.、)]\s*(.{1,500})$/
const TOTAL_HOURS_PREFIX_RE = /^\s*(?:开发|预计|合计|总计)?总工时[ \t]*\d+(?:\.\d+)?[ \t]*(?:h|小时)[ \t]*[-—–:：]?[ \t]*/i
const TOTAL_HOURS_LINE_RE = /^\s*(?:开发|预计|合计|总计)?总工时[ \t]*\d+(?:\.\d+)?[ \t]*(?:h|小时)[ \t]*$/i
const INLINE_TASK_RE = /([^（）()\n]+)[（(]([^（）()\n]+)[）)]/g

function dateValue(month: string, day: string, explicitYear?: string): string {
  const year = explicitYear ?? String(new Date().getFullYear())
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function keysFrom(text: string): string[] {
  return [...new Set(text.match(KEY_RE) ?? [])]
}

function parseDates(text: string): { start: string | null, end: string | null } {
  const matches = [...text.matchAll(DATE_TOKEN_RE)]
  if (matches.length === 0)
    return { start: null, end: null }
  const first = matches[0]
  const last = matches.at(-1) ?? first
  return { start: dateValue(first[2], first[3], first[1]), end: dateValue(last[2], last[3], last[1]) }
}

function inputLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .flatMap((rawLine) => {
      const line = rawLine.trim()
      if (!line || TOTAL_HOURS_LINE_RE.test(line))
        return []
      const withoutSummary = line.replace(TOTAL_HOURS_PREFIX_RE, '')
      const inlineTasks = [...withoutSummary.matchAll(INLINE_TASK_RE)]
      if (inlineTasks.length < 2)
        return [withoutSummary]
      return inlineTasks.map(match => `${match[1].trim()} (${match[2].trim()})`)
    })
    .filter(Boolean)
}

function createTask(id: string, parentId: string | null, text: string, inheritedKeys: string[] = []): DraftTask {
  const keys = keysFrom(text)
  const requirementKeys = keys.length > 0 ? keys : inheritedKeys
  const hourMatch = text.match(HOUR_RE)
  const estimateHours = hourMatch ? Number(hourMatch[1]) : null
  const dates = parseDates(text)
  const numbered = text.match(NUMBERED_RE)
  const titleSource = numbered ? numbered[2] : text
  const title = titleSource
    .replace(KEY_RE, '')
    .replace(HOUR_RE, '')
    .replace(DATE_TOKEN_RE, '')
    .replace(/[（）(),，]/g, ' ')
    .replace(/\s+(?:[-—–:：~～]\s*)+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:：-]+|[\s:：-]+$/g, '')
    .trim()
  const warnings: string[] = []
  if (estimateHours === null)
    warnings.push('missing-estimate-hours')
  if (title.length === 0)
    warnings.push('missing-title')
  const confidence: Confidence = warnings.length === 0 ? (keys.length > 0 || inheritedKeys.length > 0 ? 'high' : 'medium') : 'low'
  const primaryKey = requirementKeys[0]
  return {
    id,
    parentId,
    requirementKeys,
    title: primaryKey && !title.startsWith(primaryKey) ? `${primaryKey} ${title}` : title,
    estimateHours,
    planStartDate: dates.start,
    planEndDate: dates.end,
    notes: '',
    sourceText: text,
    confidence,
    warnings,
    status: 'draft',
    onesTaskId: null,
    errorMessage: null,
  }
}

export function parseTaskDocument(rawText: string, sourceName = 'pasted-text'): DraftDocument {
  const lines = inputLines(rawText)
  const tasks: DraftTask[] = []
  let parent: DraftTask | null = null
  let contextKeys: string[] = []

  for (const line of lines) {
    const numbered = NUMBERED_RE.test(line)
    const lineKeys = keysFrom(line)
    if (!numbered && (lineKeys.length > 0 || tasks.length === 0)) {
      const task = createTask(`task-${tasks.length + 1}`, null, line, lineKeys)
      tasks.push(task)
      parent = task
      contextKeys = task.requirementKeys
      continue
    }
    const task = createTask(`task-${tasks.length + 1}`, parent?.id ?? null, line, [...contextKeys, ...lineKeys])
    tasks.push(task)
  }

  const now = new Date().toISOString()
  return { id: `draft-${Date.now()}`, sourceName, rawText, tasks, createdAt: now, updatedAt: now }
}
