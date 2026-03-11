# 需求关联 Issue 列表与详情工具 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 MCP Server 新增两个工具：`get_related_issues` 获取需求关联的缺陷 issue 列表（返回所有待处理缺陷，按当前用户/其他人分组），`get_issue_detail` 获取指定 issue 的详情（含描述、富文本、图片）。

**Architecture:** 在 `OnesAdapter` 中新增两个方法 `getRelatedIssues` 和 `getIssueDetail`，使用 ONES GraphQL API。`getRelatedIssues` 过滤 `detailType === 3`（缺陷）且 `status.category === "to_do"`（待处理），返回全部待处理缺陷并按 assign 分组（当前用户优先）。`getIssueDetail` 获取 issue 的完整描述（desc_rich / description / descriptionText）。在 `BaseAdapter` 中声明抽象方法，在 `src/tools/` 下新增两个 tool handler，在 `src/index.ts` 中注册。最后通过 MCP Inspector 做端到端验证。

**Tech Stack:** TypeScript, Vitest, Zod v4, MCP SDK, ONES GraphQL API

---

### Task 1: BaseAdapter 新增抽象方法

**Files:**
- Modify: `src/adapters/base.ts`
- Modify: `src/types/requirement.ts`

**Step 1: 在 `src/types/requirement.ts` 新增 `RelatedIssue` 和 `IssueDetail` 类型**

```typescript
// 在文件末尾追加

export interface RelatedIssue {
  key: string
  uuid: string
  name: string
  issueTypeName: string
  statusName: string
  statusCategory: string
  assignName: string | null
  assignUuid: string | null
  priorityValue: string | null
  projectName: string | null
}

export interface IssueDetail {
  key: string
  uuid: string
  name: string
  description: string
  descriptionRich: string
  descriptionText: string
  issueTypeName: string
  statusName: string
  statusCategory: string
  assignName: string | null
  ownerName: string | null
  solverName: string | null
  priorityValue: string | null
  severityLevel: string | null
  projectName: string | null
  deadline: string | null
  sprintName: string | null
  raw: Record<string, unknown>
}
```

**Step 2: 在 `src/adapters/base.ts` 新增抽象方法签名**

在 `BaseAdapter` 类中追加：

```typescript
export interface GetRelatedIssuesParams {
  /** 父需求的 task key，如 "task-HRL2p8rTX4mQ9xMv" 或 uuid */
  taskId: string
}

export interface GetIssueDetailParams {
  /** issue 的 task key，如 "task-6W9vW3y8J9DO66Pu" 或 uuid */
  issueId: string
}

// 在 BaseAdapter class 内追加：
abstract getRelatedIssues(params: GetRelatedIssuesParams): Promise<RelatedIssue[]>
abstract getIssueDetail(params: GetIssueDetailParams): Promise<IssueDetail>
```

**Step 3: 运行 typecheck 确认编译报错（OnesAdapter 缺少实现）**

Run: `pnpm typecheck`
Expected: FAIL — OnesAdapter 缺少 `getRelatedIssues` 和 `getIssueDetail` 实现

**Step 4: Commit**

```bash
git add src/types/requirement.ts src/adapters/base.ts
git commit -m "feat: add RelatedIssue/IssueDetail types and abstract methods to BaseAdapter"
```

---

### Task 2: OnesAdapter 实现 `getRelatedIssues`（返回所有待处理缺陷，按用户分组）

**Files:**
- Modify: `src/adapters/ones.ts`
- Test: `tests/adapters/ones.test.ts`
- Modify: `tests/fixtures/ones-response.json`

**Step 1: 在 fixture 中添加 relatedIssues 测试数据**

在 `tests/fixtures/ones-response.json` 顶层新增 `relatedIssues` 字段：

