# 测试用例获取工具 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 MCP Server 新增 `get_testcases` 工具，输入任务编号（如 302），自动查找 ONES 用例库中对应模块下的所有测试用例，返回用例列表及每个用例的详细步骤。

**Architecture:** 流程分三步：① 按任务编号搜索任务名（如 `#302 RMA重构`）；② 在用例库中按名称匹配找到对应模块 UUID；③ 用模块 UUID 分页获取所有用例列表，再批量获取用例详情（含步骤）。在 `OnesAdapter` 中新增 `getTestcases` 方法，使用 ONES GraphQL API 的 `testcaseModules` 和 `testcaseCases` / `testcaseCaseSteps` 查询。用例库 UUID 通过 config `options.testcaseLibraryUuid` 配置。

**Tech Stack:** TypeScript, Vitest, Zod v4, MCP SDK, ONES GraphQL API

**关键接口（已验证）：**
- 模块搜索：`testcaseModules(filter: { testcaseLibrary_in: [libraryUuid], name_match: "#302" })`
- 用例列表：`buckets > testcaseCases(filterGroup: [{ testcaseLibrary_in: [libraryUuid], path_match: moduleUuid }])`，分页 limit 50
- 用例详情：`testcaseCases(filter: { uuid_in: [uuids] })` + `testcaseCaseSteps(filter: { testcaseCase_in: [uuids] })`

---

### Task 1: 新增 TestCase 类型和 BaseAdapter 抽象方法

**Files:**
- Modify: `src/types/requirement.ts`
- Modify: `src/adapters/base.ts`

**Step 1: 在 `src/types/requirement.ts` 末尾追加类型**

```typescript
export interface TestCaseStep {
  uuid: string
  index: number
  desc: string
  result: string
}

export interface TestCase {
  uuid: string
  id: string        // e.g. "T166341"
  name: string
  priority: string   // e.g. "P0"
  type: string       // e.g. "功能测试"
  assignName: string | null
  condition: string  // 前置条件
  desc: string       // 备注/描述 (HTML)
  steps: TestCaseStep[]
  modulePath: string
}

export interface TestCaseResult {
  taskNumber: number
  taskName: string
  moduleName: string
  moduleUuid: string
  totalCount: number
  cases: TestCase[]
}
```

**Step 2: 在 `src/adapters/base.ts` 新增参数接口和抽象方法**

```typescript
// 新增 import
import type { ..., TestCaseResult } from '../types/requirement.js'

// 新增参数接口
export interface GetTestcasesParams {
  taskNumber: number
  libraryUuid?: string
}

// 在 BaseAdapter class 内追加
abstract getTestcases(params: GetTestcasesParams): Promise<TestCaseResult>
```

**Step 3: 运行 typecheck 确认 OnesAdapter 报错**

Run: `pnpm typecheck`
Expected: FAIL — OnesAdapter 缺少 `getTestcases` 实现

**Step 4: Commit**

```bash
git add src/types/requirement.ts src/adapters/base.ts
git commit -m "feat: add TestCase types and getTestcases abstract method"
```

---

### Task 2: OnesAdapter 实现 `getTestcases` — 模块搜索

**Files:**
- Modify: `src/adapters/ones.ts`
- Test: `tests/adapters/ones.test.ts`
- Modify: `tests/fixtures/ones-response.json`

**Step 1: 在 fixture 中添加测试数据**

在 `tests/fixtures/ones-response.json` 顶层新增：

