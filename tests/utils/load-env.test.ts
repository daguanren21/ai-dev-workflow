import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadNearestEnv } from '../../src/utils/load-env'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe('loadNearestEnv', () => {
  it('should find the nearest env file and use dotenv parsing without overriding existing values', () => {
    const root = mkdtempSync(join(tmpdir(), 'requirements-env-'))
    temporaryDirectories.push(root)
    const nested = join(root, 'nested', 'child')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(root, '.env'), [
      'PLAIN=value',
      'QUOTED="value with spaces # preserved"',
      'INLINE=before # removed',
      'EXISTING=from-file',
    ].join('\n'))
    const environment = { EXISTING: 'from-process' }

    const loadedPath = loadNearestEnv(nested, environment)

    expect(loadedPath).toBe(join(root, '.env'))
    expect(environment).toEqual({
      EXISTING: 'from-process',
      INLINE: 'before',
      PLAIN: 'value',
      QUOTED: 'value with spaces # preserved',
    })
  })
})
