import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'))

describe('requirements MCP stdio bootstrap', () => {
  it('starts the real entry point and serves a latest-negotiated tool call', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsxCli, 'src/index.ts'],
      cwd: repositoryRoot,
      env: {
        ...getDefaultEnvironment(),
        ONES_API_BASE: 'https://ones.test',
        ONES_ACCOUNT: 'stdio-test@example.com',
        ONES_PASSWORD: 'stdio-test-password',
      },
      stderr: 'pipe',
    })
    const client = new Client(
      { name: 'stdio-contract-test', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )

    try {
      await client.connect(transport)
      const tools = await client.listTools()
      expect(tools.tools.map(tool => tool.name)).toContain('get_grilling_brief')

      const sources = await client.callTool({ name: 'list_sources', arguments: {} })
      expect(sources.isError).not.toBe(true)
      expect(JSON.stringify(sources)).toContain('ones (default)')
      expect(JSON.stringify(sources)).not.toContain('https://ones.test')
    }
    finally {
      await client.close()
    }
  }, 15_000)
})