```json
{
  "testcaseModuleSearch": {
    "data": {
      "testcaseModules": [
        {
          "key": "testcase_module-Dkdie5Tu",
          "name": "#302 RMA重构",
          "uuid": "Dkdie5Tu",
          "parent": { "name": "项目相关[2026]", "uuid": "X8VBwf4v" }
        }
      ]
    }
  },
  "testcaseList": {
    "data": {
      "buckets": [{
        "key": "bucket.0.__all",
        "pageInfo": { "count": 2, "totalCount": 2, "hasNextPage": false, "endCursor": "" },
        "testcaseCases": [
          { "uuid": "case-001", "id": "T166341", "name": "01.检查seller端菜单设置", "key": "testcase_case-case-001", "priority": { "uuid": "p1", "value": "P0" }, "type": { "uuid": "t1", "value": "功能测试" }, "assign": { "uuid": "u1", "name": "戚明珠" }, "testcaseModule": { "uuid": "Dkdie5Tu" } },
          { "uuid": "case-002", "id": "T166342", "name": "02.历史售后规则初始化检查", "key": "testcase_case-case-002", "priority": { "uuid": "p1", "value": "P0" }, "type": { "uuid": "t1", "value": "功能测试" }, "assign": { "uuid": "u1", "name": "戚明珠" }, "testcaseModule": { "uuid": "Dkdie5Tu" } }
        ]
      }]
    }
  },
  "testcaseDetail": {
    "data": {
      "testcaseCases": [
        { "uuid": "case-001", "id": "T166341", "name": "01.检查seller端菜单设置", "key": "testcase_case-case-001", "condition": "", "desc": "", "assign": { "uuid": "u1", "name": "戚明珠" }, "priority": { "uuid": "p1", "value": "P0" }, "type": { "uuid": "t1", "value": "功能测试" }, "path": "X8VBwf4v-Dkdie5Tu-case-001", "testcaseLibrary": { "uuid": "KQjsNmut" }, "testcaseModule": { "uuid": "Dkdie5Tu" }, "relatedTasks": [{ "uuid": "task-uuid-302", "name": "#302 RMA重构", "number": 90058 }] },
        { "uuid": "case-002", "id": "T166342", "name": "02.历史售后规则初始化检查", "key": "testcase_case-case-002", "condition": "seller已有历史售后规则", "desc": "", "assign": { "uuid": "u1", "name": "戚明珠" }, "priority": { "uuid": "p1", "value": "P0" }, "type": { "uuid": "t1", "value": "功能测试" }, "path": "X8VBwf4v-Dkdie5Tu-case-002", "testcaseLibrary": { "uuid": "KQjsNmut" }, "testcaseModule": { "uuid": "Dkdie5Tu" }, "relatedTasks": [] }
      ],
      "testcaseCaseSteps": [
        { "uuid": "step-001", "key": "testcase_case_step-step-001", "testcaseCase": { "uuid": "case-001" }, "desc": "使用seller账号登入，检查菜单", "result": "新增菜单：店铺管理-售后规则设置", "index": 0 },
        { "uuid": "step-002", "key": "testcase_case_step-step-002", "testcaseCase": { "uuid": "case-002" }, "desc": "打开已有规则的seller页面", "result": "显示历史规则列表", "index": 0 },
        { "uuid": "step-003", "key": "testcase_case_step-step-003", "testcaseCase": { "uuid": "case-002" }, "desc": "检查初始化状态", "result": "规则状态为已生效", "index": 1 }
      ]
    }
  },
  "taskSearch302": {
    "data": {
      "buckets": [{
        "key": "default",
        "tasks": [{ "key": "task-LTFJt58zvGWkDFMA", "uuid": "LTFJt58zvGWkDFMA", "number": 302, "name": "#302 RMA重构" }]
      }]
    }
  }
}
```

**Step 2: 写失败测试**

在 `tests/adapters/ones.test.ts` 新增 describe block：

