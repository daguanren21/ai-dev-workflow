# AI Development Workflow

> 本文件是 AI 编码工具的通用入口，适用于 Codex、Qodo、Cursor 等支持 AGENTS.md 的工具。
> 核心规范定义在 `docs/parallel-task/`（唯一真相源），本文件仅做引用和概述。

---

## 并行任务框架

本项目使用并行任务框架进行 AI 辅助开发。框架支持多种 AI 编码工具协同工作，通过智能任务调度实现高效的并行开发。

### 核心规范

@docs/parallel-task/README.md

---

## 工作流概述

执行任何开发任务前，请遵循以下 10 步工作流：

```
① 需求输入   → 接收需求单号或描述
② 需求获取   → 通过 requirements MCP 获取结构化需求 → requirements.md
③ 技术设计   → 生成 design.md + tasks.md（fullstack 项目自动前后端拆分）
④ 技能匹配   → 五级查找机制匹配最佳实践
⑤ 最佳实践   → 应用匹配的 skills，更新 design.md
⑥ 需求验证   → 确认设计方案完整覆盖需求
⑦ 代码实现   → 按任务类型和并行策略调度执行
⑧ 交互验证   → 仅前端项目，使用 Playwright 验证 UI
⑨ 代码审查   → Review 代码质量（light / standard / strict）
⑩ 质量检查   → lint → type → build 依次通过
```

详细工作流定义：@docs/parallel-task/workflow.md

---

## 任务类型与调度

框架定义了 8 种任务类型，每种类型有对应的并行策略：

| 类型 | 标识 | 并行策略 | 说明 |
|-----|------|---------|------|
| 代码开发 | `code:dev` | `isolated` | 同模块串行，跨模块并行 |
| 代码修复 | `code:fix` | `isolated` | 同文件串行，跨文件并行 |
| 代码重构 | `code:refactor` | `serial` | 全局串行 |
| 文档编写 | `doc:write` | `parallel` | 完全并行 |
| 文档翻译 | `doc:translate` | `parallel` | 完全并行 |
| 调研分析 | `research` | `parallel` | 完全并行，支持缓存 |
| 数据处理 | `data` | `isolated` | 按数据源隔离 |
| 测试执行 | `test` | `parallel` | 完全并行 |

三种并行策略：
- **parallel** — 完全并行，无限制（受 parallel_limit 约束）
- **isolated** — 按隔离键分组，组内串行，组间并行
- **serial** — 强制串行执行

详细任务类型参考：@docs/parallel-task/task-types.md

---

## 任务声明语法

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

任务模板：@docs/parallel-task/templates/

---

## 技能匹配（五级查找）

从 design.md 中提取技术关键词，通过以下优先级查找最佳实践：

| 层级 | 来源 | 说明 |
|:---:|------|------|
| L1 | 项目 `skills/` | 项目专属规范，最高优先级 |
| L2 | 全局 skills | 通用开发规范（superpowers 等） |
| L3 | skills.sh 生态 | 社区 skills（find-skills） |
| L4 | Context7 MCP | 框架/库官方文档 |
| L5 | WebSearch | 网络搜索，兜底方案 |

---

## Service 层 Transform 适配

前端 Mock 与后端 API 字段差异的处理方案：在 service 层通过 transform 函数集中处理，组件层零修改。

详细说明：@docs/parallel-task/service-transform.md

---

## 设计文档输出结构

```
docs/plans/{需求单号}/
├── requirements.md          # 原始需求
├── analysis.md              # 需求分析
├── frontend/
│   ├── design.md            # 前端设计方案
│   └── tasks.md             # 前端任务列表
├── backend/
│   ├── design.md            # 后端设计方案
│   └── tasks.md             # 后端任务列表
└── shared/
    └── api-contract.md      # 接口契约
```

---

## 质量检查标准

所有任务完成后，必须按顺序通过以下检查：

1. **Lint** — 代码风格与规范检查
2. **Type** — TypeScript 类型检查（`tsc --noEmit`）
3. **Build** — 项目构建检查
