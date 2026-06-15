import { describe, expect, it } from 'vitest'
import { parseArgs, readConfig } from '../../../plugins/codex-workflow-assistant/scripts/lib/env.mjs'

describe('workflow env helpers', () => {
  it('parses command arguments with flags', () => {
    expect(parseArgs(['draft', '--date', 'today', '--recent'])).toEqual({
      command: 'draft',
      flags: {
        date: 'today',
        recent: true,
      },
    })
  })

  it('rejects missing values for flags that require a value', () => {
    expect(() => parseArgs(['draft', '--date'])).toThrow('Missing value for --date')
  })

  it('reads GitLab config from environment without exposing token in output', () => {
    const config = readConfig({
      GITLAB_URL: 'https://gitlab.example.com',
      GITLAB_TOKEN: 'glpat-secret',
      GITLAB_PROJECT_ID: '123',
      WORKFLOW_DAILY_HOUR_CAP: '7.5',
    })

    expect(config.gitlab.url).toBe('https://gitlab.example.com')
    expect(config.gitlab.token).toBe('glpat-secret')
    expect(config.gitlab.projectId).toBe('123')
    expect(config.dailyHourCap).toBe(7.5)
    expect(JSON.stringify(config.redacted)).not.toContain('glpat-secret')
  })
})
