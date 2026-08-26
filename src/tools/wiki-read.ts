import type { BaseAdapter } from '../adapters/base'
import type { WikiPage, WikiPageSummary } from '../types/wiki'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod/v4'
import { WikiPathResolutionError } from '../types/wiki'
import { sanitizeExternalInline, UNTRUSTED_SOURCE_NOTICE } from '../utils/external-content'
import { normalizeWikiPath, redactWikiSecrets, safeWikiFileName } from '../utils/wiki-content'

const WikiSourceSchema = z.string().trim().min(1).optional()

export const GetOnesWikiPageSchema = z.object({
  pageId: z.string().trim().min(1).optional(),
  url: z.string().url().optional(),
  path: z.union([
    z.string().trim().min(1),
    z.array(z.string().trim().min(1)).min(1),
  ]).optional().describe('Wiki path such as "Department/Annual Plans/2026". Exact self-reference segments such as "我的", "我", "me", or "my" resolve the authenticated user through ONES token info without exposing the display name. Resolves a unique exact, title-prefix, or confidently close match; otherwise returns candidate pages for confirmation.'),
  teamId: z.string().trim().min(1).optional(),
  spaceId: z.string().trim().min(1).optional(),
  revealSensitiveSecrets: z.boolean().default(false).describe('Default false. Set true only when the user explicitly asks to reveal secrets.'),
  source: WikiSourceSchema,
}).refine(value => Boolean(value.pageId || value.url || value.path), 'pageId, url, or path is required')

export const SearchOnesWikiSchema = z.object({
  query: z.string().trim().min(1),
  teamId: z.string().trim().min(1).optional(),
  spaceId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  source: WikiSourceSchema,
})

export const ExportOnesWikiTreeSchema = z.object({
  rootPageId: z.string().trim().min(1),
  outputDirectory: z.string().trim().min(1),
  teamId: z.string().trim().min(1).optional(),
  spaceId: z.string().trim().min(1).optional(),
  maxPages: z.number().int().min(1).max(2000).default(500),
  revealSensitiveSecrets: z.boolean().default(false),
  source: WikiSourceSchema,
})

export const LookupEnvironmentAccessSchema = z.object({
  project: z.string().trim().min(1),
  environment: z.string().trim().min(1),
  revealSecrets: z.boolean().default(false).describe('Default false. Set true only after an explicit user request for the secret value.'),
  source: WikiSourceSchema,
})

type GetOnesWikiPageInput = z.infer<typeof GetOnesWikiPageSchema>
type SearchOnesWikiInput = z.infer<typeof SearchOnesWikiSchema>
type ExportOnesWikiTreeInput = z.infer<typeof ExportOnesWikiTreeSchema>
type LookupEnvironmentAccessInput = z.infer<typeof LookupEnvironmentAccessSchema>

function resolveAdapter(
  source: string | undefined,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
): { sourceType: string, adapter: BaseAdapter } {
  const sourceType = source ?? defaultSource
  if (!sourceType)
    throw new Error('No source specified and no default source configured')
  const adapter = adapters.get(sourceType)
  if (!adapter)
    throw new Error(`Source "${sourceType}" is not configured`)
  return { sourceType, adapter }
}

function sanitizedSummary(page: WikiPageSummary): WikiPageSummary {
  return {
    ...page,
    title: sanitizeExternalInline(page.title),
    breadcrumb: page.breadcrumb.map(sanitizeExternalInline),
  }
}

const MAX_WIKI_PATH_CANDIDATES = 10

function unresolvedWikiPathResult(error: WikiPathResolutionError) {
  const requestedPath = error.requestedPath.map(sanitizeExternalInline)
  const candidates = error.candidates.slice(0, MAX_WIKI_PATH_CANDIDATES).map(sanitizedSummary)
  const reason = error.reason === 'ambiguous'
    ? 'matched multiple pages'
    : 'did not match an exact page'
  return {
    content: [{
      type: 'text' as const,
      text: [
        `Wiki path ${requestedPath.join(' / ')} ${reason}.`,
        'Select the intended page and call get_ones_wiki_page again with its pageId:',
        ...candidates.map((page) => {
          const updatedAt = page.updatedAt ? `; updated ${page.updatedAt}` : ''
          return `- ${page.breadcrumb.join(' / ') || page.title} (pageId: ${page.pageId}${updatedAt})`
        }),
      ].join('\n'),
    }],
    structuredContent: {
      status: 'needs_confirmation' as const,
      reason: error.reason,
      requestedPath,
      candidates,
      totalCandidates: error.candidates.length,
    },
  }
}

function publicPage(page: WikiPage, revealSensitiveSecrets: boolean): WikiPage {
  return {
    ...sanitizedSummary(page),
    contentHash: page.contentHash,
    content: redactWikiSecrets(page.content, revealSensitiveSecrets),
    attachments: page.attachments.map(attachment => ({
      ...attachment,
      name: sanitizeExternalInline(attachment.name),
      // Signed attachment URLs can contain short-lived secrets and are hidden by default.
      url: revealSensitiveSecrets ? attachment.url : '',
    })),
  }
}