```json
{
  "relatedIssues": {
    "data": {
      "task": {
        "key": "task-HRL2p8rTX4mQ9xMv",
        "relatedTasks": [
          {
            "key": "task-bug-001",
            "uuid": "bug-uuid-001",
            "name": "登录页面崩溃",
            "issueType": { "key": "it-1", "uuid": "it-uuid-1", "name": "缺陷", "detailType": 3 },
            "status": { "uuid": "s-todo", "name": "待处理", "category": "to_do" },
            "assign": { "uuid": "current-user-uuid", "name": "当前用户" },
            "priority": { "value": "high" },
            "project": { "uuid": "p1", "name": "StarCloud" }
          },
          {
            "key": "task-bug-002",
            "uuid": "bug-uuid-002",
            "name": "数量为零时崩溃",
            "issueType": { "key": "it-2", "uuid": "it-uuid-2", "name": "缺陷", "detailType": 3 },
            "status": { "uuid": "s-done", "name": "已完成", "category": "done" },
            "assign": { "uuid": "current-user-uuid", "name": "当前用户" },
            "priority": { "value": "normal" },
            "project": { "uuid": "p1", "name": "StarCloud" }
          },
          {
            "key": "task-feat-003",
            "uuid": "feat-uuid-003",
            "name": "新增导出功能",
            "issueType": { "key": "it-3", "uuid": "it-uuid-3", "name": "需求", "detailType": 1 },
            "status": { "uuid": "s-todo2", "name": "待处理", "category": "to_do" },
            "assign": { "uuid": "other-user-uuid", "name": "其他人" },
            "priority": { "value": "normal" },
            "project": { "uuid": "p1", "name": "StarCloud" }
          },
          {
            "key": "task-bug-004",
            "uuid": "bug-uuid-004",
            "name": "表单提交失败",
            "issueType": { "key": "it-4", "uuid": "it-uuid-4", "name": "缺陷", "detailType": 3 },
            "status": { "uuid": "s-todo3", "name": "待处理", "category": "to_do" },
            "assign": { "uuid": "other-user-uuid", "name": "其他人" },
            "priority": { "value": "high" },
            "project": { "uuid": "p1", "name": "StarCloud" }
          }
        ]
      }
    }
  }
}
```

说明：4 条关联任务中，满足 detailType=3 + to_do 的有 `task-bug-001`（当前用户）和 `task-bug-004`（其他人）。`task-bug-002` 是缺陷但已完成，`task-feat-003` 不是缺陷。结果应返回 2 条，当前用户的排前面。

**Step 2: 写失败测试**

在 `tests/adapters/ones.test.ts` 的 `describe('onesAdapter')` 内新增：

```typescript
describe('getRelatedIssues', () => {
  it('should return all pending defects (detailType=3 + to_do), current user first', async () => {
    mockLoginFlow()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(onesFixture.relatedIssues),
    })

    const result = await adapter.getRelatedIssues({ taskId: 'HRL2p8rTX4mQ9xMv' })

    // 2 条待处理缺陷：bug-001（当前用户）和 bug-004（其他人）
    expect(result).toHaveLength(2)
    // 当前用户的排前面
    expect(result[0].key).toBe('task-bug-001')
    expect(result[0].name).toBe('登录页面崩溃')
    expect(result[0].assignUuid).toBe('current-user-uuid')
    // 其他人的排后面
    expect(result[1].key).toBe('task-bug-004')
    expect(result[1].name).toBe('表单提交失败')
    expect(result[1].assignUuid).toBe('other-user-uuid')
  })

  it('should exclude non-defects and non-todo defects', async () => {
    mockLoginFlow()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(onesFixture.relatedIssues),
    })

    const result = await adapter.getRelatedIssues({ taskId: 'HRL2p8rTX4mQ9xMv' })

    const uuids = result.map(r => r.uuid)
    // bug-002 已完成，不应出现
    expect(uuids).not.toContain('bug-uuid-002')
    // feat-003 不是缺陷，不应出现
    expect(uuids).not.toContain('feat-uuid-003')
  })

  it('should return empty array when no matching defects', async () => {
    mockLoginFlow()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { task: { key: 'task-xxx', relatedTasks: [] } },
      }),
    })

    const result = await adapter.getRelatedIssues({ taskId: 'xxx' })
    expect(result).toHaveLength(0)
  })
})
```

**Step 3: 运行测试确认失败**

Run: `pnpm vitest run tests/adapters/ones.test.ts`
Expected: FAIL — `adapter.getRelatedIssues is not a function`

**Step 4: 在 OnesAdapter 中实现 `getRelatedIssues`**

在 `src/adapters/ones.ts` 中：

1. 新增 GraphQL query 常量 `RELATED_TASKS_QUERY`：

```typescript
const RELATED_TASKS_QUERY = `
  query Task($key: Key) {
    task(key: $key) {
      key
      relatedTasks {
        key
        uuid
        name
        path
        deadline
        project { uuid name }
        priority { value }
        issueType {
          key uuid name detailType
        }
        subIssueType {
          key uuid name detailType
        }
        status {
          uuid name category
        }
        assign {
          uuid name
        }
        sprint {
          name uuid
        }
        statusCategory
      }
    }
  }