```typescript
describe('getTestcases', () => {
  it('should find module by task number and return testcases with steps', async () => {
    mockLoginFlow()
    // 8. search task by number
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(onesFixture.taskSearch302),
    })
    // 9. search testcase module by name
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(onesFixture.testcaseModuleSearch),
    })
    // 10. list testcases in module (paged)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(onesFixture.testcaseList),
    })
    // 11. fetch testcase details + steps
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(onesFixture.testcaseDetail),
    })

    const result = await adapter.getTestcases({ taskNumber: 302, libraryUuid: 'KQjsNmut' })

    expect(result.taskNumber).toBe(302)
    expect(result.taskName).toBe('#302 RMA重构')
    expect(result.moduleName).toBe('#302 RMA重构')
    expect(result.totalCount).toBe(2)
    expect(result.cases).toHaveLength(2)

    // First case has 1 step
    expect(result.cases[0].id).toBe('T166341')
    expect(result.cases[0].steps).toHaveLength(1)
    expect(result.cases[0].steps[0].desc).toContain('seller账号')

    // Second case has 2 steps
    expect(result.cases[1].id).toBe('T166342')
    expect(result.cases[1].condition).toBe('seller已有历史售后规则')
    expect(result.cases[1].steps).toHaveLength(2)
  })

  it('should throw if task number not found', async () => {
    mockLoginFlow()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { buckets: [{ tasks: [] }] } }),
    })

    await expect(adapter.getTestcases({ taskNumber: 99999, libraryUuid: 'KQjsNmut' }))
      .rejects.toThrow('not found')
  })

  it('should throw if no matching module found in testcase library', async () => {
    mockLoginFlow()
    // task found
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(onesFixture.taskSearch302),
    })
    // no matching module
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { testcaseModules: [] } }),
    })

    await expect(adapter.getTestcases({ taskNumber: 302, libraryUuid: 'KQjsNmut' }))
      .rejects.toThrow('No testcase module')
  })
})
```

**Step 3: 运行测试确认失败**

Run: `pnpm vitest run tests/adapters/ones.test.ts`
Expected: FAIL — `adapter.getTestcases is not a function`

**Step 4: 在 OnesAdapter 中实现 `getTestcases`**

在 `src/adapters/ones.ts` 中新增 3 个 GraphQL query 常量：

```typescript
const TESTCASE_MODULE_SEARCH_QUERY = `
  query Q($filter: Filter) {
    testcaseModules(filter: $filter) {
      uuid name key
      parent { uuid name }
    }
  }
`

const TESTCASE_LIST_PAGED_QUERY = `
  query PAGED_LIBRARY_TESTCASE_LIST($testCaseFilter: Filter) {
    buckets(groupBy: {testcaseCases: {}}, pagination: {limit: 50, after: "", preciseCount: true}) {
      testcaseCases(filterGroup: $testCaseFilter, limit: 10000) {
        uuid name key id
        priority { uuid value }
        type { uuid value }
        assign { uuid name }
        testcaseModule { uuid }
      }
      key
      pageInfo { count totalCount hasNextPage endCursor }
    }
  }
`

const TESTCASE_DETAIL_QUERY = `
  query QUERY_TESTCASES_DETAIL($testCaseFilter: Filter, $stepFilter: Filter) {
    testcaseCases(filter: $testCaseFilter) {
      uuid name key id condition desc path
      assign { uuid name }
      priority { uuid value }
      type { uuid value }
      testcaseLibrary { uuid }
      testcaseModule { uuid }
      relatedTasks { uuid name number }
    }
    testcaseCaseSteps(filter: $stepFilter, orderBy: { index: ASC }) {
      key uuid
      testcaseCase { uuid }
      desc result index
    }
  }
`
```

实现方法：

