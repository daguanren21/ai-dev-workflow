import type { BaseAdapter } from '../../src/adapters/base'
import type { Requirement } from '../../src/types/requirement'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { describe, expect, it, vi } from 'vitest'
import packageJson from '../../packages/ai-dev-requirements/package.json' with { type: 'json' }
import { createRequirementsServer } from '../../src/server'

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
  resolveWikiPath: vi.fn().mockResolvedValue({
    teamId: 'team-demo-1',
    spaceId: 'space-demo-1',
    pageId: 'page-demo-parent',
    title: 'Personal Blog',
    breadcrumb: ['Example Department', 'Home', 'Personal Blog'],
  }),
  getWikiPage: vi.fn().mockResolvedValue({
    pageId: 'page-demo-parent',
    teamId: 'team-demo-1',
    spaceId: 'space-demo-1',
    title: 'Personal Blog',
    parentPageId: 'page-demo-home',
    breadcrumb: ['Example Department', 'Home', 'Personal Blog'],
    version: 'version-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: '',
    attachments: [],
    contentHash: 'content-hash-1',
  }),
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
      expect(names).toContain('list_pending_work_items')
      expect(names).toContain('inspect_requirement_decomposition')
      expect(names).toContain('prepare_requirement_decomposition')
      expect(names).toContain('apply_requirement_decomposition')
      expect(names).toContain('get_ones_wiki_page')
      expect(names).toContain('search_ones_wiki')
      expect(names).toContain('export_ones_wiki_tree')
      expect(names).toContain('lookup_environment_access')
      expect(names).toContain('prepare_wiki_create')
      expect(names).toContain('apply_wiki_create')
      expect(names).toContain('prepare_wiki_update')
      expect(names).toContain('apply_wiki_update')
      expect(names).not.toContain('get_requirement')

      const brief = result.tools.find(tool => tool.name === 'get_grilling_brief')
      const pendingWorkItems = result.tools.find(tool => tool.name === 'list_pending_work_items')
      const planDates = result.tools.find(tool => tool.name === 'update_task_plan_dates')
      const inspectDecomposition = result.tools.find(tool => tool.name === 'inspect_requirement_decomposition')
      const prepareDecomposition = result.tools.find(tool => tool.name === 'prepare_requirement_decomposition')
      const applyDecomposition = result.tools.find(tool => tool.name === 'apply_requirement_decomposition')
      const getWikiPage = result.tools.find(tool => tool.name === 'get_ones_wiki_page')
      const prepareWikiCreate = result.tools.find(tool => tool.name === 'prepare_wiki_create')
      const prepareWikiUpdate = result.tools.find(tool => tool.name === 'prepare_wiki_update')
      const applyWikiUpdate = result.tools.find(tool => tool.name === 'apply_wiki_update')
      expect(inspectDecomposition?.annotations?.readOnlyHint).toBe(true)
      expect(pendingWorkItems?.annotations?.readOnlyHint).toBe(true)
      expect(prepareDecomposition?.annotations?.readOnlyHint).toBe(true)
      expect(applyDecomposition?.annotations).toMatchObject({
        readOnlyHint: false,
        idempotentHint: false,
      })
      expect(getWikiPage?.annotations?.readOnlyHint).toBe(true)
      expect(prepareWikiCreate?.outputSchema).toMatchObject({
        type: 'object',
        required: expect.arrayContaining(['operationHash', 'approvalToken', 'expiresAt']),
      })
      expect(prepareWikiUpdate?.annotations?.readOnlyHint).toBe(true)
      expect(applyWikiUpdate?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      })
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

      const wikiCreate = await client.callTool({
        name: 'prepare_wiki_create',
        arguments: {
          parentPath: ['Example Department', 'Home', 'Personal Blog'],
          title: 'Harness Notes',
          markdown: 'Anonymous example content.',
        },
      })
      expect(wikiCreate.isError).not.toBe(true)
      expect(wikiCreate.structuredContent).toMatchObject({
        kind: 'create',
        operationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        approvalToken: expect.stringMatching(/^[a-f0-9]{48}$/),
        expiresAt: expect.any(String),
      })
      expect(wikiCreate.content).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('approvalToken:'),
        }),
      ]))

      const sources = await client.callTool({ name: 'list_sources', arguments: {} })
      expect(JSON.stringify(sources)).toContain('configured')
      expect(JSON.stringify(sources)).not.toContain('API Base')

      const disabledWrite = await client.callTool({
        name: 'apply_requirement_decomposition',
        arguments: {
          approvalToken: 'not-an-approval',
          planHash: 'a'.repeat(64),
          confirmed: true,
        },
      })
      expect(disabledWrite.isError).toBe(true)
      expect(JSON.stringify(disabledWrite)).toContain('writes are disabled')

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
