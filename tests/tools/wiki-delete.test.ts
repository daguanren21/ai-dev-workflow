import type { BaseAdapter } from '../../src/adapters/base'
import type { WikiPage } from '../../src/types/wiki'
import { describe, expect, it, vi } from 'vitest'
import { handleDeleteEmptyWikiDuplicates } from '../../src/tools/wiki-delete'

function page(pageId: string, content: string): WikiPage {
  return {
    pageId,
    teamId: 'team-demo',
    spaceId: 'space-demo',
    title: 'Technical Research',
    parentPageId: 'parent-demo',
    breadcrumb: ['Example Department', 'Team Blog', 'Technical Research'],
    version: 'version-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content,
    attachments: [],
    contentHash: `hash-${pageId}`,
  }
}

function adapter(pages: WikiPage[]): BaseAdapter {
  const pagesById = new Map(pages.map(item => [item.pageId, item]))
  return {
    sourceType: 'ones',
    getWikiPage: vi.fn().mockImplementation(async ({ pageId }: { pageId: string }) => pagesById.get(pageId)!),
    deleteWikiPage: vi.fn().mockImplementation(async ({ pageId }: { pageId: string }) => ({ pageId, deleted: true as const })),
  } as unknown as BaseAdapter
}

describe('empty Wiki duplicate cleanup', () => {
  it('keeps the verified page with a body and deletes only title-only siblings', async () => {
    const mockAdapter = adapter([
      page('keep-demo', '# Technical Research\n\n## Scope\n\nVerified body.'),
      page('duplicate-a', '# Technical Research'),
      page('duplicate-b', '# Technical Research'),
    ])

    const result = await handleDeleteEmptyWikiDuplicates({
      keepPageId: 'keep-demo',
      duplicatePageIds: ['duplicate-a', 'duplicate-b'],
      expectedTitle: 'Technical Research',
      confirmed: true,
    }, new Map([['ones', mockAdapter]]), {
      defaultSource: 'ones',
      writesEnabled: true,
    })

    expect(result.structuredContent).toEqual({
      keptPageId: 'keep-demo',
      deletedPageIds: ['duplicate-a', 'duplicate-b'],
    })
    expect(mockAdapter.deleteWikiPage).toHaveBeenCalledTimes(2)
    expect(mockAdapter.deleteWikiPage).toHaveBeenNthCalledWith(1, {
      teamId: 'team-demo',
      spaceId: 'space-demo',
      pageId: 'duplicate-a',
    })
    expect(mockAdapter.deleteWikiPage).toHaveBeenNthCalledWith(2, {
      teamId: 'team-demo',
      spaceId: 'space-demo',
      pageId: 'duplicate-b',
    })
  })

  it('fails closed when a duplicate contains additional content', async () => {
    const mockAdapter = adapter([
      page('keep-demo', '# Technical Research\n\n## Scope\n\nVerified body.'),
      page('duplicate-with-body', '# Technical Research\n\nDo not delete.'),
    ])

    await expect(handleDeleteEmptyWikiDuplicates({
      keepPageId: 'keep-demo',
      duplicatePageIds: ['duplicate-with-body'],
      expectedTitle: 'Technical Research',
      confirmed: true,
    }, new Map([['ones', mockAdapter]]), {
      defaultSource: 'ones',
      writesEnabled: true,
    })).rejects.toThrow('is not empty')
    expect(mockAdapter.deleteWikiPage).not.toHaveBeenCalled()
  })
})