`
```

2. 修改 `OnesSession` 接口新增 `userUuid: string`。在 login 方法的 session 赋值处添加 `userUuid: orgUser.org_user.org_user_uuid`。这用于分组排序（当前用户优先），不用于过滤。

3. 实现 `getRelatedIssues` 方法（返回所有待处理缺陷，当前用户排前面）：

```typescript
async getRelatedIssues(params: GetRelatedIssuesParams): Promise<RelatedIssue[]> {
  const session = await this.login()

  const taskKey = params.taskId.startsWith('task-')
    ? params.taskId
    : `task-${params.taskId}`

  const data = await this.graphql<{
    data?: {
      task?: {
        key: string
        relatedTasks: Array<{
          key: string
          uuid: string
          name: string
          issueType: { key: string, uuid: string, name: string, detailType: number }
          subIssueType?: { key: string, uuid: string, name: string, detailType: number } | null
          status: { uuid: string, name: string, category: string }
          assign?: { uuid: string, name: string } | null
          priority?: { value: string } | null
          project?: { uuid: string, name: string } | null
        }>
      }
    }
  }>(RELATED_TASKS_QUERY, { key: taskKey }, 'Task')

  const relatedTasks = data.data?.task?.relatedTasks ?? []

  // 过滤：detailType === 3（缺陷）+ status.category === "to_do"（待处理）
  // 不限制用户，所有人的待处理缺陷都返回
  const filtered = relatedTasks.filter((t) => {
    const isDefect = t.issueType?.detailType === 3
      || t.subIssueType?.detailType === 3
    const isTodo = t.status?.category === 'to_do'
    return isDefect && isTodo
  })

  // 按用户分组排序：当前登录用户的排前面，其他人的排后面
  const currentUserUuid = session.userUuid
  filtered.sort((a, b) => {
    const aIsCurrent = a.assign?.uuid === currentUserUuid ? 0 : 1
    const bIsCurrent = b.assign?.uuid === currentUserUuid ? 0 : 1
    return aIsCurrent - bIsCurrent
  })

  return filtered.map(t => ({
    key: t.key,
    uuid: t.uuid,
    name: t.name,
    issueTypeName: t.issueType?.name ?? 'Unknown',
    statusName: t.status?.name ?? 'Unknown',
    statusCategory: t.status?.category ?? 'unknown',
    assignName: t.assign?.name ?? null,
    assignUuid: t.assign?.uuid ?? null,
    priorityValue: t.priority?.value ?? null,
    projectName: t.project?.name ?? null,
  }))
}
```

**注意：** 需要更新 `mockLoginFlow` 中的 `org_user_uuid` 为 `"current-user-uuid"`，与 fixture 中当前用户的 assign.uuid 一致。

**Step 5: 运行测试确认通过**

Run: `pnpm vitest run tests/adapters/ones.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/adapters/ones.ts tests/adapters/ones.test.ts tests/fixtures/ones-response.json
git commit -m "feat: implement getRelatedIssues - returns all pending defects, current user first"
```

---

### Task 3: OnesAdapter 实现 `getIssueDetail`

**Files:**
- Modify: `src/adapters/ones.ts`
- Test: `tests/adapters/ones.test.ts`
- Modify: `tests/fixtures/ones-response.json`

**Step 1: 在 fixture 中添加 issueDetail 测试数据**

在 `tests/fixtures/ones-response.json` 顶层新增 `issueDetail` 字段：

```json
{
  "issueDetail": {
    "data": {
      "task": {
        "key": "task-6W9vW3y8J9DO66Pu",
        "uuid": "bug-uuid-001",
        "name": "登录页面崩溃",
        "description": "<p>用户在登录页面输入正确密码后点击登录，页面崩溃。</p><p><img src=\"https://ones.test/attachment/img1.png\" /></p>",
        "descriptionText": "用户在登录页面输入正确密码后点击登录，页面崩溃。",
        "desc_rich": "<p>用户在登录页面输入正确密码后点击登录，页面崩溃。</p><p><img src=\"https://ones.test/attachment/img1.png\" /></p>",
        "issueType": { "key": "it-1", "uuid": "it-uuid-1", "name": "缺陷", "detailType": 3 },
        "subIssueType": null,
        "status": { "uuid": "s-todo", "name": "待处理", "category": "to_do" },
        "priority": { "value": "high" },
        "assign": { "uuid": "current-user-uuid", "name": "当前用户" },
        "owner": { "uuid": "owner-uuid", "name": "产品经理" },
        "solver": { "uuid": "current-user-uuid", "name": "当前用户" },
        "project": { "uuid": "p1", "name": "StarCloud" },
        "severityLevel": { "value": "严重" },
        "deadline": "2026-03-20",
        "sprint": { "name": "Sprint 12", "uuid": "sprint-uuid-1" }
      }
    }
  }
}
```

