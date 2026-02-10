import { describe, it, expect, vi } from 'vitest'
import { handleListSources } from '../../src/tools/list-sources.js'
import type { BaseAdapter } from '../../src/adapters/base.js'
import type { McpConfig } from '../../src/types/config.js'

function createMockAdapter(sourceType: string): BaseAdapter {
  return {
    sourceType,
    getRequirement: vi.fn(),
    searchRequirements: vi.fn(),
  } as unknown as BaseAdapter
}

describe('handleListSources', () => {
  it('should list all configured sources', async () => {
    const adapters = new Map<string, BaseAdapter>()
    adapters.set('jira', createMockAdapter('jira'))
    adapters.set('github', createMockAdapter('github'))

    const config: McpConfig = {
      sources: {
        jira: {
          enabled: true,
          apiBase: 'https://jira.example.com',
          auth: { type: 'token', tokenEnv: 'JIRA_TOKEN' },
        },
        github: {
          enabled: true,
          apiBase: 'https://api.github.com',
          auth: { type: 'token', tokenEnv: 'GH_TOKEN' },
        },
      },
      defaultSource: 'jira',
    }

    const result = await handleListSources(adapters, config)

    expect(result.content[0].text).toContain('jira')
    expect(result.content[0].text).toContain('github')
    expect(result.content[0].text).toContain('(default)')
    expect(result.content[0].text).toContain('token')
  })

  it('should handle no sources', async () => {
    const adapters = new Map<string, BaseAdapter>()
    const config: McpConfig = { sources: {} }

    const result = await handleListSources(adapters, config)

    expect(result.content[0].text).toContain('No sources configured')
  })
})
