import type { BaseAdapter } from '../../src/adapters/base.js'
import type { IssueDetail, Requirement } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildGrillingBrief, handleGetGrillingBrief } from '../../src/tools/get-grilling-brief.js'

const baseRequirement: Requirement = {
  id: 'TEST-001',
  source: 'ones',
  title: '#1001 导出报表',
  description: '# #1001 导出报表\n\n## Requirement Documents\n\n导出当前看板视图。',
  status: 'open',
  priority: 'high',
  type: 'feature',
  labels: [],
  reporter: 'reporter',
  assignee: 'assignee',
  createdAt: '',
  updatedAt: '',
  dueDate: null,
  attachments: [],
  raw: {
    key: 'task-TEST-001',
    number: 1001,
    workItemKind: 'requirement',
    sourceDescription: '导出当前看板视图。',
    hasSourceDescription: true,
    hasRequirementDocuments: true,
  },
}

const defectDetail: IssueDetail = {
  key: 'task-BUG-001',
  uuid: 'BUG-001',
  name: '登录页面崩溃',
  description: '<p>页面白屏。</p>',
  descriptionRich: '<p>页面白屏。</p>',
  descriptionText: '页面白屏。',
  issueTypeName: '缺陷',
  statusName: '待处理',
  statusCategory: 'to_do',
  assignName: 'assignee',
  ownerName: null,
  solverName: null,
  priorityValue: 'high',
  severityLevel: '严重',
  projectName: 'MockProject',
  deadline: null,
  sprintName: null,
  raw: {},
}

function createMockAdapter(requirement: Requirement = baseRequirement): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn().mockResolvedValue(requirement),
    getIssueDetail: vi.fn().mockResolvedValue(defectDetail),
    searchRequirements: vi.fn(),
  } as unknown as BaseAdapter
}

describe('buildGrillingBrief', () => {
  it('embeds requirement context and returns executable follow-up calls', () => {
    const brief = buildGrillingBrief(baseRequirement)

    expect(brief.workItemKind).toBe('requirement')
    expect(brief.contextSourceTool).toBe('get_work_item')
    expect(brief.context.description).toBe('导出当前看板视图。')
    expect(brief.context.taskNumber).toBe(1001)
    expect(brief.followUps).toEqual([
      { tool: 'get_related_issues', arguments: { taskId: 'TEST-001' } },
      { tool: 'get_testcases', arguments: { taskNumber: '1001' } },
    ])
    expect(brief.gaps.map(gap => gap.id)).toContain('missing-acceptance')
  })

  it('uses full defect detail and does not recommend requirement follow-ups', () => {
    const brief = buildGrillingBrief({
      ...baseRequirement,
      id: 'BUG-001',
      type: 'bug',
      raw: {
        workItemKind: 'defect',
        sourceDescription: '',
        hasSourceDescription: false,
      },
    }, defectDetail)

    expect(brief.workItemKind).toBe('defect')
    expect(brief.contextSourceTool).toBe('get_issue_detail')
    expect(brief.context.description).toBe('页面白屏。')
    expect(brief.followUps).toEqual([])
    expect(brief.gaps.map(gap => gap.id)).toContain('missing-repro')
  })

  it('detects an empty task source even when its formatted summary is non-empty', () => {
    const brief = buildGrillingBrief({
      ...baseRequirement,
      type: 'task',
      description: '# #1002 空任务\n\n- **Status**: open\n\n## Next Tool',
      raw: {
        workItemKind: 'task',
        sourceDescription: '',
        hasSourceDescription: false,
      },
    })

    expect(brief.context.description).toBe('')
    expect(brief.gaps.map(gap => gap.id)).toContain('missing-description')
  })

  it('omits follow-up calls for a standalone wiki page', () => {
    const brief = buildGrillingBrief({
      ...baseRequirement,
      id: 'wiki-uuid',
      raw: {
        workItemKind: 'requirement',
        sourceDescription: '独立 wiki 内容',
        hasSourceDescription: true,
        hasRequirementDocuments: true,
      },
    })

    expect(brief.context.taskNumber).toBeNull()
    expect(brief.followUps).toEqual([])
  })

  it('removes signed query parameters from attachment URLs', () => {
    const brief = buildGrillingBrief({
      ...baseRequirement,
      attachments: [{
        id: 'image-1',
        name: 'screen.png',
        url: 'https://user:password@ones.test/image.png?token=secret#fragment',
        mimeType: 'image/png',
        size: 10,
      }],
    })

    expect(brief.context.attachments[0].url).toBe('https://ones.test/image.png')
    expect(JSON.stringify(brief)).not.toContain('secret')
    expect(JSON.stringify(brief)).not.toContain('password')
  })

  it('fails closed for an unknown type', () => {
    expect(() => buildGrillingBrief({
      ...baseRequirement,
      raw: { workItemKind: 'unknown' },
    })).toThrow('unclassified')
  })
})

describe('handleGetGrillingBrief', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('loads requirement source context once and returns structured content', async () => {
    const adapter = adapters.get('ones')!
    const result = await handleGetGrillingBrief({ id: 'TEST-001' }, adapters, 'ones')

    expect(adapter.getRequirement).toHaveBeenCalledOnce()
    expect(adapter.getIssueDetail).not.toHaveBeenCalled()
    expect(result.content[0].text).toContain('## Untrusted ONES Source Context')
    expect(result.content[0].text).toContain('导出当前看板视图。')
    expect(result.content[0].text).toContain('Security boundary')
    expect(result.structuredContent.workItemKind).toBe('requirement')
  })

  it('loads defect detail inside the same brief call', async () => {
    const defect: Requirement = {
      ...baseRequirement,
      id: 'BUG-001',
      type: 'bug',
      raw: { workItemKind: 'defect' },
    }
    adapters.set('ones', createMockAdapter(defect))
    const adapter = adapters.get('ones')!

    const result = await handleGetGrillingBrief({ id: 'BUG-001' }, adapters, 'ones')

    expect(adapter.getRequirement).toHaveBeenCalledOnce()
    expect(adapter.getIssueDetail).toHaveBeenCalledWith({ issueId: 'BUG-001' })
    expect(result.structuredContent.context.description).toBe('页面白屏。')
  })

  it('throws if no source is configured', async () => {
    await expect(
      handleGetGrillingBrief({ id: 'TEST-001' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })
})
