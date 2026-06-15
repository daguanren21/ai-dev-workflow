import type { ComplexityLevel } from './lib/workload-benchmark.js'
import { markSubmitted, readDrafts, stableDraftId, writeDrafts } from './lib/drafts.js'
import { parseArgs, readConfig } from './lib/env.js'
import { applyDailyCap, estimateRequirementWork } from './lib/estimator.js'
import { formatDraftMarkdown } from './lib/format.js'
import { createRequirementBranch } from './lib/git.js'
import { fetchGitLabActivity } from './lib/gitlab.js'
import { matchRequirementIds } from './lib/matcher.js'

const USAGE = `Usage:
  workflow-cli.mjs branch --requirement <id> --base <master|main|dev>
  workflow-cli.mjs draft --date <today|YYYY-MM-DD> [--recent] [--benchmark <category>] [--complexity <simple|medium|complex>]
  workflow-cli.mjs note --task <id> --hours <hours> --kind <kind> --description <text>
  workflow-cli.mjs mark-submitted --draft-id <id> --manhour-key <key>
  workflow-cli.mjs status --date <today|YYYY-MM-DD>`

async function main(argv: string[]): Promise<void> {
  const { command, flags } = parseArgs(argv)
  const config = readConfig()

  if (command === 'config') {
    console.log(JSON.stringify(config.redacted, null, 2))
    return
  }

  if (command === 'help') {
    console.log(USAGE)
    return
  }

  if (command === 'branch') {
    if (!flags.requirement || typeof flags.requirement !== 'string') {
      throw new Error('branch requires --requirement')
    }

    const result = await createRequirementBranch({
      requirement: flags.requirement,
      base: typeof flags.base === 'string' ? flags.base : config.defaultBaseBranch,
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (command === 'draft') {
    const date = normalizeDate(typeof flags.date === 'string' ? flags.date : 'today')
    const benchmarkCategory = typeof flags.benchmark === 'string' ? flags.benchmark : config.defaultBenchmarkCategory
    const complexity = parseComplexity(typeof flags.complexity === 'string' ? flags.complexity : config.defaultComplexity)
    const activity = await fetchGitLabActivity({
      ...config.gitlab,
      date,
    })
    const matched = matchRequirementIds(activity)
    const entries = matched.matches.map((match) => {
      const draft = estimateRequirementWork({
        requirementId: match.requirementId,
        confidence: match.confidence,
        benchmarkCategory,
        complexity,
        commits: activity.commits,
        mergeRequests: activity.mergeRequests,
        manualNotes: [],
      })

      return {
        ...draft,
        draftId: stableDraftId({ date, requirementId: match.requirementId, evidence: draft.evidence }),
        date,
        status: 'pending' as const,
      }
    })
    const capped = applyDailyCap(entries, config.dailyHourCap)
    writeDrafts(config.stateDir, date, capped)
    console.log(formatDraftMarkdown({ date, entries: capped, unmatched: matched.unmatched }))
    return
  }

  if (command === 'note') {
    const date = normalizeDate(typeof flags.date === 'string' ? flags.date : 'today')
    if (
      typeof flags.task !== 'string'
      || typeof flags.hours !== 'string'
      || typeof flags.kind !== 'string'
      || typeof flags.description !== 'string'
    ) {
      throw new TypeError('note requires --task, --hours, --kind, and --description')
    }

    const existing = readDrafts(config.stateDir, date)
    const note = {
      draftId: stableDraftId({ date, requirementId: flags.task, evidence: [`manual:${flags.kind}:${flags.hours}h`] }),
      date,
      requirementId: flags.task,
      hours: Number.parseFloat(flags.hours),
      description: flags.description,
      confidence: 'high',
      evidence: [`manual:${flags.kind}:${flags.hours}h`],
      reviewRequired: false,
      capStatus: 'unapplied' as const,
      status: 'pending' as const,
    }
    const entries = applyDailyCap([...existing, note], config.dailyHourCap)
    writeDrafts(config.stateDir, date, entries)
    console.log(JSON.stringify(note, null, 2))
    return
  }

  if (command === 'mark-submitted') {
    const date = normalizeDate(typeof flags.date === 'string' ? flags.date : 'today')
    if (typeof flags.draftId !== 'string' || typeof flags.manhourKey !== 'string') {
      throw new TypeError('mark-submitted requires --draft-id and --manhour-key')
    }

    markSubmitted(config.stateDir, date, flags.draftId, flags.manhourKey)
    console.log(`Marked ${flags.draftId} as submitted.`)
    return
  }

  if (command === 'status') {
    const date = normalizeDate(typeof flags.date === 'string' ? flags.date : 'today')
    const entries = readDrafts(config.stateDir, date)
    console.log(formatDraftMarkdown({ date, entries, unmatched: [] }))
    return
  }

  throw new Error(`Command not implemented yet: ${command}`)
}

function normalizeDate(value: string): string {
  if (value === 'today') {
    return new Date().toISOString().slice(0, 10)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Date must be today or YYYY-MM-DD')
  }
  return value
}

function parseComplexity(value: string): ComplexityLevel {
  if (value === 'simple' || value === 'medium' || value === 'complex') {
    return value
  }
  throw new TypeError('complexity must be simple, medium, or complex')
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(USAGE)
  process.exitCode = 1
})