**Step 2: 写失败测试**

在 `tests/adapters/ones.test.ts` 中新增：

```typescript
describe('getIssueDetail', () => {
  it('should fetch issue detail with description and rich text', async () => {
    mockLoginFlow()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(onesFixture.issueDetail),
    })

    const result = await adapter.getIssueDetail({ issueId: '6W9vW3y8J9DO66Pu' })

    expect(result.key).toBe('task-6W9vW3y8J9DO66Pu')
    expect(result.name).toContain('登录页面')
    expect(result.descriptionRich).toContain('<img')
    expect(result.descriptionText).toContain('页面崩溃')
    expect(result.issueTypeName).toBe('缺陷')
    expect(result.statusCategory).toBe('to_do')
    expect(result.solverName).toBe('当前用户')
  })

  it('should throw if issue not found', async () => {
    mockLoginFlow()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { task: null } }),
    })

    await expect(adapter.getIssueDetail({ issueId: 'nonexistent' }))
      .rejects.toThrow('not found')
  })
})
```

**Step 3: 运行测试确认失败**

Run: `pnpm vitest run tests/adapters/ones.test.ts`
Expected: FAIL — `adapter.getIssueDetail is not a function`

**Step 4: 在 OnesAdapter 中实现 `getIssueDetail`**

新增 GraphQL query 常量：

```typescript
const ISSUE_DETAIL_QUERY = `
  query Task($key: Key) {
    task(key: $key) {
      key uuid
      description
      descriptionText
      desc_rich: description
      name
      issueType { key uuid name detailType }
      subIssueType { key uuid name detailType }
      status { uuid name category }
      priority { value }
      assign { uuid name }
      owner { uuid name }
      solver { uuid name }
      project { uuid name }
      severityLevel { value }
      deadline(unit: ONESDATE)
      sprint { name uuid }
    }
  }
`
```

实现方法：

```typescript
async getIssueDetail(params: GetIssueDetailParams): Promise<IssueDetail> {
  const issueKey = params.issueId.startsWith('task-')
    ? params.issueId
    : `task-${params.issueId}`

  const data = await this.graphql<{
    data?: {
      task?: {
        key: string
        uuid: string
        name: string
        description: string
        descriptionText: string
        desc_rich: string
        issueType: { name: string }
        status: { name: string, category: string }
        priority?: { value: string } | null
        assign?: { uuid: string, name: string } | null
        owner?: { uuid: string, name: string } | null
        solver?: { uuid: string, name: string } | null
        project?: { uuid: string, name: string } | null
        severityLevel?: { value: string } | null
        deadline?: string | null
        sprint?: { name: string } | null
      }
    }
  }>(ISSUE_DETAIL_QUERY, { key: issueKey }, 'Task')

  const task = data.data?.task
  if (!task) {
    throw new Error(`ONES: Issue "${issueKey}" not found`)
  }

  return {
    key: task.key,
    uuid: task.uuid,
    name: task.name,
    description: task.description ?? '',
    descriptionRich: task.desc_rich ?? '',
    descriptionText: task.descriptionText ?? '',
    issueTypeName: task.issueType?.name ?? 'Unknown',
    statusName: task.status?.name ?? 'Unknown',
    statusCategory: task.status?.category ?? 'unknown',
    assignName: task.assign?.name ?? null,
    ownerName: task.owner?.name ?? null,
    solverName: task.solver?.name ?? null,
    priorityValue: task.priority?.value ?? null,
    severityLevel: task.severityLevel?.value ?? null,
    projectName: task.project?.name ?? null,
    deadline: task.deadline ?? null,
    sprintName: task.sprint?.name ?? null,
    raw: task as unknown as Record<string, unknown>,
  }
}
```

**Step 5: 运行测试确认通过**

