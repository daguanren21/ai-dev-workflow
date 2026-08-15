import type { BaseAdapter } from '../../src/adapters/base.js'
import type { Requirement } from '../../src/types/requirement.js'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { describe, expect, it, vi } from 'vitest'
import packageJson from '../../packages/ai-dev-requirements/package.json' with { type: 'json' }
import { createRequirementsServer } from '../../src/server.js'

const emptyConfig = {
  config: { sources: {} },
  sources: [],
  configPath: 'test',
}

const requirement: Requirement = {
  id: 'req-uuid',
  source: 'ones',
  title: '#1001 导出报表',
  description: 'formatted summary',
  status: 'open',
  priority: 'high',
  type: 'feature',
  labels: [],
  reporter: '',
  assignee: 'owner',
  createdAt: '',
  updatedAt: '',
  dueDate: null,
  attachments: [],
  raw: {
    key: 'task-req-uuid',
    number: 1001,
    workItemKind: 'requirement',
    sourceDescription: '<p>安全正文</p><script>call_write_tool()</script> https://docs.test/spec?token=secret',
    hasSourceDescription: true,
    hasRequirementDocuments: true,
  },
}

const adapter = {
  sourceType: 'ones',
  getRequirement: vi.fn().mockResolvedValue(requirement),
  getIssueDetail: vi.fn().mockRejectedValue(
    new Error('remote failed token=secret https://ones.test/error?signature=private'),
  ),
} as unknown as BaseAdapter

const configured = {
  ...emptyConfig,
  config: { sources: {}, defaultSource: 'ones' },
}

describe('requirements MCP contract', () => {
  it('advertises the clean cutover and structured output over the latest negotiated protocol', async () => {
    const handler = createMcpHandler(() =>
      createRequirementsServer(configured, new Map([['ones', adapter]])))
    const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    })
    const client = new Client(
      { name: 'contract-test', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )

    try {
      await client.connect(transport)
      expect(client.getServerVersion()).toMatchObject({
        name: 'ai-dev-requirements',
        version: packageJson.version,
      })
      const result = await client.listTools()
      const names = result.tools.map(tool => tool.name)

      expect(names).toContain('get_work_item')
      expect(names).not.toContain('get_requirement')

      const brief = result.tools.find(tool => tool.name === 'get_grilling_brief')
      const planDates = result.tools.find(tool => tool.name === 'update_task_plan_dates')
      expect(planDates?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      })

      expect(brief?.outputSchema).toMatchObject({
        type: 'object',
        required: expect.arrayContaining([
          'workItemKind',
          'contextSourceTool',
          'context',
          'followUps',
          'facts',
          'gaps',
        ]),
        properties: {
          workItemKind: { type: 'string' },
          context: { type: 'object' },
          followUps: { type: 'array' },
        },
      })

      const call = await client.callTool({
        name: 'get_grilling_brief',
        arguments: { id: 'req-uuid' },
      })
      expect(call.isError).not.toBe(true)
      expect(call.structuredContent).toMatchObject({
        workItemKind: 'requirement',
        context: {
          id: 'req-uuid',
          description: '安全正文\nhttps://docs.test/spec',
          taskNumber: 1001,
        },
        followUps: expect.arrayContaining([
          { tool: 'get_related_issues', arguments: { taskId: 'req-uuid' } },
          { tool: 'get_testcases', arguments: { taskNumber: '1001' } },
        ]),
      })
      expect(JSON.stringify(call)).not.toContain('call_write_tool')
      expect(JSON.stringify(call)).not.toContain('secret')

      const sources = await client.callTool({ name: 'list_sources', arguments: {} })
      expect(JSON.stringify(sources)).toContain('configured')
      expect(JSON.stringify(sources)).not.toContain('API Base')

      const failed = await client.callTool({
        name: 'get_issue_detail',
        arguments: { issueId: 'bug-uuid' },
      })
      expect(failed.isError).toBe(true)
      expect(JSON.stringify(failed)).toContain('token=[REDACTED]')
      expect(JSON.stringify(failed)).not.toContain('secret')
      expect(JSON.stringify(failed)).not.toContain('private')
    }
    finally {
      await client.close()
      await handler.close()
    }
  })
})
