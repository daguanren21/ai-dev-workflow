import type { WikiUpdateOperation } from '../../types/wiki'

import { randomBytes } from 'node:crypto'
import { parseWikiTextRun } from '../../utils/wiki-content'

export interface WikiRenderContext {
  imageSources: string[]
}

interface OnesWikiBlock {
  [key: string]: unknown
  id?: string
  type?: string
  heading?: number
  text?: unknown
  ordered?: boolean
  level?: number
  start?: number
  embedType?: string
  embedData?: unknown
  children?: unknown
  rows?: number
  cols?: number
}

interface WikiTableCellPlacement {
  childId: string
  row: number
  column: number
  rowSpan: number
  colSpan: number
}

interface WikiTableLayout {
  columnCount: number
  rows: WikiTableCellPlacement[][]
  hasMergedCells: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : null
  }
  catch {
    return null
  }
}

function asWikiBlocks(value: unknown): OnesWikiBlock[] {
  if (!Array.isArray(value))
    return []

  return value.filter(isRecord) as OnesWikiBlock[]
}

function renderWikiTextRuns(value: unknown): string {
  if (!Array.isArray(value))
    return ''

  return value
    .map((run) => {
      const parsed = parseWikiTextRun(run)
      if (!parsed)
        return ''

      const { attributes, text } = parsed
      const link = typeof attributes.link === 'string' ? attributes.link : ''

      if (link && text.trim())
        return `[${text}](${link})`

      const taskName = typeof attributes.taskName === 'string' ? attributes.taskName : ''
      if (link && taskName)
        return `[${taskName}](${link})`

      return text
    })
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function renderWikiHeading(text: string, heading: number | undefined): string {
  if (!heading)
    return text

  const level = Math.min(Math.max(Math.trunc(heading), 1), 6)
  return `${'#'.repeat(level)} ${text}`
}

function getWikiImageSource(block: OnesWikiBlock): string {
  const embedData = isRecord(block.embedData) ? block.embedData : {}
  return typeof embedData.src === 'string' ? embedData.src.trim() : ''
}

function renderWikiEmbed(block: OnesWikiBlock, context: WikiRenderContext): string {
  if (block.embedType === 'image') {
    const src = getWikiImageSource(block)
    if (src && !context.imageSources.includes(src))
      context.imageSources.push(src)

    return src ? `[Image: ${src}]` : '[Image]'
  }

  return block.embedType ? `[Embed: ${block.embedType}]` : ''
}

function escapeWikiTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/[ \t]*\n+[ \t]*/g, ' ').trim()
}

function escapeWikiHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseWikiTableSpan(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return 1

  return Math.max(Math.trunc(value), 1)
}

function buildWikiTableLayout(block: OnesWikiBlock): WikiTableLayout | null {
  const columnCount = typeof block.cols === 'number' && block.cols > 0
    ? Math.trunc(block.cols)
    : 0
  const children = Array.isArray(block.children)
    ? block.children.filter((child): child is string => typeof child === 'string')
    : []

  if (!columnCount || !children.length)
    return null

  const hasDeclaredRows = typeof block.rows === 'number' && block.rows > 0
  const initialRowCount = hasDeclaredRows
    ? Math.trunc(block.rows as number)
    : Math.max(Math.ceil(children.length / columnCount), 1)
  const occupied: boolean[][] = []
  const rows: WikiTableCellPlacement[][] = []
  const ensureRowCount = (count: number) => {
    while (occupied.length < count) {
      occupied.push(Array.from<boolean>({ length: columnCount }).fill(false))
      rows.push([])
    }
  }
  ensureRowCount(initialRowCount)
  let cursor = 0
  let hasMergedCells = false

  for (const childId of children) {
    while (true) {
      const row = Math.floor(cursor / columnCount)
      const column = cursor % columnCount
      ensureRowCount(row + 1)
      if (!occupied[row]![column])
        break
      cursor += 1
    }

    const row = Math.floor(cursor / columnCount)
    const column = cursor % columnCount
    const requestedRowSpan = parseWikiTableSpan(block[`${childId}_rowSpan`])
    if (!hasDeclaredRows)
      ensureRowCount(row + requestedRowSpan)
    const rowSpan = Math.min(requestedRowSpan, occupied.length - row)
    const colSpan = Math.min(
      parseWikiTableSpan(block[`${childId}_colSpan`]),
      columnCount - column,
    )
    hasMergedCells ||= rowSpan > 1 || colSpan > 1
    rows[row]!.push({ childId, row, column, rowSpan, colSpan })

    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1)
        occupied[row + rowOffset]![column + columnOffset] = true
    }
    cursor += 1
  }

  return { columnCount, rows, hasMergedCells }
}

