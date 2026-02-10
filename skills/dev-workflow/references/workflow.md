# 工作流定义

> 10 步端到端开发工作流

---

## 完整流程

```
① 需求输入
     ↓
② 需求获取 ──→ requirements.md
     ↓
③ 技术设计 ──→ design.md + tasks.md (前后端拆分)
     ↓
④ 技能匹配 ──→ 五级查找机制
     ↓
⑤ 最佳实践 ──→ 应用匹配的 skills，更新 design
     ↓
⑥ 需求符合性校验 ──→ 追踪矩阵 + 校验报告
     ↓
┌────────────────────────────┐
│  ⑦ 代码实现                 │
│       ↓                    │
│  ⑧ 交互验证 (前端项目)     │←──┐
│       ↓                    │   │ 循环
│  ⑨ 代码审查                 │───┘
└────────────────────────────┘
     ↓
⑩ 质量检查 (lint → type → build)
     ↓
  ✅ 完成
```

## 阶段详情

| 阶段 | 名称 | 触发条件 | 使用工具 |
|:---:|------|---------|---------|
| ① | 需求输入 | 必须 | — |
| ② | 需求获取 | 必须 | `requirements-mcp` |
| ③ | 技术设计 | 必须 | Plan 工具 |
| ④ | 技能匹配 | 必须 | 五级查找机制 |
| ⑤ | 最佳实践 | 必须 | 动态加载匹配的 skills |
| ⑥ | 需求符合性校验 | 必须 | 追踪矩阵 + 校验报告，详见 [requirement-validation.md](./requirement-validation.md) |
| ⑦ | 代码实现 | 必须 | Subagent 并行开发 |
| ⑧ | 交互验证 | **仅前端项目** | Playwright MCP |
| ⑨ | 代码审查 | 必须 | Code review |
| ⑩ | 质量检查 | 必须 | lint + type + build |

## 阶段说明

### ① 需求输入

用户提供需求单号或需求描述，可以是：
- 需求管理平台ID（如 ONES 工单号、Jira Issue Key、GitHub Issue 编号）
- 自然语言描述
- 需求文档链接

### ② 需求获取

通过 `ai-dev-requirements` 自动获取需求详情，输出 `requirements.md`。

### ③ 技术设计

基于需求，生成技术设计方案：

```
docs/plans/{需求单号}/
├── requirements.md          # 原始需求
├── analysis.md              # 需求分析（前后端拆分结果）
├── frontend/
│   ├── design.md            # 前端设计方案
│   └── tasks.md             # 前端任务列表
├── backend/
│   ├── design.md            # 后端设计方案
│   └── tasks.md             # 后端任务列表
└── shared/
    └── api-contract.md      # 接口契约
```

### ④ 技能匹配 — 五级查找

```
Level 1: 项目内 skills/        → 项目专属规范（最高优先级）
Level 2: 全局 skills           → superpowers 等通用开发规范
Level 3: 开放生态 (skills.sh)  → 社区 skills
Level 4: Context7 MCP          → 框架/库官方文档
Level 5: WebSearch             → 网络最佳实践（兜底）
```

### ⑤ 最佳实践

将匹配到的 skills 应用到设计方案中，更新 `design.md`。

### ⑥ 需求符合性校验

按 [requirement-validation.md](./requirement-validation.md) 规范执行，核心步骤：

1. **构建追踪矩阵** — 逐条提取需求点，建立 需求 → 用户故事 → 设计 → 任务 的映射
2. **逐项校验** — 对每个需求点检查：故事覆盖、验收标准完整、设计落地、任务分解、边界覆盖
3. **输出校验报告** — 生成 `validation-report.md`，包含覆盖统计、未覆盖项、风险项
4. **暂停确认** — 将报告呈现给开发者，等待确认后再进入代码实现

判定规则：
- ✅ 通过：所有需求点已覆盖，无高风险项 → 进入 ⑦
- ⚠️ 有条件通过：覆盖率 ≥ 90%，未覆盖项为低优先级 → 与开发者确认后进入 ⑦
- ❌ 不通过：核心需求未覆盖或高风险未解决 → 回退 ③ 补充设计

### ⑦ 代码实现

按任务类型调度并行/串行执行，详见 [task-types.md](./task-types.md)。

**前后端并行策略：**

```
          ┌─────────────┐
          │ 接口契约确定 │
          └──────┬──────┘
                 ↓
    ┌────────────┴────────────┐
    ↓                         ↓
┌─────────┐             ┌─────────┐
│ 前端开发 │   并行执行   │ 后端开发 │
│ (Mock)  │             │ (API)   │
└────┬────┘             └────┬────┘
     └───────────┬───────────┘
                 ↓
          ┌─────────────┐
          │   联调测试   │
          └─────────────┘
```

### ⑧ 交互验证

仅前端项目，使用 Playwright MCP 进行自动化交互验证。

### ⑨ 代码审查

根据任务类型的 review_level 进行代码审查：
- `light` — 文档/调研类，快速检查
- `standard` — 修复/测试类，标准检查
- `strict` — 新功能/重构，严格检查

### ⑩ 质量检查

```bash
pnpm lint    # ESLint 检查
pnpm type    # TypeScript 类型检查
pnpm build   # 构建验证
```

## 项目类型判断

```yaml
project_type: frontend | backend | fullstack | library

# 自动判断逻辑：
# - 存在 src/views/ 或 src/components/ → frontend
# - 存在 package.json + vue/react 依赖 → frontend
# - 存在 src/api/ 或 src/services/ 无前端框架 → backend
# - 两者都有 → fullstack
```