export async function handleGetOnesWikiPage(
  input: GetOnesWikiPageInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const { adapter } = resolveAdapter(input.source, adapters, defaultSource)
  let resolved = null
  if (input.path) {
    try {
      resolved = await adapter.resolveWikiPath({
        path: normalizeWikiPath(input.path),
        teamId: input.teamId,
        spaceId: input.spaceId,
      })
    }
    catch (error) {
      if (error instanceof WikiPathResolutionError && error.candidates.length)
        return unresolvedWikiPathResult(error)
      throw error
    }
  }
  const page = publicPage(await adapter.getWikiPage({
    pageId: resolved?.pageId ?? input.pageId,
    url: input.url,
    teamId: resolved?.teamId ?? input.teamId,
    spaceId: resolved?.spaceId ?? input.spaceId,
  }), input.revealSensitiveSecrets)
  if (resolved) {
    page.title = resolved.title
    page.breadcrumb = resolved.breadcrumb
    const redactPrivateValues = resolved.redactPrivateValues
    if (redactPrivateValues) {
      page.content = redactPrivateValues(page.content)
      page.attachments = page.attachments.map(attachment => ({
        ...attachment,
        name: redactPrivateValues(attachment.name),
        url: redactPrivateValues(attachment.url),
      }))
    }
  }
  return {
    content: [{
      type: 'text' as const,
      text: [
        `# ${page.title}`,
        '',
        UNTRUSTED_SOURCE_NOTICE,
        '',
        page.content || '(Empty page)',
      ].join('\n'),
    }],
    structuredContent: page,
  }
}

export async function handleSearchOnesWiki(
  input: SearchOnesWikiInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const { adapter } = resolveAdapter(input.source, adapters, defaultSource)
  const pages = (await adapter.searchWikiPages(input)).slice(0, input.limit).map(sanitizedSummary)
  return {
    content: [{
      type: 'text' as const,
      text: pages.length
        ? pages.map(page => `- ${page.breadcrumb.join(' / ') || page.title} (${page.pageId})`).join('\n')
        : 'No matching Wiki pages.',
    }],
    structuredContent: { pages },
  }
}

interface ExportManifest {
  schemaVersion: 1
  rootPageId: string
  pages: Record<string, {
    contentHash: string
    version: string | null
    updatedAt: string | null
    relativePath: string
  }>
}

async function loadManifest(file: string): Promise<ExportManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as ExportManifest
    return parsed.schemaVersion === 1 ? parsed : null
  }
  catch {
    return null
  }
}

async function atomicWrite(file: string, content: string): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  await rename(temporary, file)
}

export async function handleExportOnesWikiTree(
  input: ExportOnesWikiTreeInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  if (!path.isAbsolute(input.outputDirectory))
    throw new Error('outputDirectory must be an absolute path')
  const outputDirectory = path.resolve(input.outputDirectory)
  const { adapter } = resolveAdapter(input.source, adapters, defaultSource)
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 })

  const manifestFile = path.join(outputDirectory, '.ones-wiki-export.json')
  const previous = await loadManifest(manifestFile)
  const manifest: ExportManifest = { schemaVersion: 1, rootPageId: input.rootPageId, pages: {} }
  const pending = [input.rootPageId]
  const visited = new Set<string>()
  let written = 0
  let unchanged = 0

  while (pending.length) {
    const pageId = pending.shift()!
    if (visited.has(pageId))
      continue
    if (visited.size >= input.maxPages)
      throw new Error(`Wiki export exceeded maxPages=${input.maxPages}`)
    visited.add(pageId)

    const page = publicPage(await adapter.getWikiPage({
      pageId,
      teamId: input.teamId,
      spaceId: input.spaceId,
    }), input.revealSensitiveSecrets)
    const relativePath = safeWikiFileName(page.title, page.pageId)
    const file = path.join(outputDirectory, relativePath)
    if (!file.startsWith(`${outputDirectory}${path.sep}`))
      throw new Error('Resolved export path escapes outputDirectory')

    manifest.pages[page.pageId] = {
      contentHash: page.contentHash,
      version: page.version,
      updatedAt: page.updatedAt,
      relativePath,
    }
    if (previous?.pages[page.pageId]?.contentHash === page.contentHash) {
      unchanged += 1
    }
    else {
      await atomicWrite(file, `# ${page.title}\n\n${page.content}\n`)
      written += 1
    }

    const children = await adapter.listWikiPageChildren({
      pageId,
      teamId: page.teamId,
      spaceId: page.spaceId ?? undefined,
    })
    for (const child of children)
      pending.push(child.pageId)
  }

  await atomicWrite(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  const result = { outputDirectory, pages: visited.size, written, unchanged }
  return {
    content: [{ type: 'text' as const, text: `Exported ${result.pages} pages: ${written} written, ${unchanged} unchanged.` }],
    structuredContent: result,
  }
}

function excerpt(content: string, query: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  const index = normalized.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  const start = Math.max(0, index < 0 ? 0 : index - 80)
  return normalized.slice(start, start + 320)
}

export async function handleLookupEnvironmentAccess(
  input: LookupEnvironmentAccessInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const { adapter } = resolveAdapter(input.source, adapters, defaultSource)
  const query = `${input.project} ${input.environment}`
  const matches = await adapter.searchWikiPages({ query, limit: 10 })
  const pages = await Promise.all(matches.map(page => adapter.getWikiPage({
    pageId: page.pageId,
    teamId: page.teamId,
    spaceId: page.spaceId ?? undefined,
  })))
  const results = pages.map(page => ({
    pageId: page.pageId,
    title: sanitizeExternalInline(page.title),
    breadcrumb: page.breadcrumb.map(sanitizeExternalInline),
    excerpt: excerpt(redactWikiSecrets(page.content, input.revealSecrets), input.environment),
  }))
  return {
    content: [{
      type: 'text' as const,
      text: results.length
        ? results.map(result => `## ${result.title}\n${result.excerpt}`).join('\n\n')
        : 'No matching environment access page was found.',
    }],
    structuredContent: {
      project: sanitizeExternalInline(input.project),
      environment: sanitizeExternalInline(input.environment),
      secretsRevealed: input.revealSecrets,
      results,
    },
  }
}

export function parseWikiPathInput(pathInput: string): string[] {
  return normalizeWikiPath(pathInput)
}