```typescript
async getTestcases(params: GetTestcasesParams): Promise<TestCaseResult> {
  const libraryUuid = params.libraryUuid
    ?? (this.config.options?.testcaseLibraryUuid as string)
  if (!libraryUuid) {
    throw new Error('ONES: testcaseLibraryUuid not configured. Set it in options.testcaseLibraryUuid')
  }

  // Step 1: Search task by number to get task name
  const searchData = await this.graphql<{
    data?: { buckets?: Array<{ tasks?: Array<{ uuid: string, number: number, name: string }> }> }
  }>(
    SEARCH_TASKS_QUERY,
    {
      groupBy: { tasks: {} },
      groupOrderBy: null,
      orderBy: { createTime: 'DESC' },
      filterGroup: [{ number_in: [params.taskNumber] }],
      search: null,
      pagination: { limit: 10, preciseCount: false },
      limit: 10,
    },
    'group-task-data',
  )

  const allTasks = searchData.data?.buckets?.flatMap(b => b.tasks ?? []) ?? []
  const task = allTasks.find(t => t.number === params.taskNumber)
  if (!task) {
    throw new Error(`ONES: Task #${params.taskNumber} not found`)
  }

  // Step 2: Search testcase module by task name (e.g. "#302 RMA重构")
  const moduleData = await this.graphql<{
    data?: { testcaseModules?: Array<{ uuid: string, name: string }> }
  }>(
    TESTCASE_MODULE_SEARCH_QUERY,
    { filter: { testcaseLibrary_in: [libraryUuid], name_match: `#${params.taskNumber}` } },
    'find-testcase-module',
  )

  const modules = moduleData.data?.testcaseModules ?? []
  if (modules.length === 0) {
    throw new Error(`ONES: No testcase module matching "#${params.taskNumber}" in library ${libraryUuid}`)
  }
  const mod = modules[0]

  // Step 3: List all testcases under this module (single page, up to 10000)
  const listData = await this.graphql<{
    data?: {
      buckets?: Array<{
        pageInfo: { totalCount: number, hasNextPage: boolean }
        testcaseCases: Array<{ uuid: string, id: string, name: string }>
      }>
    }
  }>(
    TESTCASE_LIST_PAGED_QUERY,
    { testCaseFilter: [{ testcaseLibrary_in: [libraryUuid], path_match: mod.uuid }] },
    'testcase-list-paged',
  )

  const bucket = listData.data?.buckets?.[0]
  const caseList = bucket?.testcaseCases ?? []
  const totalCount = bucket?.pageInfo?.totalCount ?? caseList.length

  if (caseList.length === 0) {
    return {
      taskNumber: params.taskNumber,
      taskName: task.name,
      moduleName: mod.name,
      moduleUuid: mod.uuid,
      totalCount: 0,
      cases: [],
    }
  }

  // Step 4: Fetch details + steps in batches of 20
  const allCases: TestCase[] = []
  const BATCH_SIZE = 20
  for (let i = 0; i < caseList.length; i += BATCH_SIZE) {
    const batch = caseList.slice(i, i + BATCH_SIZE)
    const uuids = batch.map(c => c.uuid)

    const detailData = await this.graphql<{
      data?: {
        testcaseCases: Array<{
          uuid: string, id: string, name: string, condition: string, desc: string, path: string
          assign?: { name: string } | null
          priority?: { value: string } | null
          type?: { value: string } | null
        }>
        testcaseCaseSteps: Array<{
          uuid: string, desc: string, result: string, index: number
          testcaseCase: { uuid: string }
        }>
      }
    }>(
      TESTCASE_DETAIL_QUERY,
      {
        testCaseFilter: { uuid_in: [...uuids, null] },
        stepFilter: { testcaseCase_in: uuids },
      },
      'library-testcase-detail',
    )

    const cases = detailData.data?.testcaseCases ?? []
    const steps = detailData.data?.testcaseCaseSteps ?? []

    // Group steps by case UUID
    const stepsByCase = new Map<string, TestCaseStep[]>()
    for (const step of steps) {
      const caseUuid = step.testcaseCase.uuid
      if (!stepsByCase.has(caseUuid))
        stepsByCase.set(caseUuid, [])
      stepsByCase.get(caseUuid)!.push({
        uuid: step.uuid,
        index: step.index,
        desc: step.desc ?? '',
        result: step.result ?? '',
      })
    }

    for (const c of cases) {
      allCases.push({
        uuid: c.uuid,
        id: c.id,
        name: c.name,
        priority: c.priority?.value ?? 'N/A',
        type: c.type?.value ?? 'Unknown',
        assignName: c.assign?.name ?? null,
        condition: c.condition ?? '',
        desc: c.desc ?? '',
        steps: (stepsByCase.get(c.uuid) ?? []).sort((a, b) => a.index - b.index),
        modulePath: c.path ?? '',
      })
    }
  }

  return {
    taskNumber: params.taskNumber,
    taskName: task.name,
    moduleName: mod.name,
    moduleUuid: mod.uuid,
    totalCount,
    cases: allCases,
  }
}
```

**注意：** `testCaseFilter: { uuid_in: [...uuids, null] }` 中的 `null` 是 ONES GraphQL 的特殊要求（从抓包中观察到），不加可能导致查询失败。

**Step 5: 运行测试确认通过**

Run: `pnpm vitest run tests/adapters/ones.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/adapters/ones.ts tests/adapters/ones.test.ts tests/fixtures/ones-response.json
git commit -m "feat: implement getTestcases in OnesAdapter with module search and batch detail fetch"
```

---

### Task 3: 新增 `get_testcases` Tool Handler

**Files:**
- Create: `src/tools/get-testcases.ts`
- Test: `tests/tools/get-testcases.test.ts`

**Step 1: 写失败测试**

创建 `tests/tools/get-testcases.test.ts`：

```typescript
import type { BaseAdapter } from '../../src/adapters/base.js'
import type { TestCaseResult } from '../../src/types/requirement.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGetTestcases } from '../../src/tools/get-testcases.js'

