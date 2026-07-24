import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  markSubmitted,
  readDrafts,
  stableDraftId,
  writeDrafts,
} from '../../../plugins/codex-workflow-assistant/scripts/src/lib/drafts.ts'

describe('draft store', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workflow-drafts-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates stable draft ids', () => {
    expect(stableDraftId({ date: '2026-06-15', requirementId: '96706', evidence: ['commits:1'] }))
      .toBe('2026-06-15-96706-commits-1')
  })

  it('writes and reads drafts', () => {
    writeDrafts(dir, '2026-06-15', [{
      draftId: '2026-06-15-96706-commits-1',
      requirementId: '96706',
      hours: 1,
      status: 'pending',
    }])

    expect(readDrafts(dir, '2026-06-15')).toEqual([{
      draftId: '2026-06-15-96706-commits-1',
      requirementId: '96706',
      hours: 1,
      status: 'pending',
    }])
  })

  it('marks a draft as submitted', () => {
    writeDrafts(dir, '2026-06-15', [{
      draftId: 'draft-a',
      requirementId: '96706',
      hours: 1,
      status: 'pending',
    }])

    markSubmitted(dir, '2026-06-15', 'draft-a', 'manhour-key')

    const content = JSON.parse(readFileSync(join(dir, 'drafts', '2026-06-15.json'), 'utf8'))
    expect(content.entries[0].status).toBe('submitted')
    expect(content.entries[0].manhourKey).toBe('manhour-key')
  })
})
