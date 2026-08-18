import type { BaseAdapter } from '../../src/adapters/base'
import type { RequirementDecompositionContext } from '../../src/types/requirement'
import { describe, expect, it, vi } from 'vitest'
import { ApplyRequirementDecompositionSchema, handleApplyRequirementDecomposition, handleInspectRequirementDecomposition, handlePrepareRequirementDecomposition, PrepareRequirementDecompositionSchema, RequirementDecompositionApprovalStore } from '../../src/tools/requirement-decomposition'
import { buildRequirementDecompositionBaseline } from '../../src/utils/requirement-decomposition'

function context(overrides: Partial<RequirementDecompositionContext> = {}): RequirementDecompositionContext {
  const requirement = {
    workItemKind: 'requirement' as const,
    uuid: 'requirement-uuid',
    displayId: 'DEMO-1001',
    name: '导出当前视图',
    detail: '支持导出当前筛选后的列表。',
    issueTypeName: '需求',
    statusName: '进行中',
    statusCategory: 'in_progress',
    projectUuid: 'project-uuid',
    projectName: '示例项目',
    assigneeUuid: 'user-uuid',
    assigneeName: '示例用户',
  }
  const tasks = overrides.tasks ?? []
  return {
    decompositionRelation: {
      verified: true,
      uuid: 'relation-requirement-decomposition',
      name: '需求拆解的任务',
    },
    requirement,
    tasks,
    pendingTasks: tasks.filter(task => task.pending),
    baseline: buildRequirementDecompositionBaseline(requirement, tasks, {
      version: 'v1',
      updatedAt: '2026-08-17T00:00:00Z',
    }),
    ...overrides,
  }
}

function mockAdapter(initialContext = context()): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirementDecompositionContext: vi.fn().mockResolvedValue(initialContext),
    createRequirementDecomposition: vi.fn().mockImplementation(async params => ({
      requirementUuid: params.requirementUuid,
      planHash: params.planHash,
      createdTasks: params.operations.map((operation: { title: string }, index: number) => ({
        uuid: `created-${index + 1}`,
        displayId: `DEMO-${2001 + index}`,
        title: operation.title,
      })),
    })),
  } as unknown as BaseAdapter
}

