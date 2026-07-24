const REQUIREMENT_PATTERN = /(?:req[-_/ ]*)?(\d{4,8})/i

export interface MatchableCommit {
  title?: string
  message?: string
}

export interface MatchableMergeRequest {
  title?: string
  sourceBranch?: string
}

export interface MatchRequirementInput {
  commits: MatchableCommit[]
  mergeRequests: MatchableMergeRequest[]
}

export interface RequirementMatch {
  requirementId: string
  confidence: 'high' | 'medium' | 'low'
  sources: string[]
}

export interface MatchRequirementResult {
  matches: RequirementMatch[]
  unmatched: Array<{ type: 'commit' | 'merge_request', title?: string }>
}

export function matchRequirementIds(activity: MatchRequirementInput): MatchRequirementResult {
  const byRequirement = new Map<string, {
    requirementId: string
    confidences: Array<'high' | 'medium' | 'low'>
    sources: Set<string>
  }>()
  const unmatched: MatchRequirementResult['unmatched'] = []

  for (const mr of activity.mergeRequests || []) {
    const branchId = extractRequirementId(mr.sourceBranch)
    const titleId = extractRequirementId(mr.title)

    if (branchId) {
      addMatch(byRequirement, branchId, 'high', 'merge_request.sourceBranch')
    }
    else if (titleId) {
      addMatch(byRequirement, titleId, 'high', 'merge_request.title')
    }
    else {
      unmatched.push({ type: 'merge_request', title: mr.title })
    }
  }

  for (const commit of activity.commits || []) {
    const id = extractRequirementId(`${commit.title || ''}\n${commit.message || ''}`)
    if (id) {
      addMatch(byRequirement, id, 'medium', 'commit.message')
    }
    else {
      unmatched.push({ type: 'commit', title: commit.title })
    }
  }

  return {
    matches: [...byRequirement.values()].map(match => ({
      requirementId: match.requirementId,
      confidence: highestConfidence(match.confidences),
      sources: [...match.sources],
    })),
    unmatched,
  }
}

export function extractRequirementId(text?: string): string {
  const match = String(text || '').match(REQUIREMENT_PATTERN)
  return match ? match[1] : ''
}

function addMatch(
  map: Map<string, { requirementId: string, confidences: Array<'high' | 'medium' | 'low'>, sources: Set<string> }>,
  requirementId: string,
  confidence: 'high' | 'medium' | 'low',
  source: string,
) {
  const current = map.get(requirementId) || {
    requirementId,
    confidences: [],
    sources: new Set<string>(),
  }
  current.confidences.push(confidence)
  current.sources.add(source)
  map.set(requirementId, current)
}

function highestConfidence(values: Array<'high' | 'medium' | 'low'>): 'high' | 'medium' | 'low' {
  if (values.includes('high')) {
    return 'high'
  }
  if (values.includes('medium')) {
    return 'medium'
  }
  return 'low'
}
