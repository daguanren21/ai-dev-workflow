import { sanitizeExternalText } from './external-content'

const SENSITIVE_HEADER = /^(?:password|passwd|pwd|passcode|secret|token|api[ _-]?key|access[ _-]?key|private[ _-]?key|cookie|authorization|密码|口令|密钥|令牌)$/i
const KEY_VALUE_SECRET = /((?:password|passwd|pwd|passcode|secret|token|api[ _-]?key|access[ _-]?key|private[ _-]?key|cookie|authorization|密码|口令|密钥|令牌)\s*[:：=]\s*)([^\s|,;]+)/gi
const MAX_WIKI_CONTENT_CHARS = 200_000
const SAFE_WIKI_HTML_TAGS = new Set([
  'a',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ol',
  'p',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
])

export interface WikiTextRun {
  text: string
  attributes: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseWikiTextRun(value: unknown): WikiTextRun | null {
  if (!isRecord(value))
    return null

  const attributes = isRecord(value.attributes) ? value.attributes : {}
  const insert = typeof value.insert === 'string'
    ? value.insert.replace(/\u00A0/g, ' ')
    : ''
  const mentionText = typeof attributes.mentionId === 'string'
    && typeof attributes.text === 'string'
    ? attributes.text.replace(/\u00A0/g, ' ').trim()
    : ''

  return {
    text: mentionText || insert,
    attributes,
  }
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split(/(?<!\\)\|/).map(cell => cell.trim())
}

function isSeparatorRow(line: string): boolean {
  const cells = splitMarkdownRow(line)
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))
}

function renderMarkdownRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

function safeWikiHref(attributes: string): string | null {
  const match = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)
  if (!match)
    return null
  try {
    const url = new URL(match[2])
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return null
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  }
  catch {
    return null
  }
}

