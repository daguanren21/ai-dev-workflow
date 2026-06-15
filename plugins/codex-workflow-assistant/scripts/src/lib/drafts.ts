import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface DraftEntry {
  draftId: string
  requirementId: string
  hours: number
  status: 'pending' | 'submitted' | 'rejected'
  manhourKey?: string
  [key: string]: unknown
}

export function stableDraftId({ date, requirementId, evidence }: {
  date: string
  requirementId: string
  evidence: string[]
}): string {
  return sanitize(`${date}-${requirementId}-${evidence.join('-')}`)
}

export function readDrafts(stateDir: string, date: string): DraftEntry[] {
  const path = draftPath(stateDir, date)
  if (!existsSync(path)) {
    return []
  }

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { entries?: DraftEntry[] }
  return parsed.entries || []
}

export function writeDrafts(stateDir: string, date: string, entries: DraftEntry[]): void {
  const dir = join(stateDir, 'drafts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(draftPath(stateDir, date), `${JSON.stringify({ date, entries }, null, 2)}\n`)
}

export function markSubmitted(stateDir: string, date: string, draftId: string, manhourKey: string): void {
  const entries = readDrafts(stateDir, date).map((entry) => {
    if (entry.draftId !== draftId) {
      return entry
    }

    return {
      ...entry,
      status: 'submitted' as const,
      manhourKey,
    }
  })
  writeDrafts(stateDir, date, entries)
}

function draftPath(stateDir: string, date: string): string {
  return join(stateDir, 'drafts', `${date}.json`)
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}
