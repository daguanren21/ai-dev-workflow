import { describe, expect, it } from 'vitest'
import { matchRequirementIds } from '../../../plugins/codex-workflow-assistant/scripts/src/lib/matcher.ts'

describe('requirement matcher', () => {
  it('matches requirement id from merge request branch with high confidence', () => {
    const result = matchRequirementIds({
      commits: [],
      mergeRequests: [{
        title: 'vxe table optimization',
        sourceBranch: 'req/96706-vxe-table-optimization',
      }],
    })

    expect(result.matches).toEqual([{
      requirementId: '96706',
      confidence: 'high',
      sources: ['merge_request.sourceBranch'],
    }])
  })

  it('matches requirement id from commit messages with medium confidence', () => {
    const result = matchRequirementIds({
      commits: [{
        title: 'fix: req 96706 optimize table',
        message: 'fix: req 96706 optimize table',
      }],
      mergeRequests: [],
    })

    expect(result.matches[0].requirementId).toBe('96706')
    expect(result.matches[0].confidence).toBe('medium')
  })

  it('returns unmatched activity when no requirement id exists', () => {
    const result = matchRequirementIds({
      commits: [{ title: 'refactor table rendering', message: 'refactor table rendering' }],
      mergeRequests: [],
    })

    expect(result.matches).toEqual([])
    expect(result.unmatched).toHaveLength(1)
  })
})
