# Workflow Refactor: MCP 瘦身 + 自包含 Dev Workflow Skill

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** (1) 移除 Jira/GitHub adapter 代码（保留适配器架构）；(2) 新增自包含的 `skills/dev-workflow/SKILL.md`，安装即可完整跑通项目工作流，包含需求获取、用户故事、任务类型、调度策略、service transform、UI 资源获取、实现计划、验证等全部内容。现有 `docs/parallel-task/` 保留不动。

**Architecture:** Skill 是完全自包含的——将现有 `docs/parallel-task/` 中的 workflow、task-types、service-transform、templates 全部整合进 SKILL.md，加上新增的用户故事流程、Figma MCP 支持、`npx skills find` UI skill 查找。安装 skill 后无需阅读 docs/ 即可跑通完整流程。

**Tech Stack:** TypeScript, MCP SDK, Vitest, skills.sh (SKILL.md 格式)

---

## 调研结论

### Q1: 目前项目中的 MCP 如何发布？

通过 npm 发布：`bin.requirements-mcp` → `./dist/index.mjs`，`prepublishOnly` 执行 `pnpm build`，用户通过 `npx requirements-mcp-server` 运行。

### Q2: GitHub MCP 能查 Issue？

**是。** [github/github-mcp-server](https://github.com/github/github-mcp-server) 支持 Issue CRUD 全套。

### Q3: Jira 有对应 MCP？

**是。** [Atlassian Rovo MCP Server](https://www.atlassian.com/blog/announcements/remote-mcp-server)（beta）+ 社区 [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian)。

### Q4: Workflow 改写为 Skill？

**可行。** Skill 自包含完整工作流，`npx skills add` 安装后即可使用。

---

## Task 1: 移除 Jira Adapter 实现

**Files:**
- Delete: `src/adapters/jira.ts`
- Delete: `tests/adapters/jira.test.ts`
- Delete: `tests/fixtures/jira-response.json`
- Modify: `src/adapters/index.ts`

**Step 1: 删除文件**

- `src/adapters/jira.ts`
- `tests/adapters/jira.test.ts`
- `tests/fixtures/jira-response.json`

**Step 2: 更新 `src/adapters/index.ts`**

移除 JiraAdapter import、ADAPTER_MAP 条目、re-export，只保留 OnesAdapter：

```typescript
import type { SourceType } from '../types/requirement.js'
import type { SourceConfig } from '../types/config.js'
import { BaseAdapter } from './base.js'
import { OnesAdapter } from './ones.js'

const ADAPTER_MAP: Record<string, new (
  sourceType: SourceType,
  config: SourceConfig,
  resolvedAuth: Record<string, string>,
) => BaseAdapter> = {
  ones: OnesAdapter,
}

export function createAdapter(
  sourceType: SourceType,
  config: SourceConfig,
  resolvedAuth: Record<string, string>,
): BaseAdapter {
  const AdapterClass = ADAPTER_MAP[sourceType]
  if (!AdapterClass) {
    throw new Error(
      `Unsupported source type: "${sourceType}". Supported: ${Object.keys(ADAPTER_MAP).join(', ')}`,
    )
  }
  return new AdapterClass(sourceType, config, resolvedAuth)
}

export { BaseAdapter } from './base.js'
export { OnesAdapter } from './ones.js'
```

**Step 3:** Run: `pnpm test:run` → Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove Jira adapter, use official Atlassian Rovo MCP instead"
```

---

## Task 2: 移除 GitHub Adapter 实现

**Files:**
- Delete: `src/adapters/github.ts`
- Delete: `tests/adapters/github.test.ts`
- Delete: `tests/fixtures/github-response.json`

**Step 1: 删除文件**

**Step 2: 确认 index.ts 已在 Task 1 中清理**

**Step 3:** Run: `pnpm test:run` → Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove GitHub adapter, use official github-mcp-server instead"
```

---

## Task 3: 更新配置层

**Files:**
- Modify: `src/types/requirement.ts`
- Modify: `src/config/loader.ts`
- Modify: `.requirements-mcp.json.example`
- Modify: `tests/config/loader.test.ts`

**Step 1: SourceType 精简为 'ones'**

```typescript
/**
 * Bundled source types. To add new sources, extend this union and implement BaseAdapter.
 * GitHub/Jira users: use their official MCP servers directly.
 */
export type SourceType = 'ones'
```

**Step 2: Config schema 精简**

```typescript
const SourcesSchema = z.object({
  ones: SourceConfigSchema.optional(),
})

const McpConfigSchema = z.object({
  sources: SourcesSchema,
  defaultSource: z.enum(['ones']).optional(),
})
```

**Step 3: 精简 `.requirements-mcp.json.example`** 只保留 ones

**Step 4: 更新测试** 移除 jira/github case

**Step 5:** Run: `pnpm test:run && pnpm lint` → Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: narrow config to ones-only, adapter pattern preserved"
```

---

## Task 4: 更新 package.json + README.md

**Step 1: package.json** description/keywords 移除 jira/github

**Step 2: README.md** 说明只内置 ONES，推荐官方 MCP

**Step 3: Commit**

```bash
git add package.json README.md
git commit -m "docs: update package info for ones-only bundling"
```

---

## Task 5: 新增自包含 dev-workflow Skill（核心）

> 不修改不删除 `docs/parallel-task/` 中任何文件。Skill 自包含全部工作流内容。

**Files:**
- Create: `skills/dev-workflow/SKILL.md`

**Step 1:** `mkdir -p skills/dev-workflow`

**Step 2: 编写 SKILL.md** — 完整内容如下：

````markdown
# Dev Workflow — AI 辅助开发全流程

> 自包含的 AI 辅助开发工作流 Skill。安装后即可完整跑通：需求获取 → 用户故事 → 实现计划 → 代码实现 → 验证。

## 触发条件

当用户提供以下任一内容时激活：
- 需求单号（ONES 工单号、GitHub Issue 编号、Jira Issue Key 等）
- 需求描述（自然语言）
- 需求文档链接
- 明确说"开始开发"、"新功能"、"实现XXX"等

---

## 完整流程

```
Phase 1: 需求获取（任意 MCP 来源）
   ↓
Phase 2: 用户故事转写（标准 Markdown 格式）
   ↓  ← 暂停：开发者确认 + 提供 UI 参考
Phase 3: UI 资源获取（Figma MCP / 截图 / npx skills find）
   ↓
Phase 4: 技能匹配（五级查找）
   ↓
Phase 5: 实现计划（writing-plans）
   ↓
Phase 6: 代码实现（按任务类型调度）
   ↓
Phase 7: 验证（lint → type → build + review）
   ↓
  ✅ 完成
```

---

## Phase 1: 需求获取

根据需求来源选择对应 MCP：

| 来源 | MCP Server | 说明 |
|------|-----------|------|
| ONES | `requirements` MCP（本项目内置） | `get_requirement` tool |
| GitHub | `github` MCP（[github/github-mcp-server](https://github.com/github/github-mcp-server)） | 读取 Issue/PR |
| Jira | `atlassian` MCP（[Atlassian Rovo MCP](https://www.atlassian.com/blog/announcements/remote-mcp-server)） | 读取 Issue |
| 自然语言 | 无需 MCP | 直接使用用户描述 |

**输出：** `docs/plans/{feature-name}/requirements.md`

---

## Phase 2: 用户故事转写

将需求转写为标准 Markdown 用户故事：

```markdown
# {功能名称}

## 用户故事

### US-1: {故事标题}
**As a** {角色},
**I want** {目标},
**So that** {价值}.

#### 验收标准 (Acceptance Criteria)
- [ ] Given {前置条件}, When {操作}, Then {期望结果}

#### UI/交互说明
<!-- 三选一 -->
- 🎨 Figma: {paste figma copy link here}
- 🖼️ 截图: {file path or paste image}
- 📝 无 UI 依赖（纯逻辑/API/数据）
```

**规则：**
1. 每个用户故事独立可交付
2. 验收标准用 Given/When/Then
3. 涉及 UI 的故事标注并**暂停**等待开发者提供 UI 参考
4. 非 UI 故事标注"无 UI 依赖"

**保存到：** `docs/plans/{feature-name}/user-stories.md`

**暂停点：** 展示用户故事给开发者确认，收集 UI 参考资料。

---

## Phase 3: UI 资源获取

### 路径 A: 开发者提供了 UI 参考

- **Figma copy link** → 使用 Figma MCP Server 读取设计详情（组件结构、变量、布局）
- **截图/图片** → 直接分析图片提取 UI 信息
- **文字描述** → 基于描述理解 UI 意图

### 路径 B: 开发者未提供 UI 参考

使用 `npx skills find` 搜索前端 UI 相关 skill：

```bash
npx skills find frontend design
npx skills find ui component
npx skills find css styling
```

加载匹配的社区 skill（如 frontend-design、ui-patterns 等），基于其最佳实践指导 UI 实现。

同时按五级查找补充（见 Phase 4）。

---

## Phase 4: 技能匹配（五级查找）

从用户故事中提取技术关键词，按优先级查找最佳实践：

| 优先级 | 来源 | 说明 |
|:---:|------|------|
| L1 | 项目 `skills/` | 项目专属规范（最高优先级） |
| L2 | 已安装全局 skills | superpowers、giga-ui、vue-best-practices 等 |
| L3 | `npx skills find {keyword}` | skills.sh 社区生态 |
| L4 | Context7 MCP | 框架/库官方文档 |
| L5 | WebSearch | 兜底 |

匹配结果格式：

```markdown
## 技能匹配结果

### L1: 项目内 Skills
- ✅ `component-lib` - UI 组件规范

### L2: 全局 Skills
- ✅ `superpowers:test-driven-development` - TDD 规范

### L3: skills.sh 生态
- 📦 `vercel-labs/frontend-design` - 前端设计规范

### L4: Context7 文档
- 📚 `Vue3 Composition API` - 官方文档

### L5: WebSearch
- 🔍 "Vue3 最佳实践" → [来源链接]
```

---

## Phase 5: 实现计划

**REQUIRED SUB-SKILL:** 使用 `superpowers:writing-plans` 生成实现计划。

基于用户故事 + UI 资源 + 匹配的 skills 生成 bite-sized 计划：
- 每步 2-5 分钟
- TDD：先写测试，再实现
- 精确文件路径和代码
- DRY, YAGNI, 频繁提交

**保存到：** `docs/plans/{feature-name}/implementation-plan.md`

---

## Phase 6: 代码实现

**REQUIRED SUB-SKILL:** 使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`。

### 任务类型与调度策略

| 类型 | 标识 | 并行策略 | Review 级别 | 说明 |
|-----|------|---------|------------|------|
| 代码开发 | `code:dev` | `isolated` | strict | 同模块串行，跨模块并行 |
| 代码修复 | `code:fix` | `isolated` | standard | 同文件串行 |
| 代码重构 | `code:refactor` | `serial` | strict | 全局串行，影响范围大 |
| 文档编写 | `doc:write` | `parallel` | light | 完全并行 |
| 文档翻译 | `doc:translate` | `parallel` | light | 完全并行 |
| 调研分析 | `research` | `parallel` | light | 完全并行，支持缓存 |
| 数据处理 | `data` | `isolated` | standard | 按数据源隔离 |
| 测试执行 | `test` | `parallel` | standard | 完全并行 |

### 三种并行策略

- **parallel** — 完全并行，无限制（受 parallel_limit 约束）
- **isolated** — 按隔离键分组，组内串行，组间并行
- **serial** — 强制串行执行

### 最大并行度：≤5 个并行任务

### 任务声明语法

```markdown
## TaskGroup: <任务组名称>

### Meta
- parallel_limit: 5
- review_level: standard
- on_failure: continue | stop

### Tasks
1. [code:dev] 实现用户认证模块 @isolated(auth/)
2. [code:dev] 实现订单模块 @isolated(order/)
3. [doc:write] 编写 API 文档
4. [research] 调研支付网关方案 @cache(7d)
```

| 元素 | 格式 | 说明 |
|------|------|------|
| 任务类型 | `[type:subtype]` | 方括号中的任务类型标识 |
| 隔离键 | `@isolated(key)` | 指定隔离分组的键 |
| 缓存 | `@cache(duration)` | 调研任务缓存有效期 |
| 依赖 | `@depends(task_id)` | 指定前置依赖任务 |

### 前后端并行策略（fullstack 项目）

```
     ┌─────────────┐
     │ 接口契约确定 │
     └──────┬──────┘
            ↓
  ┌─────────┴─────────┐
  ↓                   ↓
┌─────────┐     ┌─────────┐
│ 前端开发 │     │ 后端开发 │
│ (Mock)  │     │ (API)   │
└────┬────┘     └────┬────┘
     └────────┬──────┘
              ↓
       ┌─────────────┐
       │   联调测试   │
       └─────────────┘
```

### 任务模板

**代码开发：**
```markdown
## TaskGroup: [功能名称]
### Meta
- parallel_limit: 5
- review_level: strict
- on_failure: continue
### Tasks
1. [code:dev] 实现 [模块名] 核心逻辑 @isolated([module]/)
2. [code:dev] 实现 [模块名] UI 组件 @isolated([module]/)
3. [code:dev] 实现 [模块名] API 接口层 @isolated([module]/api/)
4. [test] 编写 [模块名] 单元测试 @isolated([module]/)
```

**代码修复：**
```markdown
## TaskGroup: [Bug 描述]
### Meta
- parallel_limit: 3
- review_level: standard
- on_failure: stop
### Tasks
1. [research] 定位 [Bug] 根因 @cache(1d)
2. [code:fix] 修复 [Bug] @isolated([file_path])
3. [test] 补充回归测试 @isolated([file_path])
```

**代码重构：**
```markdown
## TaskGroup: [重构目标]
### Meta
- parallel_limit: 1
- review_level: strict
- on_failure: stop
### Tasks
1. [research] 分析 [模块] 的问题和依赖关系
2. [code:refactor] 重构 [模块] 核心结构
3. [code:fix] 修复重构引入的类型错误
4. [test] 运行全量测试确认无回归
```

**调研：**
```markdown
## TaskGroup: [调研主题]
### Meta
- parallel_limit: 5
- review_level: light
- on_failure: continue
### Tasks
1. [research] 调研 [方案A] @cache(7d)
2. [research] 调研 [方案B] @cache(7d)
3. [research] 对比 [方案A] 和 [方案B] @depends(1,2)
4. [doc:write] 输出调研结论文档
```

---

## Phase 7: 验证

### 7a. 质量检查

按顺序执行，全部通过才算完成：

```bash
pnpm lint    # ESLint / 代码规范
pnpm type    # TypeScript 类型检查（tsc --noEmit）
pnpm build   # 构建验证
```

### 7b. 交互验证（仅前端项目）

使用 Playwright MCP 进行自动化 UI 交互验证。

### 7c. 代码审查

根据任务类型的 review_level：
- `light` — 文档/调研类，快速检查
- `standard` — 修复/测试类，标准检查
- `strict` — 新功能/重构，严格检查

**REQUIRED SUB-SKILL:** 使用 `superpowers:requesting-code-review`

---

## Service 层 Transform 适配方案

前端 Mock 与后端实际字段差异，在 service 层通过 transform 函数集中处理，**不新建 adapters/ 目录**。

### 核心原则

`FrontendType` 是 service 层和组件层的契约，组件只认契约，不关心后端原始结构。

```
组件层 → FrontendType ← service 函数返回类型
              ↑
              │ transform
              │
        BackendType
```

### 文件结构

```
src/api/{模块名}/
├── types.ts              # 前端类型 + 后端类型 + transform 函数
├── mock.ts               # Mock 数据（开发阶段）
└── {模块名}.ts            # API 函数（内含 .then(transform)）
```

### 实现模式

```typescript
// ① 前端类型（组件契约，不变）
export interface OrderInfo {
  orderId: string; carrier: string; amount: number; status: string
}

// ② 后端类型（联调时补充）
interface BackendOrderInfo {
  order_id: string; carrier_info: { code: string }; amount: string; status: number
}

// ③ transform 函数
function transformOrder(raw: BackendOrderInfo): OrderInfo {
  return {
    orderId: raw.order_id,           // 字段名映射
    carrier: raw.carrier_info.code,  // 结构扁平化
    amount: Number(raw.amount) / 100,// 格式转换
    status: STATUS_MAP[raw.status],  // 枚举映射
  }
}

// ④ API 函数加 .then(transform)
export function getOrderList(query: PageParams) {
  return request<PageResponse<BackendOrderInfo>>({ url: '/api/order/page', params: query })
    .then(res => ({ ...res, rows: res.rows.map(transformOrder) }))
}
```

### 联调流程

```
后端接口就绪 → 补上 BackendType → 写 transform → API 加 .then(transform) → 组件不动 ✅
```

---

## 文件结构约定

```
docs/plans/{feature-name}/
├── requirements.md              # 原始需求（来自任意 MCP）
├── user-stories.md              # 用户故事（标准格式）
├── ui-references/               # UI 参考（可选）
│   ├── figma-notes.md           # Figma MCP 读取结果
│   └── screenshots/             # 截图
└── implementation-plan.md       # 实现计划（writing-plans 输出）
```

## 项目类型判断

```yaml
project_type: frontend | backend | fullstack | library

# 判断逻辑：
# - 存在 src/views/ 或 src/components/ → frontend
# - 存在 package.json + vue/react 依赖 → frontend
# - 存在 src/api/ 或 src/services/ 无前端框架 → backend
# - 两者都有 → fullstack
```
````

**Step 3: Commit**

```bash
git add skills/
git commit -m "feat: add self-contained dev-workflow skill with complete workflow"
```

---

## Task 6: CLAUDE.md / AGENTS.md / .kiro/ 新增 skill 引用

> 只新增引用，不删除现有内容。

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `.kiro/steering/parallel-task.md`

**Step 1: CLAUDE.md** 新增段落：

```markdown
## Dev Workflow Skill

完整的 AI 辅助开发工作流 skill，安装后即可跑通全流程：

Skill 位置: `skills/dev-workflow/SKILL.md`

支持的需求来源：ONES MCP（内置）、GitHub MCP、Jira MCP、自然语言描述
```

更新 MCP 配置段新增 github/atlassian/figma MCP 说明。

**Step 2: AGENTS.md** 新增同样引用

**Step 3: .kiro/** 新增同样引用

**Step 4: Commit**

```bash
git add CLAUDE.md AGENTS.md .kiro/
git commit -m "docs: add dev-workflow skill references to all entry points"
```

---

## Task 7: 质量检查

**Step 1:** `pnpm lint` → 无错误
**Step 2:** `pnpm build` → 构建成功
**Step 3:** `pnpm test:run` → 全部通过

---

## 总结

| 变更 | 类型 | 说明 |
|------|------|------|
| Jira/GitHub adapter 代码 | 删除 | 用各自官方 MCP 替代 |
| BaseAdapter 架构 | 保留 | 未来扩展零成本 |
| docs/parallel-task/ | **全部保留** | 不修改不删除 |
| skills/dev-workflow/SKILL.md | **新增** | 自包含完整工作流 |
| CLAUDE.md / AGENTS.md / .kiro/ | 追加引用 | 原有内容不动 |
| 需求来源 | 多 MCP | ONES 内置 + GitHub/Jira 官方 MCP |
| 有 UI 参考时 | Figma MCP / 截图 | 开发者提供 |
| 无 UI 参考时 | `npx skills find` | 查找 frontend/ui skill 辅助 |
| Skill 自包含 | 完整 | 任务类型 + 调度策略 + service transform + 模板全部内嵌 |
