import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleGetRequirement } from '../../src/tools/get-requirement.js'
import type { BaseAdapter } from '../../src/adapters/base.js'
import type { Requirement } from '../../src/types/requirement.js'

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
    searchRequirements: vi.fn(),
  } as unknown as BaseAdapter
}

describe('handleGetRequirement', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should return formatted requirement text', async () => {
    const result = await handleGetRequirement({ id: 'TEST-001' }, adapters, 'ones')

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('# Test Requirement')
    expect(result.content[0].text).toContain('TEST-001')
    expect(result.content[0].text).toContain('open')
    expect(result.content[0].text).toContain('high')
  })

  it('should use explicit source over default', async () => {
    adapters.set('ones', createMockAdapter({ id: 'ONES-001' }))

    const result = await handleGetRequirement(
      { id: 'ONES-001', source: 'ones' },
      adapters,
      'ones',
    )

    expect(result.content[0].text).toContain('ONES-001')
  })

  it('should throw if no source specified and no default', async () => {
    await expect(
      handleGetRequirement({ id: 'TEST-001' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })

  it('should throw if source not configured', async () => {
    await expect(
      handleGetRequirement({ id: 'TEST-001', source: 'nonexistent' }, adapters, undefined),
    ).rejects.toThrow('not configured')
  })

  it('should include attachments in output', async () => {
    adapters.set('ones', createMockAdapter({
      attachments: [
        { id: 'a1', name: 'doc.pdf', url: 'https://example.com/doc.pdf', mimeType: 'application/pdf', size: 1024 },
      ],
    }))

    const result = await handleGetRequirement({ id: 'TEST-001' }, adapters, 'ones')

    expect(result.content[0].text).toContain('doc.pdf')
    expect(result.content[0].text).toContain('Attachments')
  })
})