Run: `pnpm vitest run tests/adapters/ones.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/adapters/ones.ts tests/adapters/ones.test.ts tests/fixtures/ones-response.json
git commit -m "feat: implement getIssueDetail in OnesAdapter with rich description support"
```

---

### Task 4: 新增 `get_related_issues` Tool Handler（输出按用户分组）

**Files:**
- Create: `src/tools/get-related-issues.ts`
- Test: `tests/tools/get-related-issues.test.ts`

**Step 1: 写失败测试**

创建 `tests/tools/get-related-issues.test.ts`：

```typescript
import type { BaseAdapter } from '../../src/adapters/base.js'
import type { RelatedIssue } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGetRelatedIssues } from '../../src/tools/get-related-issues.js'

const mockIssues: RelatedIssue[] = [
  {
    key: 'task-bug-001',
    uuid: 'bug-uuid-001',
    name: '登录页面崩溃',
    issueTypeName: '缺陷',
    statusName: '待处理',
    statusCategory: 'to_do',
    assignName: '当前用户',
    assignUuid: 'current-user-uuid',
    priorityValue: 'high',
    projectName: 'StarCloud',
  },
  {
    key: 'task-bug-004',
    uuid: 'bug-uuid-004',
    name: '表单提交失败',
    issueTypeName: '缺陷',
    statusName: '待处理',
    statusCategory: 'to_do',
    assignName: '其他人',
    assignUuid: 'other-user-uuid',
    priorityValue: 'high',
    projectName: 'StarCloud',
  },
]

function createMockAdapter(issues?: RelatedIssue[]): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn(),
    searchRequirements: vi.fn(),
    getRelatedIssues: vi.fn().mockResolvedValue(issues ?? mockIssues),
    getIssueDetail: vi.fn(),
  } as unknown as BaseAdapter
}

describe('handleGetRelatedIssues', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should return formatted related issues list with all defects', async () => {
    const result = await handleGetRelatedIssues(
      { taskId: 'HRL2p8rTX4mQ9xMv' },
      adapters,
      'ones',
    )

    expect(result.content).toHaveLength(1)
    const text = result.content[0].text
    expect(text).toContain('登录页面崩溃')
    expect(text).toContain('表单提交失败')
    expect(text).toContain('task-bug-001')
    expect(text).toContain('task-bug-004')
    expect(text).toContain('2') // total count
  })

  it('should handle empty results', async () => {
    adapters.set('ones', createMockAdapter([]))

    const result = await handleGetRelatedIssues(
      { taskId: 'xxx' },
      adapters,
      'ones',
    )

    expect(result.content[0].text).toContain('0')
  })

  it('should throw if no source specified and no default', async () => {
    await expect(
      handleGetRelatedIssues({ taskId: 'xxx' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })

  it('should throw if source not configured', async () => {
    await expect(
      handleGetRelatedIssues({ taskId: 'xxx', source: 'nonexistent' }, adapters, undefined),
    ).rejects.toThrow('not configured')
  })
})
```

**Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/tools/get-related-issues.test.ts`
Expected: FAIL — module not found

**Step 3: 实现 tool handler**

创建 `src/tools/get-related-issues.ts`：

```typescript
import type { BaseAdapter } from '../adapters/base.js'
import type { RelatedIssue } from '../types/requirement.js'
import { z } from 'zod/v4'

