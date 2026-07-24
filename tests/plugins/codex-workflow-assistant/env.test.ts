import { describe, expect, it } from 'vitest'
import { inferGitLabProjectFromRemote, parseArgs, readConfig } from '../../../plugins/codex-workflow-assistant/scripts/src/lib/env.ts'

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
      WORKFLOW_DEFAULT_BENCHMARK_CATEGORY: '后端-新增CRUD模块',
      WORKFLOW_DEFAULT_COMPLEXITY: 'complex',
    })

    expect(config.gitlab.url).toBe('https://gitlab.example.com')
    expect(config.gitlab.token).toBe('glpat-secret')
    expect(config.gitlab.projectId).toBe('123')
    expect(config.dailyHourCap).toBe(7.5)
    expect(config.defaultBenchmarkCategory).toBe('后端-新增CRUD模块')
    expect(config.defaultComplexity).toBe('complex')
    expect(JSON.stringify(config.redacted)).not.toContain('glpat-secret')
  })

  it('uses built-in defaults when only the GitLab token is configured', () => {
    const config = readConfig({
      GITLAB_TOKEN: 'glpat-secret',
    })

    expect(config.gitlab.token).toBe('glpat-secret')
    expect(config.dailyHourCap).toBe(8)
    expect(config.defaultBaseBranch).toBe('dev')
    expect(config.defaultBenchmarkCategory).toBe('前端-新增组件')
    expect(config.defaultComplexity).toBe('medium')
    expect(config.stateDir).toBe('.codex-workflow')
  })

  it('infers GitLab host and project path from SSH remotes', () => {
    expect(inferGitLabProjectFromRemote('git@gitlab.example.com:group/sub-group/project.git')).toEqual({
      url: 'https://gitlab.example.com',
      projectId: 'group/sub-group/project',
    })
  })

  it('infers GitLab host and project path from HTTPS remotes', () => {
    expect(inferGitLabProjectFromRemote('https://gitlab.example.com/group/project.git')).toEqual({
      url: 'https://gitlab.example.com',
      projectId: 'group/project',
    })
  })
})
