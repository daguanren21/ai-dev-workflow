import { describe, expect, it } from 'vitest'
import { parseTaskDocument } from '../src/parser.js'

describe('parseTaskDocument', () => {
  it('parses a parent context and numbered child tasks', () => {
    const result = parseTaskDocument('REQ-100001 Parent improvement\n1. Investigate issue - 3h\n2. Implement fix - 5h')
    expect(result.tasks).toHaveLength(3)
    expect(result.tasks[0].title).toBe('REQ-100001 Parent improvement')
    expect(result.tasks[1].parentId).toBe(result.tasks[0].id)
    expect(result.tasks[1].estimateHours).toBe(3)
    expect(result.tasks[2].estimateHours).toBe(5)
  })

  it('keeps multiple related keys and parses a date range', () => {
    const result = parseTaskDocument('REQ-100001&REQ-100002\n1. Delivery work - 8h - 7/15-7/16')
    expect(result.tasks[1].requirementKeys).toEqual(['REQ-100001', 'REQ-100002'])
    expect(result.tasks[1].planStartDate).toBe(`${new Date().getFullYear()}-07-15`)
    expect(result.tasks[1].planEndDate).toBe(`${new Date().getFullYear()}-07-16`)
  })

  it('preserves unrecognized fragments as warnings and source text', () => {
    const result = parseTaskDocument('REQ-100001 Parent\n1. Review unknown-format')
    expect(result.tasks[1].sourceText).toContain('Review unknown-format')
    expect(result.tasks[1].warnings.length).toBeGreaterThan(0)
    expect(result.tasks[1].confidence).toBe('low')
  })

  it('ignores total-hour summaries and extracts inline tasks with dotted dates', () => {
    const result = parseTaskDocument('开发总工时6h - 问题排查（7.14，7.15 1h） 开发自测（7.15 3h）')

    expect(result.tasks).toHaveLength(2)
    expect(result.tasks.map(task => task.title)).toEqual(['问题排查', '开发自测'])
    expect(result.tasks[0].estimateHours).toBe(1)
    expect(result.tasks[0].planStartDate).toBe(`${new Date().getFullYear()}-07-14`)
    expect(result.tasks[0].planEndDate).toBe(`${new Date().getFullYear()}-07-15`)
    expect(result.tasks[1].estimateHours).toBe(3)
    expect(result.tasks[1].planStartDate).toBe(`${new Date().getFullYear()}-07-15`)
    expect(result.tasks[1].planEndDate).toBe(`${new Date().getFullYear()}-07-15`)
  })

  it('parses the recommended ISO date format', () => {
    const result = parseTaskDocument('REQ-100001 Requirement title\nInvestigation - 1h - 2026-07-14~2026-07-15')

    expect(result.tasks[1].planStartDate).toBe('2026-07-14')
    expect(result.tasks[1].planEndDate).toBe('2026-07-15')
    expect(result.tasks[1].title).toBe('REQ-100001 Investigation')
  })
})
