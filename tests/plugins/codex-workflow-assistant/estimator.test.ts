import { describe, expect, it } from 'vitest'
import {
  applyDailyCap,
  estimateRequirementWork,
  splitDraftByBenchmark,
} from '../../../plugins/codex-workflow-assistant/scripts/src/lib/estimator.ts'

describe('work-hour estimator', () => {
  it('estimates a small code change as the simple benchmark minimum for the matched work type', () => {
    const draft = estimateRequirementWork({
      requirementId: '96706',
      confidence: 'medium',
      benchmarkCategory: '前端-新增组件',
      complexity: 'simple',
      commits: [{ total: 25, additions: 20, deletions: 5 }],
      mergeRequests: [],
      manualNotes: [],
    })

    expect(draft.hours).toBe(4)
    expect(draft.description).toBe('Development work for requirement 96706')
    expect(draft.reviewRequired).toBe(false)
    expect(draft.benchmark.category).toBe('前端-新增组件')
  })

  it('caps one task to the selected benchmark and splits excess into parallel tasks', () => {
    const tasks = splitDraftByBenchmark({
      requirementId: '96706',
      totalHours: 36,
      benchmarkCategory: '后端-新增CRUD模块',
      complexity: 'medium',
      description: 'Development work for requirement 96706',
      evidence: ['manual:implementation:36h'],
      confidence: 'high',
    })

    expect(tasks.map(task => task.hours)).toEqual([16, 16, 4])
    expect(tasks.every(task => task.hours <= task.benchmark.limitHours)).toBe(true)
    expect(tasks[0].splitIndex).toBe(1)
    expect(tasks[2].splitTotal).toBe(3)
  })

  it('uses manual note hours as explicit evidence but still honors benchmark splits', () => {
    const draft = estimateRequirementWork({
      requirementId: '96706',
      confidence: 'high',
      benchmarkCategory: '前端-新增组件',
      complexity: 'medium',
      commits: [],
      mergeRequests: [],
      manualNotes: [{ hours: 10, kind: 'self-test', description: 'self-test' }],
    })

    expect(draft.hours).toBe(8)
    expect(draft.splitOverflowHours).toBe(2)
    expect(draft.evidence).toContain('manual:self-test:10h')
  })

  it('marks entries over the daily cap', () => {
    const entries = applyDailyCap([
      { draftId: 'a', hours: 5 },
      { draftId: 'b', hours: 4 },
    ], 8)

    expect(entries[0].capStatus).toBe('within-cap')
    expect(entries[1].capStatus).toBe('over-cap')
  })
})