export const GetRelatedIssuesSchema = z.object({
  taskId: z.string().describe('The parent task ID or key (e.g. "HRL2p8rTX4mQ9xMv" or "task-HRL2p8rTX4mQ9xMv")'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetRelatedIssuesInput = z.infer<typeof GetRelatedIssuesSchema>

export async function handleGetRelatedIssues(
  input: GetRelatedIssuesInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const sourceType = input.source ?? defaultSource
  if (!sourceType) {
    throw new Error('No source specified and no default source configured')
  }

  const adapter = adapters.get(sourceType)
  if (!adapter) {
    throw new Error(
      `Source "${sourceType}" is not configured. Available: ${[...adapters.keys()].join(', ')}`,
    )
  }

  const issues = await adapter.getRelatedIssues({ taskId: input.taskId })

  return {
    content: [{ type: 'text' as const, text: formatRelatedIssues(issues) }],
  }
}

function formatRelatedIssues(issues: RelatedIssue[]): string {
  const lines = [
    `Found **${issues.length}** pending defects:`,
    '',
  ]

  if (issues.length === 0) {
    lines.push('No pending defects found for this task.')
    return lines.join('\n')
  }

  // 按 assignName 分组展示
  const grouped = new Map<string, RelatedIssue[]>()
  for (const issue of issues) {
    const assignee = issue.assignName ?? 'Unassigned'
    if (!grouped.has(assignee)) grouped.set(assignee, [])
    grouped.get(assignee)!.push(issue)
  }

  for (const [assignee, group] of grouped) {
    lines.push(`## ${assignee} (${group.length})`)
    lines.push('')
    for (const issue of group) {
      lines.push(`### ${issue.key}: ${issue.name}`)
      lines.push(`- Status: ${issue.statusName} | Priority: ${issue.priorityValue ?? 'N/A'}`)
      if (issue.projectName) {
        lines.push(`- Project: ${issue.projectName}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}
```

**Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/tools/get-related-issues.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/get-related-issues.ts tests/tools/get-related-issues.test.ts
git commit -m "feat: add get_related_issues tool handler with grouped output"
```

---

### Task 5: 新增 `get_issue_detail` Tool Handler

**Files:**
- Create: `src/tools/get-issue-detail.ts`
- Test: `tests/tools/get-issue-detail.test.ts`

**Step 1: 写失败测试**

创建 `tests/tools/get-issue-detail.test.ts`：

```typescript
import type { BaseAdapter } from '../../src/adapters/base.js'
import type { IssueDetail } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGetIssueDetail } from '../../src/tools/get-issue-detail.js'

const mockDetail: IssueDetail = {
  key: 'task-6W9vW3y8J9DO66Pu',
  uuid: 'bug-uuid-001',
  name: '登录页面崩溃',
  description: '<p>页面崩溃描述</p>',
  descriptionRich: '<p>页面崩溃描述</p><p><img src="https://ones.test/img.png" /></p>',
  descriptionText: '页面崩溃描述',
  issueTypeName: '缺陷',
  statusName: '待处理',
  statusCategory: 'to_do',
  assignName: '当前用户',
  ownerName: '产品经理',
  solverName: '当前用户',
  priorityValue: 'high',
  severityLevel: '严重',
  projectName: 'StarCloud',
  deadline: '2026-03-20',
  sprintName: 'Sprint 12',
  raw: {},
}

function createMockAdapter(detail?: IssueDetail): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn(),
    searchRequirements: vi.fn(),
    getRelatedIssues: vi.fn(),
    getIssueDetail: vi.fn().mockResolvedValue(detail ?? mockDetail),
  } as unknown as BaseAdapter
}

describe('handleGetIssueDetail', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should return formatted issue detail with description', async () => {
    const result = await handleGetIssueDetail(
      { issueId: '6W9vW3y8J9DO66Pu' },
      adapters,
      'ones',
    )

    expect(result.content).toHaveLength(1)
    const text = result.content[0].text
    expect(text).toContain('登录页面崩溃')
    expect(text).toContain('task-6W9vW3y8J9DO66Pu')
    expect(text).toContain('页面崩溃描述')
    expect(text).toContain('缺陷')
    expect(text).toContain('待处理')
    expect(text).toContain('严重')
  })

  it('should include image URLs from rich description', async () => {
    const result = await handleGetIssueDetail(
      { issueId: '6W9vW3y8J9DO66Pu' },
      adapters,
      'ones',
    )

    expect(result.content[0].text).toContain('https://ones.test/img.png')
  })

  it('should throw if no source specified and no default', async () => {
    await expect(
      handleGetIssueDetail({ issueId: 'xxx' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })

  it('should throw if source not configured', async () => {
    await expect(
      handleGetIssueDetail({ issueId: 'xxx', source: 'nonexistent' }, adapters, undefined),
    ).rejects.toThrow('not configured')
  })
})
```

**Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/tools/get-issue-detail.test.ts`
Expected: FAIL — module not found

**Step 3: 实现 tool handler**

创建 `src/tools/get-issue-detail.ts`：

```typescript
import type { BaseAdapter } from '../adapters/base.js'
import type { IssueDetail } from '../types/requirement.js'
import { z } from 'zod/v4'

export const GetIssueDetailSchema = z.object({
  issueId: z.string().describe('The issue task ID or key (e.g. "6W9vW3y8J9DO66Pu" or "task-6W9vW3y8J9DO66Pu")'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetIssueDetailInput = z.infer<typeof GetIssueDetailSchema>

export async function handleGetIssueDetail(
  input: GetIssueDetailInput,
  adapters: Map<string, BaseAdapter>,
  defaultSource?: string,
) {
  const sourceType = input.source ?? defaultSource
  if (!sourceType) {
    throw new Error('No source specified and no default source configured')
  }

  const adapter = adapters.get(sourceType)
  if (!adapter) {
    throw new Error(
      `Source "${sourceType}" is not configured. Available: ${[...adapters.keys()].join(', ')}`,
    )
  }

  const detail = await adapter.getIssueDetail({ issueId: input.issueId })

  return {
    content: [{ type: 'text' as const, text: formatIssueDetail(detail) }],
  }
}

function formatIssueDetail(detail: IssueDetail): string {
  const lines = [
    `# ${detail.name}`,
    '',
    `- **Key**: ${detail.key}`,
    `- **UUID**: ${detail.uuid}`,
    `- **Type**: ${detail.issueTypeName}`,
    `- **Status**: ${detail.statusName} (${detail.statusCategory})`,
    `- **Priority**: ${detail.priorityValue ?? 'N/A'}`,
    `- **Severity**: ${detail.severityLevel ?? 'N/A'}`,
    `- **Assignee**: ${detail.assignName ?? 'Unassigned'}`,
    `- **Owner**: ${detail.ownerName ?? 'Unknown'}`,
    `- **Solver**: ${detail.solverName ?? 'Unassigned'}`,
  ]

  if (detail.projectName) lines.push(`- **Project**: ${detail.projectName}`)
  if (detail.sprintName) lines.push(`- **Sprint**: ${detail.sprintName}`)
  if (detail.deadline) lines.push(`- **Deadline**: ${detail.deadline}`)

  lines.push('', '## Description', '')
  if (detail.descriptionRich) {
    lines.push(detail.descriptionRich)

    // 提取图片 URL 单独列出
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g
    const images: string[] = []
    let match: RegExpExecArray | null
    while ((match = imgRegex.exec(detail.descriptionRich)) !== null) {
      images.push(match[1])
    }
    if (images.length > 0) {
      lines.push('', '## Images', '')
      for (const url of images) {
        lines.push(`- ![image](${url})`)
      }
    }
  }
  else if (detail.descriptionText) {
    lines.push(detail.descriptionText)
  }
  else {
    lines.push('_No description_')
  }

  return lines.join('\n')
}
```

**Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/tools/get-issue-detail.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/get-issue-detail.ts tests/tools/get-issue-detail.test.ts
git commit -m "feat: add get_issue_detail tool handler with rich description and image extraction"
```

---

### Task 6: 在 MCP Server 中注册新工具

**Files:**
- Modify: `src/index.ts`

**Step 1: 在 `src/index.ts` 中导入新 handler 并注册工具**

在 import 区域新增：

```typescript
import { GetRelatedIssuesSchema, handleGetRelatedIssues } from './tools/get-related-issues.js'
import { GetIssueDetailSchema, handleGetIssueDetail } from './tools/get-issue-detail.js'
```

在 `server.tool(...)` 注册区域（`list_sources` 之后）新增：

```typescript
server.tool(
  'get_related_issues',
  'Get pending defect issues (bugs) related to a requirement task. Returns all pending defects grouped by assignee (current user first).',
  GetRelatedIssuesSchema.shape,
  async (params) => {
    try {
      return await handleGetRelatedIssues(params, adapters, config.config.defaultSource)
    }
    catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      }
    }
  },
)

server.tool(
  'get_issue_detail',
  'Get detailed information about a specific issue/defect including description, rich text, and images',
  GetIssueDetailSchema.shape,
  async (params) => {
    try {
      return await handleGetIssueDetail(params, adapters, config.config.defaultSource)
    }
    catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      }
    }
  },
)
```

**Step 2: 运行 typecheck 确认编译通过**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: 运行全部测试确认无回归**

Run: `pnpm vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: register get_related_issues and get_issue_detail tools in MCP server"
```

---

### Task 7: 构建与 Lint 验证

**Files:**
- All modified files

**Step 1: 运行 lint**

Run: `pnpm lint`
Expected: PASS（如有 lint 错误，运行 `pnpm lint:fix` 修复）

**Step 2: 运行全部测试**

Run: `pnpm vitest run`
Expected: ALL PASS

**Step 3: 运行 typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: 构建**

Run: `pnpm build`
Expected: PASS — `dist/index.mjs` 生成成功

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: lint and build verification for related-issues feature"
```

---

### Task 8: MCP Inspector 端到端验证

**前置条件：** 确保 `.env` 文件中配置了 `ONES_API_BASE`、`ONES_ACCOUNT`、`ONES_PASSWORD`。

**Step 1: 启动 MCP Inspector**

Run: `pnpm inspect`

这会执行 `npx @modelcontextprotocol/inspector node --env-file=.env ./dist/index.mjs`，打开浏览器中的 Inspector UI。

**Step 2: 验证工具列表**

在 Inspector 的 Tools 面板中，确认能看到 5 个工具：
- `get_requirement`
- `search_requirements`
- `list_sources`
- `get_related_issues` ← 新增
- `get_issue_detail` ← 新增

**Step 3: 测试 `get_related_issues`**

在 Inspector 中调用 `get_related_issues`：
- 参数：`{ "taskId": "<一个真实的需求 task UUID 或 key>" }`
- 预期：返回该需求关联的所有待处理缺陷列表，按当前用户/其他人分组
- 验证：
  - 返回的 issue 都是 detailType=3（缺陷）
  - 返回的 issue 都是 status.category=to_do（待处理）
  - 当前用户的 issue 排在前面
  - 其他人的 issue 也能看到

**Step 4: 测试 `get_issue_detail`**

从 Step 3 的结果中选一个 issue key，调用 `get_issue_detail`：
- 参数：`{ "issueId": "<从 Step 3 结果中选择的 issue key>" }`
- 预期：返回该 issue 的完整详情
- 验证：
  - 包含 description 富文本内容
  - 如果有图片，Images 部分列出了图片 URL
  - 包含 severity、priority、assignee 等字段

**Step 5: 测试边界情况**

- 传入一个没有关联缺陷的需求 taskId → 应返回 "0 pending defects"
- 传入不存在的 issueId → 应返回 Error: not found
- 不传 source 参数 → 应使用默认 source（ones）

**Step 6: 确认无误后 Commit**

```bash
git add -A
git commit -m "chore: verified via MCP Inspector - related-issues feature complete"
```

---

## 文件变更总结

| 操作 | 文件 |
|------|------|
| Modify | `src/types/requirement.ts` — 新增 `RelatedIssue`（含 `assignUuid`）, `IssueDetail` 接口 |
| Modify | `src/adapters/base.ts` — 新增 `GetRelatedIssuesParams`, `GetIssueDetailParams` 接口和抽象方法 |
| Modify | `src/adapters/ones.ts` — 实现 `getRelatedIssues`（全部待处理缺陷，当前用户优先排序）, `getIssueDetail`；`OnesSession` 新增 `userUuid`；新增 2 个 GraphQL query |
| Create | `src/tools/get-related-issues.ts` — `get_related_issues` tool handler，按 assignee 分组输出 |
| Create | `src/tools/get-issue-detail.ts` — `get_issue_detail` tool handler，含图片提取 |
| Modify | `src/index.ts` — 注册 2 个新工具 |
| Modify | `tests/fixtures/ones-response.json` — 新增 `relatedIssues`, `issueDetail` fixture |
| Modify | `tests/adapters/ones.test.ts` — 新增 `getRelatedIssues`, `getIssueDetail` 测试 |
| Create | `tests/tools/get-related-issues.test.ts` — tool handler 测试 |
| Create | `tests/tools/get-issue-detail.test.ts` — tool handler 测试 |

## 关键设计决策

1. **不限制用户**：`getRelatedIssues` 返回所有待处理缺陷，不仅限当前用户。你可以查自己的也可以查其他人的
2. **当前用户优先排序**：通过 login 流程保存的 `userUuid` 做排序，当前用户的缺陷排在最前面
3. **按 assignee 分组输出**：tool handler 的输出按负责人分组展示，一目了然
4. **缺陷判断**：使用 `issueType.detailType === 3` 或 `subIssueType.detailType === 3`
5. **待处理判断**：使用 `status.category === "to_do"`
6. **图片处理**：从 `desc_rich` 中提取 `<img>` 标签的 src URL，单独列出方便 AI 查看
7. **Key 前缀**：自动处理 `task-` 前缀，用户可以传带或不带前缀的 ID
8. **MCP Inspector 验证**：Task 8 通过 `pnpm inspect` 做真实 API 端到端测试
