import type { BaseAdapter } from '../adapters/base'
import type { WikiPage } from '../types/wiki'
import crypto from 'node:crypto'
import { z } from 'zod/v4'

const SourceSchema = z.string().trim().min(1).optional()

export const DeleteEmptyWikiDuplicatesSchema = z.object({
  keepPageId: z.string().trim().min(1),
  duplicatePageIds: z.array(z.string().trim().min(1)).min(1).max(20),
  expectedTitle: z.string().trim().min(1),
  confirmed: z.literal(true).describe('Set true only after the user confirms the exact keep and delete page IDs immediately before submission.'),
  source: SourceSchema,
})

export const DeleteEmptyWikiDuplicatesOutputSchema = z.object({
  keptPageId: z.string(),
  deletedPageIds: z.array(z.string()),
})

type DeleteEmptyWikiDuplicatesInput = z.infer<typeof DeleteEmptyWikiDuplicatesSchema>

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

function assertCleanupTarget(keep: WikiPage, duplicates: WikiPage[], expectedTitle: string): void {
  if (keep.title !== expectedTitle)
    throw new Error('The retained Wiki page title no longer matches the confirmed title')
  if (keep.content.trim() === `# ${keep.title}`)
    throw new Error('The retained Wiki page does not contain a body')

  for (const duplicate of duplicates) {
    if (duplicate.title !== expectedTitle)
      throw new Error(`Wiki duplicate ${duplicate.pageId} title no longer matches the confirmed title`)
    if (duplicate.teamId !== keep.teamId || duplicate.spaceId !== keep.spaceId || duplicate.parentPageId !== keep.parentPageId)
      throw new Error(`Wiki duplicate ${duplicate.pageId} is not a sibling of the retained page`)
    if (duplicate.content.trim() !== `# ${duplicate.title}`)
      throw new Error(`Wiki duplicate ${duplicate.pageId} is not empty and will not be deleted`)
  }
}

export async function handleDeleteEmptyWikiDuplicates(
  input: DeleteEmptyWikiDuplicatesInput,
  adapters: Map<string, BaseAdapter>,
  options: { defaultSource?: string, writesEnabled: boolean },
) {
  if (!options.writesEnabled)
    throw new Error('Wiki writes are disabled. Enable both ONES_WIKI_ENABLE_WRITES=true and source option wikiWrites=true.')

  const uniqueDuplicateIds = [...new Set(input.duplicatePageIds)]
  if (uniqueDuplicateIds.length !== input.duplicatePageIds.length)
    throw new Error('duplicatePageIds contains repeated page IDs')
  if (uniqueDuplicateIds.includes(input.keepPageId))
    throw new Error('The retained Wiki page cannot also be deleted')

  const { adapter } = resolveAdapter(input.source, adapters, options.defaultSource)
  const [keep, ...duplicates] = await Promise.all([
    adapter.getWikiPage({ pageId: input.keepPageId }),
    ...uniqueDuplicateIds.map(pageId => adapter.getWikiPage({ pageId })),
  ])
  assertCleanupTarget(keep, duplicates, input.expectedTitle)
  const spaceId = keep.spaceId
  if (!spaceId)
    throw new Error('The retained Wiki page space could not be verified')

  const operationHash = crypto.createHash('sha256').update(JSON.stringify({
    keepPageId: input.keepPageId,
    duplicatePageIds: uniqueDuplicateIds,
    expectedTitle: input.expectedTitle,
    baselines: [keep, ...duplicates].map(page => ({
      pageId: page.pageId,
      version: page.version,
      contentHash: page.contentHash,
    })),
  })).digest('hex')

  for (const duplicate of duplicates) {
    await adapter.deleteWikiPage({
      teamId: duplicate.teamId,
      spaceId,
      pageId: duplicate.pageId,
    })
  }

  const result = {
    keptPageId: keep.pageId,
    deletedPageIds: duplicates.map(page => page.pageId),
  }
  return {
    content: [{
      type: 'text' as const,
      text: `Kept Wiki page ${result.keptPageId} and deleted empty duplicates: ${result.deletedPageIds.join(', ')}.\noperationHash: ${operationHash}`,
    }],
    structuredContent: result,
  }
}
