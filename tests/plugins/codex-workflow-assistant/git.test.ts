import { describe, expect, it, vi } from 'vitest'
import {
  assertAllowedBaseBranch,
  createRequirementBranch,
  sanitizeBranchPart,
} from '../../../plugins/codex-workflow-assistant/scripts/src/lib/git.ts'

describe('git workflow helpers', () => {
  it('allows only master, main, and dev as base branches', () => {
    expect(() => assertAllowedBaseBranch('dev')).not.toThrow()
    expect(() => assertAllowedBaseBranch('main')).not.toThrow()
    expect(() => assertAllowedBaseBranch('master')).not.toThrow()
    expect(() => assertAllowedBaseBranch('release')).toThrow('Allowed base branches: master, main, dev')
  })

  it('sanitizes branch text', () => {
    expect(sanitizeBranchPart('96706 VXE Table Optimization!')).toBe('96706-vxe-table-optimization')
  })

  it('stops when worktree is dirty', async () => {
    const runner = vi.fn(async (command: string, args: string[]) => {
      if (command === 'git' && args.join(' ') === 'status --porcelain') {
        return ' M src/file.ts\n'
      }
      return ''
    })

    await expect(createRequirementBranch({
      requirement: '96706',
      base: 'dev',
      title: 'VXE Table Optimization',
      run: runner,
    })).rejects.toThrow('Worktree is dirty')
  })

  it('creates a requirement branch from a clean worktree', async () => {
    const calls: Array<[string, string[]]> = []
    const runner = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, args])
      if (command === 'git' && args.join(' ') === 'status --porcelain') {
        return ''
      }
      return ''
    })

    const result = await createRequirementBranch({
      requirement: '96706',
      base: 'dev',
      title: 'VXE Table Optimization',
      run: runner,
    })

    expect(result.branch).toBe('req/96706-vxe-table-optimization')
    expect(calls).toEqual([
      ['git', ['status', '--porcelain']],
      ['git', ['fetch', 'origin', 'dev']],
      ['git', ['checkout', 'dev']],
      ['git', ['pull', '--ff-only', 'origin', 'dev']],
      ['git', ['checkout', '-b', 'req/96706-vxe-table-optimization']],
    ])
  })
})
