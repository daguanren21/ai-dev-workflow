import type { BenchmarkLimit } from './workload-benchmark.js'

export interface FormattableDraftEntry {
  draftId: string
  requirementId: string
  hours: number
  description: string
  confidence: string
  capStatus: string
  evidence: string[]
  status: string
  benchmark?: BenchmarkLimit
}

export interface FormatDraftMarkdownInput {
  date: string
  entries: FormattableDraftEntry[]
  unmatched: Array<{ type: string, title?: string }>
}

export function formatDraftMarkdown({ date, entries, unmatched }: FormatDraftMarkdownInput): string {
  const lines = [
    `# Timesheet Draft: ${date}`,
    '',
    '| Draft ID | Requirement | Benchmark | Benchmark Cap | Hours | Confidence | Daily Cap | Status | Description |',
    '| --- | --- | --- | ---: | ---: | --- | --- | --- | --- |',
  ]

  for (const entry of entries) {
    const benchmark = entry.benchmark
    lines.push([
      `| ${entry.draftId}`,
      entry.requirementId,
      benchmark ? benchmark.category : 'unmatched',
      benchmark ? `${benchmark.limitHours}h` : '',
      String(entry.hours),
      entry.confidence,
      entry.capStatus,
      entry.status,
      `${entry.description} |`,
    ].join(' | '))
  }

  lines.push('', '## Evidence')
  for (const entry of entries) {
    lines.push(`- ${entry.draftId}: ${entry.evidence.join(', ')}`)
  }

  if (unmatched.length > 0) {
    lines.push('', '## Review Needed')
    for (const item of unmatched) {
      lines.push(`- ${item.type}: ${item.title || '(untitled)'}`)
    }
  }

  lines.push('', 'Submission requires explicit user confirmation.')
  return lines.join('\n')
}
