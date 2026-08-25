import type { BaseAdapter } from '../../src/adapters/base'
import type { WikiPage } from '../../src/types/wiki'
import { describe, expect, it, vi } from 'vitest'
import { handleApplyWikiWrite, handlePrepareWikiCreate, handlePrepareWikiUpdate, WikiWriteApprovalStore } from '../../src/tools/wiki-write'

function mockPage(overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    pageId: 'page-demo-1',
    teamId: 'team-demo-1',
    spaceId: 'space-demo-1',
    title: 'Annual Goals',
    parentPageId: 'page-demo-parent',
    breadcrumb: ['Example Department', 'Annual Plan', 'Annual Goals'],
    version: 'version-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: [
      '| Goal | Owner | Status |',
      '| --- | --- | --- |',
      '| Example goal | Demo User | Planned |',
    ].join('\n'),
    attachments: [],
    contentHash: 'content-hash-1',
    ...overrides,
  }
}

function mockAdapter(page = mockPage()): BaseAdapter {
  return {
    sourceType: 'ones',
    getWikiPage: vi.fn().mockResolvedValue(page),
    resolveWikiPath: vi.fn().mockResolvedValue({
      teamId: page.teamId,
      spaceId: page.spaceId,
      pageId: page.pageId,
      title: page.title,
      breadcrumb: page.breadcrumb,
    }),
    createWikiPage: vi.fn().mockResolvedValue({
      pageId: 'page-demo-new',
      title: 'Technical Sharing',
      version: 'version-1',
      url: 'https://example.test/wiki/page/page-demo-new',
    }),
    updateWikiPage: vi.fn().mockResolvedValue({
      pageId: page.pageId,
      title: page.title,
      version: 'version-2',
      url: 'https://example.test/wiki/page/page-demo-1',
    }),
  } as unknown as BaseAdapter
}

describe('wiki write safety workflow', () => {
  it('prepares an exact table row without editing', async () => {
    const adapter = mockAdapter()
    const approvals = new WikiWriteApprovalStore()
    const result = await handlePrepareWikiUpdate({
      path: 'Example Department/Annual Plan/Annual Goals',
      operation: {
        type: 'append_table_row',
        tableHeaders: ['Goal', 'Status'],
        row: { Goal: 'Improve example architecture', Status: 'Planned' },
      },
    }, new Map([['ones', adapter]]), approvals, 'ones')

    expect(result.structuredContent.request.operation).toEqual({
      type: 'append_table_row',
      tableHeaders: ['Goal', 'Owner', 'Status'],
      row: {
        Goal: 'Improve example architecture',
        Owner: '',
        Status: 'Planned',
      },
    })
    expect(result.structuredContent.operationHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.content[0].text).toContain(`operationHash: ${result.structuredContent.operationHash}`)
    expect(result.content[0].text).toContain(`approvalToken: ${result.structuredContent.approvalToken}`)
    expect(adapter.updateWikiPage).not.toHaveBeenCalled()
  })

  it('keeps apply disabled by default', async () => {
    const adapter = mockAdapter()
    const approvals = new WikiWriteApprovalStore()
    const prepared = await handlePrepareWikiCreate({
      parentPath: 'Example Department/Knowledge Base',
      title: 'Technical Sharing',
      markdown: 'Anonymous example content.',
    }, new Map([['ones', adapter]]), approvals, 'ones')

    await expect(handleApplyWikiWrite({
      approvalToken: prepared.structuredContent.approvalToken,
      operationHash: prepared.structuredContent.operationHash,
      confirmed: true,
    }, new Map([['ones', adapter]]), approvals, {
      defaultSource: 'ones',
      writesEnabled: false,
      expectedKind: 'create',
    })).rejects.toThrow('writes are disabled')
    expect(adapter.createWikiPage).not.toHaveBeenCalled()
  })

  it('uses a one-time token and rechecks the mock baseline before apply', async () => {
    const adapter = mockAdapter()
    const adapters = new Map([['ones', adapter]])
    const approvals = new WikiWriteApprovalStore()
    const prepared = await handlePrepareWikiUpdate({
      pageId: 'page-demo-1',
      operation: { type: 'append_blocks', markdown: '- Example improvement' },
    }, adapters, approvals, 'ones')
    const input = {
      approvalToken: prepared.structuredContent.approvalToken,
      operationHash: prepared.structuredContent.operationHash,
      confirmed: true as const,
    }

    await handleApplyWikiWrite(input, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
      expectedKind: 'update',
    })
    expect(adapter.getWikiPage).toHaveBeenCalledTimes(2)
    expect(adapter.updateWikiPage).toHaveBeenCalledOnce()

    await expect(handleApplyWikiWrite(input, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
      expectedKind: 'update',
    })).rejects.toThrow('already used')
  })
})
