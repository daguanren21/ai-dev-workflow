import type { BaseAdapter } from '../../src/adapters/base'
import type { WikiPage } from '../../src/types/wiki'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleExportOnesWikiTree, handleGetOnesWikiPage, handleLookupEnvironmentAccess } from '../../src/tools/wiki-read'
import { WikiPathResolutionError } from '../../src/types/wiki'

const temporaryDirectories: string[] = []

function page(overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    pageId: 'page-demo-root',
    teamId: 'team-demo',
    spaceId: 'space-demo',
    title: 'Anonymous Runbook',
    parentPageId: null,
    breadcrumb: ['Example Space', 'Anonymous Runbook'],
    version: 'version-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: [
      '| Environment | Account | Password |',
      '| --- | --- | --- |',
      '| sandbox | demo-user | mock-password-value |',
    ].join('\n'),
    attachments: [{
      id: 'attachment-demo',
      name: 'example.png',
      url: 'https://example.test/resource?token=mock-signed-value',
      mimeType: 'image/png',
      size: 1,
    }],
    contentHash: 'content-hash-root',
    ...overrides,
  }
}

function adapter(): BaseAdapter {
  const pages = new Map([
    ['page-demo-root', page()],
    ['page-demo-child', page({
      pageId: 'page-demo-child',
      title: 'Child Page',
      parentPageId: 'page-demo-root',
      breadcrumb: ['Example Space', 'Anonymous Runbook', 'Child Page'],
      content: 'Safe child content.',
      attachments: [],
      contentHash: 'content-hash-child',
    })],
  ])
  return {
    sourceType: 'ones',
    getWikiPage: vi.fn().mockImplementation(async ({ pageId }: { pageId: string }) => pages.get(pageId)!),
    resolveWikiPath: vi.fn().mockResolvedValue({
      teamId: 'team-demo',
      spaceId: 'space-demo',
      pageId: 'page-demo-root',
      title: 'Anonymous Runbook',
      breadcrumb: ['Example Space', 'Annual Plans', 'Anonymous Runbook'],
    }),
    searchWikiPages: vi.fn().mockResolvedValue([{ ...page(), content: undefined, attachments: undefined, contentHash: undefined }]),
    listWikiPageChildren: vi.fn().mockImplementation(async ({ pageId }: { pageId: string }) => pageId === 'page-demo-root'
      ? [{ ...pages.get('page-demo-child')!, content: undefined, attachments: undefined, contentHash: undefined }]
      : []),
  } as unknown as BaseAdapter
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('wiki read tools', () => {
  it('redacts page secrets and signed attachment URLs by default', async () => {
    const result = await handleGetOnesWikiPage({
      pageId: 'page-demo-root',
      revealSensitiveSecrets: false,
    }, new Map([['ones', adapter()]]), 'ones')

    expect(result.content[0].text).toContain('[REDACTED]')
    expect(JSON.stringify(result)).not.toContain('mock-password-value')
    expect(JSON.stringify(result)).not.toContain('mock-signed-value')
    expect(result.structuredContent.attachments[0].url).toBe('')
  })

  it('resolves and reads a Wiki page directly from a hierarchical path', async () => {
    const mockAdapter = adapter()
    const result = await handleGetOnesWikiPage({
      path: 'Example Space/Annual Plans/2026',
      revealSensitiveSecrets: false,
    }, new Map([['ones', mockAdapter]]), 'ones')

    expect(mockAdapter.resolveWikiPath).toHaveBeenCalledWith({
      path: ['Example Space', 'Annual Plans', '2026'],
      teamId: undefined,
      spaceId: undefined,
    })
    expect(mockAdapter.getWikiPage).toHaveBeenCalledWith({
      pageId: 'page-demo-root',
      url: undefined,
      teamId: 'team-demo',
      spaceId: 'space-demo',
    })
    expect(result.structuredContent.title).toBe('Anonymous Runbook')
  })

  it('returns candidate options when a Wiki path has no exact match', async () => {
    const mockAdapter = adapter()
    vi.mocked(mockAdapter.resolveWikiPath).mockRejectedValueOnce(new WikiPathResolutionError(
      'not_found',
      ['Frontend Department', '2026 Annual Plan'],
      [
        {
          pageId: 'page-goals',
          teamId: 'team-demo',
          spaceId: 'space-demo',
          title: '2026 Annual Plan Goals',
          parentPageId: 'annual-plans',
          breadcrumb: ['Frontend Department', 'Annual Plans', '2026 Annual Plan Goals'],
          version: 'version-2',
          updatedAt: '2026-08-21T09:42:00.000Z',
        },
        {
          pageId: 'page-plan',
          teamId: 'team-demo',
          spaceId: 'space-demo',
          title: '2026 Annual Plan',
          parentPageId: null,
          breadcrumb: ['Frontend Department', '2026 Annual Plan'],
          version: 'version-1',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    ))

    const result = await handleGetOnesWikiPage({
      path: 'Frontend Department/2026 Annual Plan',
      revealSensitiveSecrets: false,
    }, new Map([['ones', mockAdapter]]), 'ones')

    expect(mockAdapter.getWikiPage).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      status: 'needs_confirmation',
      reason: 'not_found',
      requestedPath: ['Frontend Department', '2026 Annual Plan'],
      totalCandidates: 2,
      candidates: [
        { pageId: 'page-goals', breadcrumb: ['Frontend Department', 'Annual Plans', '2026 Annual Plan Goals'] },
        { pageId: 'page-plan', breadcrumb: ['Frontend Department', '2026 Annual Plan'] },
      ],
    })
    expect(result.content[0].text).toContain('call get_ones_wiki_page again with its pageId')
    expect(result.content[0].text).toContain('pageId: page-goals')
  })

  it('keeps a converted Wiki HTML table intact in the public tool result', async () => {
    const mockAdapter = adapter()
    vi.mocked(mockAdapter.getWikiPage).mockResolvedValueOnce(page({
      content: '<table><tbody><tr><td>Goal</td><td>Owner</td></tr><tr><td>Example</td><td>@Example Owner</td></tr></tbody></table>',
    }))

    const result = await handleGetOnesWikiPage({
      pageId: 'page-demo-root',
      revealSensitiveSecrets: false,
    }, new Map([['ones', mockAdapter]]), 'ones')

    expect(result.structuredContent.content).toContain('<table>')
    expect(result.structuredContent.content).toContain('<tr>')
    expect(result.structuredContent.content).toContain('@Example Owner')
  })

  it('exports an incremental mock subtree without persisting signed URLs', async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'ones-wiki-mock-'))
    temporaryDirectories.push(outputDirectory)
    const mockAdapter = adapter()
    const adapters = new Map([['ones', mockAdapter]])

    const first = await handleExportOnesWikiTree({
      rootPageId: 'page-demo-root',
      outputDirectory,
      maxPages: 10,
      revealSensitiveSecrets: false,
    }, adapters, 'ones')
    const second = await handleExportOnesWikiTree({
      rootPageId: 'page-demo-root',
      outputDirectory,
      maxPages: 10,
      revealSensitiveSecrets: false,
    }, adapters, 'ones')

    expect(first.structuredContent).toMatchObject({ pages: 2, written: 2, unchanged: 0 })
    expect(second.structuredContent).toMatchObject({ pages: 2, written: 0, unchanged: 2 })
    const manifest = await readFile(path.join(outputDirectory, '.ones-wiki-export.json'), 'utf8')
    const rootFile = JSON.parse(manifest).pages['page-demo-root'].relativePath
    const exported = await readFile(path.join(outputDirectory, rootFile), 'utf8')
    expect(exported).toContain('[REDACTED]')
    expect(exported).not.toContain('mock-password-value')
    expect(exported).not.toContain('mock-signed-value')
  })

  it('keeps environment access secrets redacted unless explicitly requested', async () => {
    const mockAdapter = adapter()
    const adapters = new Map([['ones', mockAdapter]])
    const redacted = await handleLookupEnvironmentAccess({
      project: 'Example Project',
      environment: 'sandbox',
      revealSecrets: false,
    }, adapters, 'ones')
    const revealed = await handleLookupEnvironmentAccess({
      project: 'Example Project',
      environment: 'sandbox',
      revealSecrets: true,
    }, adapters, 'ones')

    expect(JSON.stringify(redacted)).not.toContain('mock-password-value')
    expect(JSON.stringify(revealed)).toContain('mock-password-value')
  })
})