function safeWikiSpan(attributes: string, name: 'colspan' | 'rowspan'): number | null {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)`, 'i'))
  if (!match)
    return null
  const value = Number(match[1])
  return Number.isInteger(value) && value > 1 ? Math.min(value, 100) : null
}

function removeWikiControlCharacters(value: string): string {
  let output = ''
  for (const character of value) {
    const code = character.charCodeAt(0)
    const blocked = code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
    if (!blocked)
      output += character
  }
  return output
}

function sanitizeWikiHtml(content: string): string {
  const sanitized = content
    .slice(0, MAX_WIKI_CONTENT_CHARS)
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<(?:script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed)>/gi, '')
    .replace(/<img\b[^>]*>/gi, '[Image omitted]')
    .replace(/<\/?([a-z][\w-]*)\b([^>]*)>/gi, (tag, rawName: string, attributes: string) => {
      const name = rawName.toLowerCase()
      if (!SAFE_WIKI_HTML_TAGS.has(name))
        return ''
      if (tag.startsWith('</'))
        return `</${name}>`
      if (name === 'br')
        return '<br>'
      if (name === 'a') {
        const href = safeWikiHref(attributes)
        return href ? `<a href="${href}">` : '<a>'
      }
      if (name === 'td' || name === 'th') {
        const spans = (['rowspan', 'colspan'] as const)
          .flatMap((spanName) => {
            const value = safeWikiSpan(attributes, spanName)
            return value ? [`${spanName}="${value}"`] : []
          })
        return `<${name}${spans.length ? ` ${spans.join(' ')}` : ''}>`
      }
      return `<${name}>`
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return removeWikiControlCharacters(sanitized)
}

function plainHtmlCellText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, '\'')
    .trim()
}

function redactHtmlTableSecrets(content: string): string {
  return content.replace(/<table>[\s\S]*?<\/table>/gi, (table) => {
    const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)]
    if (rows.length < 2)
      return table

    const sensitiveColumns = new Set<number>()
    let activeRowSpans: number[] = []
    let redacted = table
    for (const [rowIndex, row] of rows.entries()) {
      let column = 0
      const nextRowSpans = activeRowSpans.map(remaining => Math.max(remaining - 1, 0))
      const replacement = row[0].replace(/(<t[dh](?:\s[^>]*)?>)([\s\S]*?)(<\/t[dh]>)/gi, (_cell, open: string, value: string, close: string) => {
        while (activeRowSpans[column] > 0)
          column += 1
        const columnSpan = safeWikiSpan(open, 'colspan') ?? 1
        const rowSpan = safeWikiSpan(open, 'rowspan') ?? 1
        const occupiedColumns = Array.from({ length: columnSpan }, (_, index) => column + index)
        if (rowIndex === 0 && SENSITIVE_HEADER.test(plainHtmlCellText(value))) {
          for (const occupied of occupiedColumns)
            sensitiveColumns.add(occupied)
        }
        if (rowSpan > 1) {
          for (const occupied of occupiedColumns)
            nextRowSpans[occupied] = Math.max(nextRowSpans[occupied] ?? 0, rowSpan - 1)
        }
        const shouldRedact = rowIndex > 0 && occupiedColumns.some(occupied => sensitiveColumns.has(occupied))
        column += columnSpan
        return shouldRedact ? `${open}[REDACTED]${close}` : `${open}${value}${close}`
      })
      redacted = redacted.replace(row[0], replacement)
      activeRowSpans = nextRowSpans
    }
    return sensitiveColumns.size ? redacted : table
  })
}

export function redactWikiSecrets(content: string, revealSecrets = false): string {
  const sanitized = /<table\b/i.test(content)
    ? sanitizeWikiHtml(content)
    : sanitizeExternalText(content)
  if (revealSecrets)
    return sanitized

  const htmlRedacted = redactHtmlTableSecrets(sanitized)

  const lines = htmlRedacted.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const next = lines[index + 1]
    if (!lines[index].includes('|') || !next || !isSeparatorRow(next))
      continue

    const headers = splitMarkdownRow(lines[index])
    const sensitiveColumns = headers
      .map((header, column) => SENSITIVE_HEADER.test(header.replace(/[*_`]/g, '').trim()) ? column : -1)
      .filter(column => column >= 0)
    if (!sensitiveColumns.length)
      continue

    let rowIndex = index + 2
    while (rowIndex < lines.length && lines[rowIndex].includes('|')) {
      const cells = splitMarkdownRow(lines[rowIndex])
      for (const column of sensitiveColumns) {
        if (column < cells.length)
          cells[column] = '[REDACTED]'
      }
      lines[rowIndex] = renderMarkdownRow(cells)
      rowIndex += 1
    }
    index = rowIndex - 1
  }

  return lines.join('\n').replace(KEY_VALUE_SECRET, '$1[REDACTED]')
}

export function findMarkdownTableHeaders(content: string): string[][] {
  const lines = content.split('\n')
  const tables: string[][] = []
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes('|') || !isSeparatorRow(lines[index + 1]))
      continue
    tables.push(splitMarkdownRow(lines[index]).map(header => header.replace(/[*_`]/g, '').trim()))
    index += 1
  }
  return tables
}

export function selectExactTableHeaders(content: string, requestedHeaders: string[] = []): string[] {
  const tables = findMarkdownTableHeaders(content)
  const normalizedRequested = requestedHeaders.map(header => header.trim()).filter(Boolean)
  const matches = normalizedRequested.length
    ? tables.filter(headers => normalizedRequested.every(header => headers.includes(header)))
    : tables

  if (matches.length === 0)
    throw new Error('No table matches the requested headers')
  if (matches.length > 1)
    throw new Error('Multiple tables match; provide enough exact headers to select one table')
  return matches[0]
}

export function normalizeWikiPath(path: string | string[]): string[] {
  const segments = (Array.isArray(path) ? path : path.split('/'))
    .map(segment => segment.trim())
    .filter(Boolean)
  if (!segments.length)
    throw new Error('Wiki path must contain at least one segment')
  if (segments.some(segment => segment === '.' || segment === '..' || segment.includes('\\')))
    throw new Error('Wiki path contains an unsafe segment')
  return segments
}

export function safeWikiFileName(title: string, pageId: string): string {
  const base = title
    .normalize('NFKC')
    .replace(/[\p{Cc}/\\:*?"<>|]/gu, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  const safeId = pageId.replace(/[^\w-]/g, '').slice(0, 32)
  return `${base || 'untitled'}--${safeId || 'page'}.md`
}
