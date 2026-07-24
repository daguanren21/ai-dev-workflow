import { describe, expect, it } from 'vitest'
import { formatDraftMarkdown } from '../../../plugins/codex-workflow-assistant/scripts/src/lib/format.ts'

describe('draft formatter', () => {
  it('formats pending and over-cap drafts with benchmark information', () => {
    const markdown = formatDraftMarkdown({
      date: '2026-06-15',
      entries: [
        {
          draftId: 'draft-a',
          requirementId: '96706',
          hours: 4,
          description: 'Development work for requirement 96706',
          confidence: 'high',
          capStatus: 'within-cap',
          evidence: ['commits:1'],
          status: 'pending',
          benchmark: {
            category: '前端-新增组件',
            work: '新增通用/业务组件',
            complexity: 'simple',
            limitHours: 4,
          },
        },
        {
          draftId: 'draft-b',
          requirementId: '96800',
          hours: 8,
          description: 'Development work for requirement 96800',
          confidence: 'medium',
          capStatus: 'over-cap',
          evidence: ['commits:2'],
          status: 'pending',
          benchmark: {
            category: '后端-新增CRUD模块',
            work: '新增 CRUD 模块',
            complexity: 'medium',
            limitHours: 16,
          },
        },
      ],
      unmatched: [{ type: 'commit', title: 'refactor table rendering' }],
    })

    expect(markdown).toContain('Timesheet Draft: 2026-06-15')
    expect(markdown).toContain('draft-a')
    expect(markdown).toContain('前端-新增组件')
    expect(markdown).toContain('4h')
    expect(markdown).toContain('over-cap')
    expect(markdown).toContain('refactor table rendering')
  })
})
