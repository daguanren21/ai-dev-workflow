import type { BaseAdapter } from '../../src/adapters/base.js'
import type { AddManhourResult } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleAddManhour } from '../../src/tools/add-manhour.js'

const mockResult: AddManhourResult = {
  key: 'manhour-demo-key',
  taskUuid: 'work-item-demo-uuid',
  hours: 2,
  description: 'anonymous work log',
  date: null,
}

function createMockAdapter(result: AddManhourResult = mockResult): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn(),
    searchRequirements: vi.fn(),
    getRelatedIssues: vi.fn(),
    getIssueDetail: vi.fn(),
    getTestcases: vi.fn(),
    addManhour: vi.fn().mockResolvedValue(result),
    updateTaskPlanDates: vi.fn(),
  } as unknown as BaseAdapter
}

describe('handleAddManhour', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should add manhour and return formatted output', async () => {
    const result = await handleAddManhour({
      taskId: 'work-item-demo-uuid',
      hours: 2,
      description: 'anonymous work log',
    }, adapters, 'ones')

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toContain('Added manhour')
    expect(result.content[0].text).toContain('work-item-demo-uuid')
    expect(result.content[0].text).toContain('2')
    expect(result.content[0].text).toContain('anonymous work log')
  })

  it('should pass explicit source to the selected adapter', async () => {
    const onesAdapter = createMockAdapter()
    adapters.set('ones', onesAdapter)

    await handleAddManhour({
      taskId: 'work-item-demo-uuid',
      hours: 1,
      description: 'anonymous source selection',
      source: 'ones',
    }, adapters, undefined)

    expect(onesAdapter.addManhour).toHaveBeenCalledWith({
      taskId: 'work-item-demo-uuid',
      hours: 1,
      description: 'anonymous source selection',
    })
  })

  it('should pass optional work date to the selected adapter and format it', async () => {
    const onesAdapter = createMockAdapter({
      ...mockResult,
      date: '2026-06-11',
    })
    adapters.set('ones', onesAdapter)

    const result = await handleAddManhour({
      taskId: 'work-item-demo-uuid',
      hours: 1,
      description: 'anonymous dated work log',
      date: '11号',
    }, adapters, 'ones')

    expect(onesAdapter.addManhour).toHaveBeenCalledWith({
      taskId: 'work-item-demo-uuid',
      hours: 1,
      description: 'anonymous dated work log',
      date: '11号',
    })
    expect(result.content[0].text).toContain('2026-06-11')
  })

  it('should throw if no source specified and no default exists', async () => {
    await expect(handleAddManhour({
      taskId: 'work-item-demo-uuid',
      hours: 1,
      description: 'anonymous work log',
    }, adapters, undefined)).rejects.toThrow('No source specified')
  })
})