function wikiCellContainsTable(value: unknown): boolean {
  return asWikiBlocks(value).some(block => block.type === 'table')
}

function renderWikiTextRunsHtml(value: unknown): string {
  if (!Array.isArray(value))
    return ''

  return value.map((run) => {
    const parsed = parseWikiTextRun(run)
    if (!parsed)
      return ''

    const { attributes, text } = parsed
    let content = escapeWikiHtml(text).replace(/\n/g, '<br>')

    if (attributes.code)
      content = `<code>${content}</code>`
    if (attributes.bold)
      content = `<strong>${content}</strong>`
    if (attributes.italic)
      content = `<em>${content}</em>`
    if (attributes.underline)
      content = `<u>${content}</u>`
    if (attributes.strike)
      content = `<s>${content}</s>`

    const link = typeof attributes.link === 'string' ? attributes.link : ''
    return link ? `<a href="${escapeWikiHtml(link)}">${content}</a>` : content
  }).join('')
}

function renderWikiCellHtml(
  value: unknown,
  document: Record<string, unknown>,
  context: WikiRenderContext,
): string {
  return asWikiBlocks(value)
    .map(block => renderWikiBlockHtml(block, document, context))
    .filter(Boolean)
    .join('')
}

function renderWikiBlockHtml(
  block: OnesWikiBlock,
  document: Record<string, unknown>,
  context: WikiRenderContext,
): string {
  if (block.type === 'table') {
    const layout = buildWikiTableLayout(block)
    return layout ? renderWikiTableHtml(layout, document, context) : ''
  }

  if (block.type === 'embed')
    return `<p>${escapeWikiHtml(renderWikiEmbed(block, context))}</p>`

  const text = renderWikiTextRunsHtml(block.text)
  if (!text)
    return ''

  if (block.type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul'
    return `<${tag}><li>${text}</li></${tag}>`
  }

  if (block.heading) {
    const level = Math.min(Math.max(Math.trunc(block.heading), 1), 6)
    return `<h${level}>${text}</h${level}>`
  }

  return `<p>${text}</p>`
}

function renderWikiTableHtml(
  layout: WikiTableLayout,
  document: Record<string, unknown>,
  context: WikiRenderContext,
): string {
  const rows = layout.rows.map((row) => {
    const cells = row.map((cell) => {
      const attributes = [
        cell.rowSpan > 1 ? `rowspan="${cell.rowSpan}"` : '',
        cell.colSpan > 1 ? `colspan="${cell.colSpan}"` : '',
      ].filter(Boolean)
      const content = renderWikiCellHtml(document[cell.childId], document, context)
      return `<td${attributes.length ? ` ${attributes.join(' ')}` : ''}>${content}</td>`
    })
    return `<tr>\n${cells.join('\n')}\n</tr>`
  })

  return `<table>\n<tbody>\n${rows.join('\n')}\n</tbody>\n</table>`
}

function renderWikiCell(value: unknown, document: Record<string, unknown>, context: WikiRenderContext): string {
  const blocks = asWikiBlocks(value)
  if (!blocks.length)
    return ''

  return blocks
    .map(block => renderWikiBlock(block, document, context))
    .filter(Boolean)
    .join(' ')
    .replace(/[ \t]*\n+[ \t]*/g, ' ')
    .trim()
}

function renderWikiTable(block: OnesWikiBlock, document: Record<string, unknown>, context: WikiRenderContext): string {
  const layout = buildWikiTableLayout(block)
  if (!layout)
    return ''

  const hasNestedTable = layout.rows.some(row => row.some(
    cell => wikiCellContainsTable(document[cell.childId]),
  ))

  if (layout.hasMergedCells || hasNestedTable)
    return renderWikiTableHtml(layout, document, context)

  const rows: string[] = []
  for (const row of layout.rows) {
    const cells = Array.from<string>({ length: layout.columnCount }).fill('')
    for (const cell of row)
      cells[cell.column] = escapeWikiTableCell(renderWikiCell(document[cell.childId], document, context))
    rows.push(`| ${cells.join(' | ')} |`)
  }

  if (rows.length > 1)
    rows.splice(1, 0, `| ${Array.from<string>({ length: layout.columnCount }).fill('---').join(' | ')} |`)

  return rows.join('\n')
}

