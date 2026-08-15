import type { BaseAdapter } from '../../src/adapters/base.js'
import type { Requirement } from '../../src/types/requirement.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGetWorkItem } from '../../src/tools/get-work-item.js'

const mockRequirement: Requirement = {
  id: 'TEST-001',
  source: 'ones',
  title: 'Test Requirement',
  description: 'A test description',
  status: 'open',
  priority: 'high',
  type: 'feature',
  labels: ['test'],
  reporter: 'reporter',
  assignee: 'assignee',
  createdAt: '2025-02-01T00:00:00.000Z',
  updatedAt: '2025-02-02T00:00:00.000Z',
  dueDate: '2025-02-28',
  attachments: [],
  raw: {},
}

function createMockAdapter(overrides?: Partial<Requirement>): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn().mockResolvedValue({ ...mockRequirement, ...overrides }),
    classifyRemoteImageUrl: vi.fn((url: string) =>
      new URL(url).origin === 'https://ones.test' ? 'configured-origin' : 'untrusted'),
    searchRequirements: vi.fn(),
  } as unknown as BaseAdapter
}

describe('handleGetWorkItem', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return formatted requirement text', async () => {
    const result = await handleGetWorkItem({ id: 'TEST-001' }, adapters, 'ones')

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('# Test Requirement')
    expect(result.content[0].text).toContain('TEST-001')
    expect(result.content[0].text).toContain('open')
    expect(result.content[0].text).toContain('high')
  })

  it('should use explicit source over default', async () => {
    adapters.set('ones', createMockAdapter({ id: 'ONES-001' }))

    const result = await handleGetWorkItem(
      { id: 'ONES-001', source: 'ones' },
      adapters,
      'ones',
    )

    expect(result.content[0].text).toContain('ONES-001')
  })

  it('should throw if no source specified and no default', async () => {
    await expect(
      handleGetWorkItem({ id: 'TEST-001' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })

  it('should throw if source not configured', async () => {
    await expect(
      handleGetWorkItem({ id: 'TEST-001', source: 'nonexistent' }, adapters, undefined),
    ).rejects.toThrow('not configured')
  })

  it('should include attachments in output', async () => {
    adapters.set('ones', createMockAdapter({
      attachments: [
        { id: 'a1', name: 'doc.pdf', url: 'https://example.com/doc.pdf', mimeType: 'application/pdf', size: 1024 },
      ],
    }))

    const result = await handleGetWorkItem({ id: 'TEST-001' }, adapters, 'ones')

    expect(result.content[0].text).toContain('doc.pdf')
    expect(result.content[0].text).toContain('Attachments')
  })

  it('should return MCP image content for image attachments without exposing wiki tokens in text', async () => {
    const imageBytes = new Uint8Array([
      0x89,
      0x50,
      0x4E,
      0x47,
      0x0D,
      0x0A,
      0x1A,
      0x0A,
    ])
    const fetchMock = vi.fn().mockResolvedValue(new Response(imageBytes, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    adapters.set('ones', createMockAdapter({
      attachments: [
        {
          id: 'wiki-image-1',
          name: 'order.png',
          url: 'https://ones.test/wiki/api/wiki/editor/team-1/ref-1/resources/order.png?token=mock-wiki-token',
          mimeType: 'image/png',
          size: 0,
        },
      ],
    }))

    const result = await handleGetWorkItem({ id: 'TEST-001' }, adapters, 'ones')

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://ones.test/wiki/api/wiki/editor/team-1/ref-1/resources/order.png?token=mock-wiki-token'),
      expect.objectContaining({ redirect: 'manual' }),
    )
    expect(result.content).toHaveLength(2)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('order.png')
    expect(result.content[0].text).not.toContain('mock-wiki-token')
    expect(result.content[1]).toEqual({
      type: 'image',
      data: Buffer.from(imageBytes).toString('base64'),
      mimeType: 'image/png',
    })
  })
})
