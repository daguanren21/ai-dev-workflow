# ONES 三类查询能力整合 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 ONES MCP 能力上整合三类查询模式：按需求查询需求文档、按需求查询关联缺陷、按“我的缺陷/我的任务”查询当前用户任务项列表。

**Architecture:** 保留现有 `getRequirement` 和 `getRelatedIssues` 能力不变，把第三个 API 接入 `OnesAdapter.searchRequirements()` 的意图识别流程。需求文档查询继续按显式需求 ID 或编号走 `getRequirement`，不依赖“负责人是当前用户”这个条件，因为 `detailType = 1` 的需求通常归产品负责人维护，当前用户未必能从“我的任务项”里查到。查询“我的缺陷”时，先通过 `issueTypes` 解析出 `detailType = 3` 的缺陷类型，再配合 `group-task-data` 拉取当前用户任务项，并在本地限定状态为未处理或处理中；查询“我的任务”时，只解析 `detailType = 2` 的任务类型并返回列表，供用户继续按编号或关键词定位。

**Tech Stack:** TypeScript, Vitest, Zod v4, MCP SDK, ONES GraphQL API

---

### Task 1: 为第三类查询补齐失败测试与 fixture

**Files:**
- Modify: `tests/adapters/ones.test.ts`
- Modify: `tests/fixtures/ones-response.json`
- Test: `tests/tools/search-requirements.test.ts`

**Step 1: 在 fixture 中新增 `issueTypes` 和 `search` 场景数据**

```json
{
  "issueTypes": {
    "data": {
      "issueTypes": [
        { "uuid": "it-bug", "name": "缺陷", "detailType": 3 },
        { "uuid": "it-task", "name": "任务", "detailType": 2 },
        { "uuid": "it-requirement", "name": "需求", "detailType": 1 }
      ]
    }
  },
  "search": {
    "data": {
      "buckets": [
        {
          "key": "default",
          "tasks": [
            {
              "key": "task-bug-001",
              "uuid": "bug-001",
              "number": 101,
              "name": "登录页白屏",
              "issueType": { "uuid": "it-bug", "name": "缺陷" },
              "status": { "uuid": "s-todo", "name": "待处理", "category": "to_do" },
              "assign": { "uuid": "current-user-uuid", "name": "当前用户" }
            },
            {
              "key": "task-bug-002",
              "uuid": "bug-002",
              "number": 102,
              "name": "导出报错",
              "issueType": { "uuid": "it-bug", "name": "缺陷" },
              "status": { "uuid": "s-fixing", "name": "修复中", "category": "in_progress" },
              "assign": { "uuid": "current-user-uuid", "name": "当前用户" }
            },
            {
              "key": "task-task-003",
              "uuid": "task-003",
              "number": 103,
              "name": "数据库迁移脚本",
              "issueType": { "uuid": "it-task", "name": "任务" },
              "status": { "uuid": "s-dev", "name": "开发中", "category": "in_progress" },
              "assign": { "uuid": "current-user-uuid", "name": "当前用户" }
            },
            {
              "key": "task-req-004",
              "uuid": "req-004",
              "number": 104,
              "name": "认证流程重构",
              "issueType": { "uuid": "it-requirement", "name": "需求" },
              "status": { "uuid": "s-todo2", "name": "待处理", "category": "to_do" },
              "assign": { "uuid": "current-user-uuid", "name": "当前用户" }
            }
          ]
        }
      ]
    }
  }
}
```

**Step 2: 先写 adapter 层失败测试，覆盖“我的缺陷”和“我的任务”，并确认需求不会混入“我的任务”**

```ts
it('should return current user bugs in to_do and in_progress when query asks for 我的缺陷', async () => {
  mockLoginFlow()
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(onesFixture.issueTypes),
  })
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(onesFixture.search),
  })

  const result = await adapter.searchRequirements({ query: '查询我所有缺陷' })

  expect(result.items.map(item => item.id)).toEqual(['bug-001', 'bug-002'])
  expect(result.items.every(item => item.type === 'bug')).toBe(true)
})

it('should return current user tasks when query asks for 我的任务', async () => {
  mockLoginFlow()
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(onesFixture.issueTypes),
  })
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(onesFixture.search),
  })

  const result = await adapter.searchRequirements({ query: '查询我所有任务' })

  expect(result.items).toHaveLength(1)
  expect(result.items[0].id).toBe('task-003')
  expect(result.items[0].type).toBe('task')
  expect(result.items.find(item => item.id === 'req-004')).toBeUndefined()
})
```