const mockResult: TestCaseResult = {
  taskNumber: 302,
  taskName: '#302 RMA重构',
  moduleName: '#302 RMA重构',
  moduleUuid: 'Dkdie5Tu',
  totalCount: 2,
  cases: [
    {
      uuid: 'case-001', id: 'T166341', name: '01.检查seller端菜单设置',
      priority: 'P0', type: '功能测试', assignName: '戚明珠',
      condition: '', desc: '', modulePath: '',
      steps: [{ uuid: 's1', index: 0, desc: '使用seller账号登入', result: '新增菜单' }],
    },
    {
      uuid: 'case-002', id: 'T166342', name: '02.历史售后规则初始化检查',
      priority: 'P0', type: '功能测试', assignName: '戚明珠',
      condition: 'seller已有历史规则', desc: '', modulePath: '',
      steps: [
        { uuid: 's2', index: 0, desc: '打开页面', result: '显示列表' },
        { uuid: 's3', index: 1, desc: '检查状态', result: '已生效' },
      ],
    },
  ],
}

function createMockAdapter(): BaseAdapter {
  return {
    sourceType: 'ones',
    getRequirement: vi.fn(),
    searchRequirements: vi.fn(),
    getRelatedIssues: vi.fn(),
    getIssueDetail: vi.fn(),
    getTestcases: vi.fn().mockResolvedValue(mockResult),
  } as unknown as BaseAdapter
}

describe('handleGetTestcases', () => {
  let adapters: Map<string, BaseAdapter>

  beforeEach(() => {
    adapters = new Map()
    adapters.set('ones', createMockAdapter())
  })

  it('should return formatted testcase list with steps', async () => {
    const result = await handleGetTestcases(
      { taskNumber: '302' },
      adapters,
      'ones',
    )

    const text = result.content[0].text
    expect(text).toContain('#302 RMA重构')
    expect(text).toContain('T166341')
    expect(text).toContain('检查seller端菜单设置')
    expect(text).toContain('seller账号')
    expect(text).toContain('2 个用例')
  })

  it('should throw if no source specified', async () => {
    await expect(
      handleGetTestcases({ taskNumber: '302' }, adapters, undefined),
    ).rejects.toThrow('No source specified')
  })
})
```

**Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/tools/get-testcases.test.ts`
Expected: FAIL — module not found

**Step 3: 实现 tool handler**

创建 `src/tools/get-testcases.ts`：

