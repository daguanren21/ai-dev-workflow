import { describe, expect, it } from 'vitest'
import { classifyOnesWorkItem, workItemKindLabel } from '../../src/utils/ones-issue-kind'

describe('classifyOnesWorkItem', () => {
  it('classifies by detailType first', () => {
    expect(classifyOnesWorkItem({ detailType: 1, name: '任务' })).toBe('requirement')
    expect(classifyOnesWorkItem({ detailType: 2, name: '需求' })).toBe('task')
    expect(classifyOnesWorkItem({ detailType: 3, name: '需求' })).toBe('defect')
  })

  it('lets a concrete defect subtype override a task parent type', () => {
    expect(classifyOnesWorkItem(
      { detailType: 2, name: '任务' },
      { detailType: 3, name: '缺陷' },
    )).toBe('defect')
  })

  it('falls back to localized type name', () => {
    expect(classifyOnesWorkItem({ name: '需求' })).toBe('requirement')
    expect(classifyOnesWorkItem({ name: '任务' })).toBe('task')
    expect(classifyOnesWorkItem({ name: '缺陷' })).toBe('defect')
    expect(classifyOnesWorkItem({ name: 'bug' })).toBe('defect')
  })

  it('returns unknown when type is missing', () => {
    expect(classifyOnesWorkItem()).toBe('unknown')
    expect(classifyOnesWorkItem({ name: '自定义类型' })).toBe('unknown')
  })

  it('labels kinds for error messages', () => {
    expect(workItemKindLabel('requirement')).toBe('需求')
    expect(workItemKindLabel('task')).toBe('任务')
    expect(workItemKindLabel('defect')).toBe('缺陷')
    expect(workItemKindLabel('unknown')).toBe('未知类型')
  })
})