**Step 3: 补一个工具层测试，确认返回给用户的是列表而不是单条详情**

```ts
it('should format list output for 我的缺陷 query', async () => {
  adapter.searchRequirements = vi.fn().mockResolvedValue({
    items: [
      { id: 'bug-001', title: '#101 登录页白屏', status: 'open', priority: 'high', type: 'bug', assignee: '当前用户', description: '' },
      { id: 'bug-002', title: '#102 导出报错', status: 'in_progress', priority: 'normal', type: 'bug', assignee: '当前用户', description: '' },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
  })

  const result = await handleSearchRequirements({ query: '查询我所有缺陷' }, adapters, 'ones')

  expect(result.content[0].text).toContain('Found **2** results')
  expect(result.content[0].text).toContain('#101 登录页白屏')
  expect(result.content[0].text).toContain('#102 导出报错')
})
```

**Step 4: 运行测试确认失败**

Run: `pnpm vitest run tests/adapters/ones.test.ts tests/tools/search-requirements.test.ts`
Expected: FAIL，报错点应集中在 `issueTypes` 尚未接入、意图尚未识别、筛选结果数量不正确。

**Step 5: Commit**

```bash
git add tests/adapters/ones.test.ts tests/tools/search-requirements.test.ts tests/fixtures/ones-response.json
git commit -m "test: add failing cases for ones bug/task list queries"
```

---

### Task 2: 在 OnesAdapter 中接入 issueTypes 查询与缓存

**Files:**
- Modify: `src/adapters/ones.ts`
- Test: `tests/adapters/ones.test.ts`

**Step 1: 新增 issueTypes GraphQL 常量与类型定义**

```ts
interface OnesIssueTypeNode {
  uuid: string
  name: string
  detailType: number
}

const ISSUE_TYPES_QUERY = `
  query IssueTypes($orderBy: OrderBy) {
    issueTypes(orderBy: $orderBy) {
      uuid
      name
      detailType
    }
  }
`
```

**Step 2: 在 adapter 中增加一个轻量缓存方法**

```ts
private issueTypesCache: OnesIssueTypeNode[] | null = null

private async fetchIssueTypes(): Promise<OnesIssueTypeNode[]> {
  if (this.issueTypesCache)
    return this.issueTypesCache

  const data = await this.graphql<{ data?: { issueTypes?: OnesIssueTypeNode[] } }>(
    ISSUE_TYPES_QUERY,
    { orderBy: { namePinyin: 'ASC' } },
    'issueTypes',
  )

  this.issueTypesCache = data.data?.issueTypes ?? []
  return this.issueTypesCache
}
```

**Step 3: 写一个最小测试，确认同一 session 内不会重复请求 issueTypes**

```ts
it('should reuse issue type cache across repeated search queries', async () => {
  mockLoginFlow()
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(onesFixture.issueTypes) })
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(onesFixture.search) })

  await adapter.searchRequirements({ query: '查询我所有缺陷' })

  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(onesFixture.search) })
  await adapter.searchRequirements({ query: '查询我所有任务' })

  const issueTypeCalls = mockFetch.mock.calls.filter(call => String(call[0]).includes('t=issueTypes'))
  expect(issueTypeCalls).toHaveLength(1)
})
```

**Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/adapters/ones.test.ts -t "issue type cache"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/ones.ts tests/adapters/ones.test.ts
git commit -m "feat: add cached issueTypes lookup for ones search"
```

---

### Task 3: 实现“我的缺陷 / 我的任务”查询意图解析与筛选

**Files:**
- Modify: `src/adapters/ones.ts`
- Test: `tests/adapters/ones.test.ts`

**Step 1: 在 `searchRequirements()` 上方增加查询意图解析 helper**

```ts
type OnesSearchIntent = 'all_bugs' | 'all_tasks' | 'keyword'

function parseOnesSearchIntent(query: string): OnesSearchIntent {
  if (/我.*缺陷|我.*bug|我的bug|我的缺陷/i.test(query))
    return 'all_bugs'

  if (/我.*任务|我的任务/i.test(query))
    return 'all_tasks'

  return 'keyword'
}
```

**Step 2: 根据 `issueTypes` 结果构造 `issueType_in` 过滤条件**

```ts
const issueTypes = await this.fetchIssueTypes()
const bugTypeUuids = issueTypes.filter(item => item.detailType === 3).map(item => item.uuid)
const taskTypeUuids = issueTypes.filter(item => item.detailType === 2).map(item => item.uuid)