```typescript
import type { BaseAdapter } from '../adapters/base.js'
import type { TestCase, TestCaseResult } from '../types/requirement.js'
import { z } from 'zod/v4'

export const GetTestcasesSchema = z.object({
  taskNumber: z.string().describe('Task number (e.g. "302" or "#302"). Finds all testcases in the matching module.'),
  libraryUuid: z.string().optional().describe('Testcase library UUID. If omitted, uses configured default.'),
  source: z.string().optional().describe('Source to fetch from. If omitted, uses the default source.'),
})

export type GetTestcasesInput = z.infer<typeof GetTestcasesSchema>

export async function handleGetTestcases(
  input: GetTestcasesInput,
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

  const numMatch = input.taskNumber.match(/^#?(\d+)$/)
  if (!numMatch) {
    throw new Error(`Invalid task number: "${input.taskNumber}". Expected a number like "302" or "#302".`)
  }

  const result = await adapter.getTestcases({
    taskNumber: Number.parseInt(numMatch[1], 10),
    libraryUuid: input.libraryUuid,
  })

  return {
    content: [{ type: 'text' as const, text: formatTestcases(result) }],
  }
}

function formatTestcases(result: TestCaseResult): string {
  const lines = [
    `# ${result.taskName} — 测试用例`,
    '',
    `- **模块**: ${result.moduleName}`,
    `- **共 ${result.totalCount} 个用例**（已加载 ${result.cases.length} 个）`,
    '',
  ]

  for (const tc of result.cases) {
    lines.push(`## ${tc.id} ${tc.name}`)
    lines.push('')
    lines.push(`- 优先级: ${tc.priority} | 类型: ${tc.type}`)
    if (tc.assignName)
      lines.push(`- 维护人: ${tc.assignName}`)
    if (tc.condition)
      lines.push(`- 前置条件: ${tc.condition}`)

    if (tc.steps.length > 0) {
      lines.push('')
      lines.push('| 步骤 | 操作描述 | 预期结果 |')
      lines.push('|------|----------|----------|')
      for (const step of tc.steps) {
        const desc = step.desc.replace(/\n/g, '<br>')
        const result = step.result.replace(/\n/g, '<br>')
        lines.push(`| ${step.index + 1} | ${desc} | ${result} |`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
```

**Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/tools/get-testcases.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/get-testcases.ts tests/tools/get-testcases.test.ts
git commit -m "feat: add get_testcases tool handler with table-formatted steps"
```

---

### Task 4: 在 MCP Server 中注册 `get_testcases` 工具

**Files:**
- Modify: `src/index.ts`

**Step 1: 导入并注册**

在 `src/index.ts` import 区域新增：

```typescript
import { GetTestcasesSchema, handleGetTestcases } from './tools/get-testcases.js'
```

在 tool 注册区域新增：

```typescript
server.tool(
  'get_testcases',
  'Get all test cases for a task by its number (e.g. 302). Searches the testcase library for a matching module and returns all cases with steps.',
  GetTestcasesSchema.shape,
  async (params) => {
    try {
      return await handleGetTestcases(params, adapters, config.config.defaultSource)
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

**Step 2: 运行 typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: register get_testcases tool in MCP server"
```

---

### Task 5: 配置 testcaseLibraryUuid 并更新文档

**Files:**
- Modify: `.requirements-mcp.json`
- Modify: `.requirements-mcp.json.example`

**Step 1: 在配置中添加 testcaseLibraryUuid**

在 `.requirements-mcp.json` 的 `ones` source 中添加 options：

```json
{
  "sources": {
    "ones": {
      "enabled": true,
      "apiBase": "https://1s.oristand.com",
      "auth": {
        "type": "ones-pkce",
        "emailEnv": "ONES_ACCOUNT",
        "passwordEnv": "ONES_PASSWORD"
      },
      "options": {
        "testcaseLibraryUuid": "KQjsNmut"
      }
    }
  },
  "defaultSource": "ones"
}
```

同步更新 `.requirements-mcp.json.example`。

**Step 2: Commit**

```bash
git add .requirements-mcp.json .requirements-mcp.json.example
git commit -m "feat: add testcaseLibraryUuid config option for testcase tool"
```

---

### Task 6: Lint、测试、构建验证

**Files:** All

**Step 1: Lint**

Run: `pnpm lint`
Expected: PASS（如有错误运行 `pnpm lint:fix`）

**Step 2: 全部测试**

Run: `pnpm vitest run`
Expected: ALL PASS

**Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: 构建**

Run: `pnpm build`
Expected: PASS — `dist/index.mjs` 生成

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: lint and build verification for testcase tool"
```

---

### Task 7: 端到端测试

**Step 1: 更新本地 MCP 配置指向新构建**

确认 `.kiro/settings/mcp.json` 指向 `dist/index.mjs`。

**Step 2: 重连 MCP server，调用 `get_testcases`**

测试命令：`get_testcases({ taskNumber: "302" })`

Expected: 返回 #302 RMA重构 模块下的测试用例列表，每个用例包含步骤表格。

**Step 3: 验证输出格式**

确认输出包含：
- 模块名称
- 用例总数
- 每个用例的 ID、名称、优先级
- 步骤表格（操作描述 + 预期结果）