function renderWikiBlock(block: OnesWikiBlock, document: Record<string, unknown>, context: WikiRenderContext): string {
  if (block.type === 'table')
    return renderWikiTable(block, document, context)

  if (block.type === 'embed')
    return renderWikiEmbed(block, context)

  const text = renderWikiTextRuns(block.text)
  if (!text)
    return ''

  if (block.type === 'list') {
    const level = typeof block.level === 'number' ? Math.max(Math.trunc(block.level), 1) : 1
    const indent = '  '.repeat(level - 1)
    const marker = block.ordered ? `${block.start ?? 1}.` : '-'
    return `${indent}${marker} ${text}`
  }

  return renderWikiHeading(text, block.heading)
}

export function renderWikiContent(content: string, context: WikiRenderContext = { imageSources: [] }): string {
  const trimmed = content.trim()
  if (!trimmed)
    return ''

  const document = parseJsonRecord(trimmed)
  if (!document || !('blocks' in document))
    return trimmed

  return asWikiBlocks(document.blocks)
    .map(block => renderWikiBlock(block, document, context))
    .filter(Boolean)
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function newWikiBlockId(): string {
  for (;;) {
    const id = randomBytes(9).toString('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 9)
    if (/^[a-z][a-z0-9]{8}$/i.test(id))
      return id
  }
}

function markdownTextRuns(text: string): Array<{ insert: string, attributes?: { 'link'?: string, 'style-code'?: boolean } }> {
  if (!text)
    return []

  const runs: Array<{ insert: string, attributes?: { 'link'?: string, 'style-code'?: boolean } }> = []
  const inlinePattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`/g
  let cursor = 0
  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index ?? 0
    if (index > cursor)
      runs.push({ insert: text.slice(cursor, index) })
    if (match[1] && match[2])
      runs.push({ insert: match[1], attributes: { link: match[2] } })
    else if (match[3])
      runs.push({ insert: match[3], attributes: { 'style-code': true } })
    cursor = index + match[0].length
  }
  if (cursor < text.length)
    runs.push({ insert: text.slice(cursor) })
  return runs.length ? runs : [{ insert: text }]
}

function wikiTextBlock(
  text: string,
  options: { heading?: number, list?: boolean, ordered?: boolean, level?: number, start?: number, groupId?: string } = {},
): OnesWikiBlock {
  return {
    id: newWikiBlockId(),
    type: options.list ? 'list' : 'text',
    text: markdownTextRuns(text),
    ...(options.heading ? { heading: options.heading } : {}),
    ...(options.list
      ? {
          ordered: options.ordered ?? false,
          level: options.level ?? 1,
          ...(options.start === undefined ? {} : { start: options.start }),
          ...(options.groupId ? { groupId: options.groupId } : {}),
        }
      : {}),
  }
}

function parseMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(cell => cell.trim().replace(/\\\|/g, '|'))
}

function isMarkdownSeparatorRow(line: string): boolean {
  const cells = parseMarkdownRow(line)
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))
}

function estimateWikiTableCellWidth(value: string): number {
  return [...value].reduce((width, character) => width + (character.codePointAt(0)! > 0x7F ? 14 : 7), 24)
}

export function markdownToWikiDocument(markdown: string): Record<string, unknown> {
  const document: Record<string, unknown> = { blocks: [], comments: {}, meta: {} }
  const blocks = document.blocks as OnesWikiBlock[]
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let activeList: { ordered: boolean, groupId: string, nextStart: number } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim()) {
      activeList = null
      continue
    }
    if (line.includes('|') && lines[index + 1] && isMarkdownSeparatorRow(lines[index + 1])) {
      activeList = null
      const rows = [parseMarkdownRow(line)]
      index += 2
      while (index < lines.length && lines[index].includes('|')) {
        rows.push(parseMarkdownRow(lines[index]))
        index += 1
      }
      index -= 1
      const columnCount = Math.max(...rows.map(row => row.length))
      const children: string[] = []
      for (const row of rows) {
        for (let column = 0; column < columnCount; column += 1) {
          const cellId = newWikiBlockId()
          children.push(cellId)
          document[cellId] = [wikiTextBlock(row[column] ?? '')]
        }
      }
      blocks.push({
        id: newWikiBlockId(),
        type: 'table',
        cols: columnCount,
        rows: rows.length,
        colsWidth: Array.from({ length: columnCount }, (_, column) => Math.max(
          100,
          ...rows.map(row => estimateWikiTableCellWidth(row[column] ?? '')),
        )),
        children,
      })
      continue
    }

    const heading = line.match(/^(#{1,6})[ \t]/)
    if (heading?.[1]) {
      activeList = null
      blocks.push(wikiTextBlock(line.slice(heading[0].length).trim(), { heading: heading[1].length }))
      continue
    }
    const unordered = line.match(/^[ \t]*[-*+][ \t]/)
    if (unordered) {
      const groupId: string = activeList && !activeList.ordered ? activeList.groupId : newWikiBlockId()
      const start: number = activeList && !activeList.ordered ? activeList.nextStart : 1
      activeList = { ordered: false, groupId, nextStart: start + 1 }
      blocks.push(wikiTextBlock(line.slice(unordered[0].length).trim(), { list: true, groupId, start }))
      continue
    }
    const ordered = line.match(/^[ \t]*(\d+)[.)][ \t]/)
    if (ordered?.[1]) {
      const groupId: string = activeList?.ordered ? activeList.groupId : newWikiBlockId()
      const start = Number.parseInt(ordered[1], 10)
      activeList = { ordered: true, groupId, nextStart: start + 1 }
      blocks.push(wikiTextBlock(line.slice(ordered[0].length).trim(), {
        list: true,
        ordered: true,
        start,
        groupId,
      }))
      continue
    }
    activeList = null
    blocks.push(wikiTextBlock(line))
  }

  return document
}

export function markdownToWikiHtml(markdown: string): string {
  const renderInline = (text: string) => markdownTextRuns(text)
    .map((run) => {
      const escaped = escapeWikiHtml(run.insert)
      const content = run.attributes?.['style-code'] ? `<code>${escaped}</code>` : escaped
      return run.attributes?.link
        ? `<a href="${escapeWikiHtml(run.attributes.link)}" target="_blank" rel="noopener noreferrer">${content}</a>`
        : content
    })
    .join('')
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim())
      continue

    if (line.includes('|') && lines[index + 1] && isMarkdownSeparatorRow(lines[index + 1])) {
      const rows = [parseMarkdownRow(line)]
      index += 2
      while (index < lines.length && lines[index].includes('|')) {
        rows.push(parseMarkdownRow(lines[index]))
        index += 1
      }
      index -= 1
      const columnCount = Math.max(...rows.map(row => row.length))
      const width = Math.floor(100 / columnCount)
      const header = Array.from<string>({ length: columnCount })
        .map((_, column) => `<th style="width:${width}%">${renderInline(rows[0][column] ?? '')}</th>`)
        .join('')
      const body = rows.slice(1)
        .map(row => `<tr>${Array.from<string>({ length: columnCount }).map((_, column) => `<td>${renderInline(row[column] ?? '')}</td>`).join('')}</tr>`)
        .join('')
      html.push(`<table style="width:100%"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`)
      continue
    }

    const heading = line.match(/^(#{1,6})[ \t]/)
    if (heading?.[1]) {
      const level = heading[1].length
      html.push(`<h${level}>${renderInline(line.slice(heading[0].length).trim())}</h${level}>`)
      continue
    }

    const ordered = line.match(/^[ \t]*(\d+)[.)][ \t]/)
    if (ordered?.[1]) {
      const items: Array<{ value: number, text: string }> = []
      while (index < lines.length) {
        const item = lines[index].match(/^[ \t]*(\d+)[.)][ \t]/)
        if (!item?.[1])
          break
        items.push({
          value: Number.parseInt(item[1], 10),
          text: lines[index].slice(item[0].length).trim(),
        })
        index += 1
      }
      index -= 1
      html.push(`<ol start="${items[0].value}">${items.map(item => `<li>${renderInline(item.text)}</li>`).join('')}</ol>`)
      continue
    }

    const unordered = line.match(/^[ \t]*[-*+][ \t]/)
    if (unordered) {
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index].match(/^[ \t]*[-*+][ \t]/)
        if (!item)
          break
        items.push(lines[index].slice(item[0].length).trim())
        index += 1
      }
      index -= 1
      html.push(`<ul>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`)
      continue
    }

    html.push(`<p>${renderInline(line.trim())}</p>`)
  }

  return html.join('\n')
}

export function parseWikiDocument(content: string): Record<string, unknown> {
  const document = parseJsonRecord(content)
  if (!document || !Array.isArray(document.blocks))
    throw new Error('ONES: Wiki content is not a supported collaborative document')
  if (!document.comments || typeof document.comments !== 'object')
    document.comments = {}
  if (!document.meta || typeof document.meta !== 'object')
    document.meta = {}
  return document
}

function appendWikiDocument(target: Record<string, unknown>, fragment: Record<string, unknown>): void {
  const targetBlocks = target.blocks as unknown[]
  const fragmentBlocks = fragment.blocks as unknown[]
  for (const [key, value] of Object.entries(fragment)) {
    if (key !== 'blocks' && key !== 'comments' && key !== 'meta')
      target[key] = value
  }
  targetBlocks.push(...fragmentBlocks)
}

function replaceWikiText(document: Record<string, unknown>, find: string, replace: string): void {
  let occurrences = 0
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object')
      return
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'insert' && typeof nested === 'string') {
        const count = nested.split(find).length - 1
        if (count) {
          occurrences += count
          ;(value as Record<string, unknown>)[key] = nested.replaceAll(find, replace)
        }
      }
      else {
        visit(nested)
      }
    }
  }
  visit(document)
  if (occurrences !== 1)
    throw new Error(`ONES: replace_text must match exactly one raw text run; found ${occurrences}`)
}

function appendWikiTableRow(document: Record<string, unknown>, operation: Extract<WikiUpdateOperation, { type: 'append_table_row' }>): void {
  const matches: Array<{ table: OnesWikiBlock, layout: WikiTableLayout }> = []
  for (const table of asWikiBlocks(document.blocks).filter(block => block.type === 'table')) {
    const layout = buildWikiTableLayout(table)
    if (!layout?.rows[0])
      continue
    const headers = layout.rows[0].map(cell => renderWikiCell(document[cell.childId], document, { imageSources: [] }).trim())
    if (headers.length === operation.tableHeaders.length && headers.every((header, index) => header === operation.tableHeaders[index]))
      matches.push({ table, layout })
  }
  if (matches.length !== 1)
    throw new Error(`ONES: append_table_row requires one exact raw table match; found ${matches.length}`)

  const { table, layout } = matches[0]
  const children = Array.isArray(table.children) ? table.children.filter((child): child is string => typeof child === 'string') : []
  for (let column = 0; column < layout.columnCount; column += 1) {
    const cellId = newWikiBlockId()
    const header = operation.tableHeaders[column]
    children.push(cellId)
    document[cellId] = [wikiTextBlock(operation.row[header] ?? '')]
  }
  table.children = children
  table.rows = (typeof table.rows === 'number' ? table.rows : layout.rows.length) + 1
}

export function applyWikiUpdateOperation(content: string, operation: WikiUpdateOperation): string {
  if (operation.type === 'replace_document') {
    const current = parseWikiDocument(content)
    const replacement = markdownToWikiDocument(operation.markdown)
    for (const key of ['comments', 'meta', 'authors', 'commentators']) {
      if (Object.hasOwn(current, key))
        replacement[key] = current[key]
    }
    return JSON.stringify(replacement)
  }

  const document = parseWikiDocument(content)
  if (operation.type === 'append_blocks')
    appendWikiDocument(document, markdownToWikiDocument(operation.markdown))
  else if (operation.type === 'replace_text')
    replaceWikiText(document, operation.find, operation.replace)
  else
    appendWikiTableRow(document, operation)
  return JSON.stringify(document)
}

export function mimeTypeFromFileName(fileName: string): string {
  const normalized = fileName.toLowerCase()
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg'))
    return 'image/jpeg'
  if (normalized.endsWith('.gif'))
    return 'image/gif'
  if (normalized.endsWith('.webp'))
    return 'image/webp'
  if (normalized.endsWith('.svg'))
    return 'image/svg+xml'

  return 'image/png'
}

export function attachmentNameFromPath(path: string): string {
  const name = path.split('/').pop() || path
  try {
    return decodeURIComponent(name)
  }
  catch {
    return name
  }
}
