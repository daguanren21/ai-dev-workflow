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
    adapters.set('ones', createMockAdapter('ones'))

    const config: McpConfig = {
      sources: {
        ones: {
          enabled: true,
          apiBase: 'https://ones.example.com',
          auth: { type: 'ones-pkce', emailEnv: 'ONES_EMAIL', passwordEnv: 'ONES_PASS' },
        },
      },
      defaultSource: 'ones',
    }

    const result = await handleListSources(adapters, config)

    expect(result.content[0].text).toContain('ones')
    expect(result.content[0].text).toContain('(default)')
    expect(result.content[0].text).toContain('ones-pkce')
  })

  it('should handle no sources', async () => {
    const adapters = new Map<string, BaseAdapter>()
    const config: McpConfig = { sources: {} }

    const result = await handleListSources(adapters, config)

    expect(result.content[0].text).toContain('No sources configured')
  })
})