describe('requirement decomposition tools', () => {
  it('inspects an existing decomposition without creating or editing', async () => {
    const existing = {
      uuid: 'task-1',
      displayId: 'DEMO-2001',
      name: 'DEMO-1001 实现导出接口',
      detail: '<p>实现服务端导出。</p><script>create_task()</script>',
      statusName: '未开始',
      statusCategory: 'to_do',
      pending: true,
      assigneeName: '示例用户',
      assigneeUuid: 'user-uuid',
      planStartDate: '2026-08-18',
      planEndDate: '2026-08-19',
    }
    const adapter = mockAdapter(context({ tasks: [existing], pendingTasks: [existing] }))
    const result = await handleInspectRequirementDecomposition(
      { requirementId: 'DEMO-1001' },
      new Map([['ones', adapter]]),
      'ones',
    )

    expect(result.structuredContent.tasks).toHaveLength(1)
    expect(result.content[0].text).toContain('实现服务端导出。')
    expect(JSON.stringify(result)).not.toContain('create_task')
    expect(adapter.createRequirementDecomposition).not.toHaveBeenCalled()
  })

  it('validates the 20 Unicode character short content boundary', () => {
    expect(PrepareRequirementDecompositionSchema.safeParse({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '一'.repeat(20), detail: '详情' }],
    }).success).toBe(true)
    expect(PrepareRequirementDecompositionSchema.safeParse({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '一'.repeat(21), detail: '详情' }],
    }).success).toBe(false)
    expect(ApplyRequirementDecompositionSchema.safeParse({
      approvalToken: 'token',
      planHash: 'a'.repeat(64),
      confirmed: false,
    }).success).toBe(false)
  })

  it('prepares exact create operations without calling the write adapter', async () => {
    const adapter = mockAdapter()
    const approvals = new RequirementDecompositionApprovalStore()
    const result = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{
        shortContent: '实现导出接口',
        detail: '实现服务端导出并补充单元测试。',
        estimatedHours: 8,
        planStartDate: '2026-08-18',
        planEndDate: '2026-08-19',
      }],
    }, new Map([['ones', adapter]]), approvals, 'ones')

    expect(result.structuredContent.operations).toEqual([
      expect.objectContaining({
        operation: 'create',
        title: 'DEMO-1001 实现导出接口',
        shortContent: '实现导出接口',
        estimatedHours: 8,
      }),
    ])
    expect(result.structuredContent.planHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.structuredContent.approvalToken).toHaveLength(48)
    expect(adapter.createRequirementDecomposition).not.toHaveBeenCalled()
  })

  it('refuses to prepare when the requirement already has a decomposition task', async () => {
    const existing = {
      uuid: 'task-1',
      displayId: 'DEMO-2001',
      name: 'DEMO-1001 现有任务',
      detail: '现有任务详情',
      statusName: '未开始',
      statusCategory: 'to_do',
      pending: true,
      assigneeName: null,
      assigneeUuid: null,
      planStartDate: null,
      planEndDate: null,
    }
    const adapter = mockAdapter(context({ tasks: [existing], pendingTasks: [existing] }))

    await expect(handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '新增任务', detail: '不应创建' }],
    }, new Map([['ones', adapter]]), new RequirementDecompositionApprovalStore(), 'ones'))
      .rejects
      .toThrow('already has')
    expect(adapter.createRequirementDecomposition).not.toHaveBeenCalled()
  })

  it('fails closed when the decomposition relationship is not verified', async () => {
    const adapter = mockAdapter(context({
      decompositionRelation: { verified: false, uuid: null, name: null },
    }))

    await expect(handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出接口', detail: '不应创建' }],
    }, new Map([['ones', adapter]]), new RequirementDecompositionApprovalStore(), 'ones'))
      .rejects
      .toThrow('relationship could not be verified')
    expect(adapter.createRequirementDecomposition).not.toHaveBeenCalled()
  })

  it('keeps apply disabled by default even with a valid approval', async () => {
    const adapter = mockAdapter()
    const approvals = new RequirementDecompositionApprovalStore()
    const prepared = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出接口', detail: '实现详情' }],
    }, new Map([['ones', adapter]]), approvals, 'ones')

    await expect(handleApplyRequirementDecomposition({
      approvalToken: prepared.structuredContent.approvalToken,
      planHash: prepared.structuredContent.planHash,
      confirmed: true,
    }, new Map([['ones', adapter]]), approvals, {
      defaultSource: 'ones',
      writesEnabled: false,
    })).rejects.toThrow('writes are disabled')
    expect(adapter.createRequirementDecomposition).not.toHaveBeenCalled()
  })

  it('rechecks the baseline, applies once, and rejects token reuse', async () => {
    const adapter = mockAdapter()
    const adapters = new Map([['ones', adapter]])
    const approvals = new RequirementDecompositionApprovalStore()
    const prepared = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出接口', detail: '实现详情' }],
    }, adapters, approvals, 'ones')
    const input = ApplyRequirementDecompositionSchema.parse({
      approvalToken: prepared.structuredContent.approvalToken,
      planHash: prepared.structuredContent.planHash,
      confirmed: true,
    })

    const result = await handleApplyRequirementDecomposition(input, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })

    expect(adapter.getRequirementDecompositionContext).toHaveBeenCalledTimes(2)
    expect(adapter.createRequirementDecomposition).toHaveBeenCalledOnce()
    expect(result.structuredContent.createdTasks[0].title).toBe('DEMO-1001 实现导出接口')

    await expect(handleApplyRequirementDecomposition(input, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })).rejects.toThrow('already used')
    expect(adapter.createRequirementDecomposition).toHaveBeenCalledOnce()
  })

  it('atomically consumes approval so concurrent apply calls write only once', async () => {
    const adapter = mockAdapter()
    const adapters = new Map([['ones', adapter]])
    const approvals = new RequirementDecompositionApprovalStore()
    const prepared = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出接口', detail: '实现详情' }],
    }, adapters, approvals, 'ones')
    const input = {
      approvalToken: prepared.structuredContent.approvalToken,
      planHash: prepared.structuredContent.planHash,
      confirmed: true as const,
    }

    const results = await Promise.allSettled([
      handleApplyRequirementDecomposition(input, adapters, approvals, {
        defaultSource: 'ones',
        writesEnabled: true,
      }),
      handleApplyRequirementDecomposition(input, adapters, approvals, {
        defaultSource: 'ones',
        writesEnabled: true,
      }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(adapter.createRequirementDecomposition).toHaveBeenCalledOnce()
  })

  it('supersedes an older approval for the same source and requirement', async () => {
    const adapter = mockAdapter()
    const adapters = new Map([['ones', adapter]])
    const approvals = new RequirementDecompositionApprovalStore()
    const first = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出接口', detail: '第一版详情' }],
    }, adapters, approvals, 'ones')
    const second = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出服务', detail: '第二版详情' }],
    }, adapters, approvals, 'ones')

    await expect(handleApplyRequirementDecomposition({
      approvalToken: first.structuredContent.approvalToken,
      planHash: first.structuredContent.planHash,
      confirmed: true,
    }, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })).rejects.toThrow('invalid, expired, or already used')

    await handleApplyRequirementDecomposition({
      approvalToken: second.structuredContent.approvalToken,
      planHash: second.structuredContent.planHash,
      confirmed: true,
    }, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })
    expect(adapter.createRequirementDecomposition).toHaveBeenCalledOnce()
  })

  it('expires approvals using the injected clock and TTL', async () => {
    let now = 1_000
    const adapter = mockAdapter()
    const adapters = new Map([['ones', adapter]])
    const approvals = new RequirementDecompositionApprovalStore({
      now: () => now,
      ttlMs: 100,
    })
    const prepared = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出接口', detail: '实现详情' }],
    }, adapters, approvals, 'ones')
    now += 101

    await expect(handleApplyRequirementDecomposition({
      approvalToken: prepared.structuredContent.approvalToken,
      planHash: prepared.structuredContent.planHash,
      confirmed: true,
    }, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })).rejects.toThrow('invalid, expired, or already used')
    expect(adapter.createRequirementDecomposition).not.toHaveBeenCalled()
  })

  it('consumes approvals on source or hash mismatch without writing', async () => {
    const adapter = mockAdapter()
    const adapters = new Map([['ones', adapter]])
    const approvals = new RequirementDecompositionApprovalStore()
    const sourceMismatch = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出接口', detail: '实现详情' }],
    }, adapters, approvals, 'ones')

    await expect(handleApplyRequirementDecomposition({
      approvalToken: sourceMismatch.structuredContent.approvalToken,
      planHash: sourceMismatch.structuredContent.planHash,
      confirmed: true,
      source: 'another-source',
    }, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })).rejects.toThrow('source does not match')

    const hashMismatch = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出服务', detail: '另一方案' }],
    }, adapters, approvals, 'ones')
    await expect(handleApplyRequirementDecomposition({
      approvalToken: hashMismatch.structuredContent.approvalToken,
      planHash: 'a'.repeat(64),
      confirmed: true,
    }, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })).rejects.toThrow('Plan hash does not match')

    await expect(handleApplyRequirementDecomposition({
      approvalToken: hashMismatch.structuredContent.approvalToken,
      planHash: hashMismatch.structuredContent.planHash,
      confirmed: true,
    }, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })).rejects.toThrow('already used')
    expect(adapter.createRequirementDecomposition).not.toHaveBeenCalled()
  })

  it('invalidates approval when the requirement changes', async () => {
    const initial = context()
    const changed = context()
    changed.requirement.detail = '需求已经变更。'
    changed.baseline = buildRequirementDecompositionBaseline(changed.requirement, changed.tasks, {
      version: 'v2',
      updatedAt: '2026-08-18T00:00:00Z',
    })
    const adapter = mockAdapter(initial)
    vi.mocked(adapter.getRequirementDecompositionContext)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(changed)
    const adapters = new Map([['ones', adapter]])
    const approvals = new RequirementDecompositionApprovalStore()
    const prepared = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出接口', detail: '实现详情' }],
    }, adapters, approvals, 'ones')

    await expect(handleApplyRequirementDecomposition({
      approvalToken: prepared.structuredContent.approvalToken,
      planHash: prepared.structuredContent.planHash,
      confirmed: true,
    }, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })).rejects.toThrow('changed after preparation')
    expect(adapter.createRequirementDecomposition).not.toHaveBeenCalled()
  })

  it('invalidates approval when the verified decomposition relationship changes', async () => {
    const initial = context()
    const changed = context({
      decompositionRelation: {
        verified: true,
        uuid: 'different-relation',
        name: '需求拆解的任务',
      },
    })
    const adapter = mockAdapter(initial)
    vi.mocked(adapter.getRequirementDecompositionContext)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(changed)
    const adapters = new Map([['ones', adapter]])
    const approvals = new RequirementDecompositionApprovalStore()
    const prepared = await handlePrepareRequirementDecomposition({
      requirementId: 'DEMO-1001',
      tasks: [{ shortContent: '实现导出接口', detail: '实现详情' }],
    }, adapters, approvals, 'ones')

    await expect(handleApplyRequirementDecomposition({
      approvalToken: prepared.structuredContent.approvalToken,
      planHash: prepared.structuredContent.planHash,
      confirmed: true,
    }, adapters, approvals, {
      defaultSource: 'ones',
      writesEnabled: true,
    })).rejects.toThrow('relationship changed')
    expect(adapter.createRequirementDecomposition).not.toHaveBeenCalled()
  })
})