const intent = parseOnesSearchIntent(params.query)
const filter: Record<string, unknown> = {
  assign_in: ['${currentUser}'],
  status_notIn: DEFAULT_STATUS_NOT_IN,
}

if (intent === 'all_bugs')
  filter.issueType_in = bugTypeUuids

if (intent === 'all_tasks')
  filter.issueType_in = taskTypeUuids
```

**Step 3: 对“我的缺陷”追加本地状态过滤，只保留未处理和处理中；“我的任务”只保留 detailType = 2**

```ts
let tasks = data.data?.buckets?.flatMap(bucket => bucket.tasks ?? []) ?? []

if (intent === 'all_bugs') {
  tasks = tasks.filter((task) => {
    const category = task.status?.category
    return category === 'to_do' || category === 'in_progress'
  })
}

if (intent === 'all_tasks') {
  tasks = tasks.filter(task => task.issueType?.uuid && taskTypeUuids.includes(task.issueType.uuid))
}
```

**Step 3.1: 保留一个显式业务注释，避免后续把需求合并进任务列表**

```ts
// 注意：detailType = 1 的“需求”不属于“我的任务”列表入口。
// 需求详情查询继续走 getRequirement(id/number)，因为需求通常由产品负责人维护，
// 当前登录用户不一定能通过 assign_in: ['${currentUser}'] 查到需求项。
```

**Step 4: 保留原有关键词 / 编号搜索逻辑作为兜底**

```ts
if (intent === 'keyword' && params.query) {
  const keyword = params.query.trim()
  const lower = keyword.toLowerCase()
  const numMatch = keyword.match(/^#?(\\d+)$/)

  if (numMatch) {
    tasks = tasks.filter(t => t.number === Number.parseInt(numMatch[1], 10))
  }
  else {
    tasks = tasks.filter(t => t.name.toLowerCase().includes(lower))
  }
}
```

**Step 5: 跑整组 adapter 测试**

Run: `pnpm vitest run tests/adapters/ones.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/adapters/ones.ts tests/adapters/ones.test.ts
git commit -m "feat: support ones all bugs and all tasks search intents"
```

---

### Task 4: 调整搜索结果文案，明确这是列表查询入口

**Files:**
- Modify: `src/tools/search-requirements.ts`
- Test: `tests/tools/search-requirements.test.ts`

**Step 1: 让工具输出更适合“列表继续查找”的场景**

```ts
const lines = [
  `Found **${result.total}** items (page ${result.page}/${Math.ceil(result.total / result.pageSize) || 1}):`,
  '',
]
```

**Step 2: 当 query 命中“我的缺陷/我的任务”时，补一行说明**

```ts
if (/我.*缺陷|我的bug|我的任务/i.test(input.query)) {
  lines.push(`Query: ${input.query}`)
  lines.push('Use an item ID or number in the next step to fetch detail.')
  lines.push('')
}
```

**Step 3: 写测试覆盖新文案**

```ts
expect(result.content[0].text).toContain('Found **2** items')
expect(result.content[0].text).toContain('Use an item ID or number in the next step to fetch detail.')
```

**Step 4: 运行工具层测试**

Run: `pnpm vitest run tests/tools/search-requirements.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/search-requirements.ts tests/tools/search-requirements.test.ts
git commit -m "feat: clarify list-search output for ones task queries"
```

---

### Task 5: 做回归验证，确保前两类能力不被第三类查询破坏

**Files:**
- Test: `tests/adapters/ones.test.ts`
- Test: `tests/tools/get-related-issues.test.ts`
- Test: `tests/tools/get-issue-detail.test.ts`

**Step 1: 运行已有“需求详情”和“关联缺陷”测试**

Run: `pnpm vitest run tests/adapters/ones.test.ts -t "getRequirement|getRelatedIssues|getIssueDetail"`
Expected: PASS

**Step 2: 运行工具层回归测试**

Run: `pnpm vitest run tests/tools/get-related-issues.test.ts tests/tools/get-issue-detail.test.ts`
Expected: PASS

**Step 3: 运行全量测试与类型检查**

Run: `pnpm test`
Expected: PASS

Run: `pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add .
git commit -m "test: verify ones three-mode query workflow regression"
```
