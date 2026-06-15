import type { BenchmarkLimit, ComplexityLevel } from './workload-benchmark.js'
import { getBenchmarkMetadata } from './workload-benchmark.js'

export interface ActivityCommit {
  total?: number
  additions?: number
  deletions?: number
}

export interface ManualNote {
  hours: number
  kind: string
  description: string
}

export interface EstimateRequirementWorkInput {
  requirementId: string
  confidence: 'high' | 'medium' | 'low'
  benchmarkCategory: string
  complexity?: ComplexityLevel
  commits: ActivityCommit[]
  mergeRequests: unknown[]
  manualNotes: ManualNote[]
}

export interface WorkHourDraft {
  requirementId: string
  hours: number
  description: string
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]
  reviewRequired: boolean
  capStatus: 'unapplied' | 'within-cap' | 'over-cap'
  benchmark: BenchmarkLimit
  splitOverflowHours: number
  splitIndex?: number
  splitTotal?: number
}

export interface SplitDraftByBenchmarkInput {
  requirementId: string
  totalHours: number
  benchmarkCategory: string
  complexity?: ComplexityLevel
  description: string
  evidence: string[]
  confidence: 'high' | 'medium' | 'low'
}

export function estimateRequirementWork({
  requirementId,
  confidence,
  benchmarkCategory,
  complexity = 'medium',
  commits,
  mergeRequests,
  manualNotes,
}: EstimateRequirementWorkInput): WorkHourDraft {
  const benchmark = getBenchmarkMetadata(benchmarkCategory, complexity)
  const manualHours = sum(manualNotes.map(note => Number(note.hours || 0)))
  const totalLines = sum(commits.map(commit => Number(commit.total || 0)))
  const commitCount = commits.length
  const mrCount = mergeRequests.length

  let hours = manualHours
  if (commitCount > 0 || mrCount > 0) {
    hours += estimateCodeHours(totalLines, commitCount, mrCount, benchmark)
  }

  const totalHours = roundToHalf(Math.max(hours, 0.5))
  const cappedHours = Math.min(totalHours, benchmark.limitHours)
  const evidence = [
    `benchmark:${benchmark.category}:${benchmark.complexity}:${benchmark.limitHours}h`,
    `commits:${commitCount}`,
    `mergeRequests:${mrCount}`,
    `changedLines:${totalLines}`,
    ...manualNotes.map(note => `manual:${note.kind}:${note.hours}h`),
  ]

  return {
    requirementId,
    hours: cappedHours,
    description: `Development work for requirement ${requirementId}`,
    confidence,
    evidence,
    reviewRequired: confidence === 'low' || totalHours > benchmark.limitHours,
    capStatus: 'unapplied',
    benchmark,
    splitOverflowHours: Math.max(0, totalHours - benchmark.limitHours),
  }
}

export function splitDraftByBenchmark({
  requirementId,
  totalHours,
  benchmarkCategory,
  complexity = 'medium',
  description,
  evidence,
  confidence,
}: SplitDraftByBenchmarkInput): WorkHourDraft[] {
  const benchmark = getBenchmarkMetadata(benchmarkCategory, complexity)
  const roundedTotal = roundToHalf(Math.max(totalHours, 0.5))
  const tasks: WorkHourDraft[] = []
  let remaining = roundedTotal

  while (remaining > 0) {
    const hours = Math.min(remaining, benchmark.limitHours)
    tasks.push({
      requirementId,
      hours,
      description,
      confidence,
      evidence: [
        `benchmark:${benchmark.category}:${benchmark.complexity}:${benchmark.limitHours}h`,
        ...evidence,
      ],
      reviewRequired: confidence === 'low',
      capStatus: 'unapplied',
      benchmark,
      splitOverflowHours: 0,
    })
    remaining = roundToHalf(remaining - hours)
  }

  return tasks.map((task, index) => ({
    ...task,
    splitIndex: index + 1,
    splitTotal: tasks.length,
  }))
}

export function applyDailyCap<T extends { hours: number }>(
  entries: T[],
  capHours: number,
): Array<T & { capStatus: 'within-cap' | 'over-cap' }> {
  let used = 0
  return entries.map((entry) => {
    const next = used + entry.hours
    const capStatus = next <= capHours ? 'within-cap' : 'over-cap'
    if (capStatus === 'within-cap') {
      used = next
    }
    return { ...entry, capStatus }
  })
}

function estimateCodeHours(
  totalLines: number,
  commitCount: number,
  mrCount: number,
  benchmark: BenchmarkLimit,
): number {
  if (totalLines <= 30 && commitCount <= 1) {
    return Math.min(benchmark.limitHours, Math.max(benchmark.limitHours, 1))
  }
  if (totalLines <= 100) {
    return Math.min(benchmark.limitHours, Math.max(benchmark.limitHours * 0.5, 1.5))
  }
  if (totalLines <= 250) {
    return Math.min(benchmark.limitHours, mrCount > 0 ? benchmark.limitHours : benchmark.limitHours * 0.75)
  }
  if (totalLines <= 500) {
    return benchmark.limitHours
  }
  return benchmark.limitHours
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
