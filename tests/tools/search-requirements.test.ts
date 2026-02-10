import type { BaseAdapter } from '../../src/adapters/base.js'
import type { SearchResult } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSearchRequirements } from '../../src/tools/search-requirements.js'

const mockSearchResult: SearchResult = {
  items: [
    {
      id: 'TEST-001',
      source: 'ones',
      title: 'Test Feature',
      description: 'A test description that is moderately long',
      status: 'open',
      priority: 'high',
      type: 'feature',
      labels: ['test'],
      reporter: 'reporter',
      assignee: 'assignee',
      createdAt: '2025-02-01T00:00:00.000Z',
      updatedAt: '2025-02-02T00:00:00.000Z',
      dueDate: null,
      attachments: [],
      raw: {},
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

function createMockAdapter(result?: SearchResult): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn(),
    searchRequirements: vi.fn().mockResolvedValue(result ?? mockSearchResult),
  } as unknown as BaseAdapter
}

describe('handleSearchRequirements', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should return formatted search results', async () => {
    const result = await handleSearchRequirements({ query: 'test' }, adapters, 'ones')

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('1')
    expect(result.content[0].text).toContain('TEST-001')
    expect(result.content[0].text).toContain('Test Feature')
  })

  it('should handle empty results', async () => {
    adapters.set('ones', createMockAdapter({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    }))

    const result = await handleSearchRequirements({ query: 'none' }, adapters, 'ones')

    expect(result.content[0].text).toContain('0')
  })

  it('should truncate long descriptions', async () => {
    const longDesc = 'A'.repeat(300)
    adapters.set('ones', createMockAdapter({
      items: [{
        ...mockSearchResult.items[0],
        description: longDesc,
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    }))

    const result = await handleSearchRequirements({ query: 'test' }, adapters, 'ones')

    expect(result.content[0].text).toContain('...')
    // Should not contain the full 300-char string
    expect(result.content[0].text.length).toBeLessThan(longDesc.length + 500)
  })

  it('should throw if source not available', async () => {
    await expect(
      handleSearchRequirements({ query: 'test', source: 'nonexistent' }, adapters, undefined),
    ).rejects.toThrow('not configured')
  })
})
