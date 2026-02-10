# CLAUDE.md

> Claude Code 专用入口文件。核心规范定义在 `docs/parallel-task/`（唯一真相源）。

## Dev Workflow Skill

完整的 AI 辅助开发工作流 skill，安装后即可跑通全流程：

**Skill 位置:** `skills/dev-workflow/SKILL.md`

流程：需求获取（ONES/GitHub/Jira MCP）→ 用户故事 → UI 资源获取 → 技能匹配 → 实现计划 → 代码实现 → 验证

## 并行任务框架

本项目使用并行任务框架，所有开发任务须遵循框架规范。

### 核心规范（必读）

@docs/parallel-task/README.md
@docs/parallel-task/workflow.md
@docs/parallel-task/task-types.md
@docs/parallel-task/service-transform.md

### 任务模板

@docs/parallel-task/templates/code-dev-task.md
@docs/parallel-task/templates/code-fix-task.md
@docs/parallel-task/templates/code-refactor-task.md
@docs/parallel-task/templates/doc-write-task.md
@docs/parallel-task/templates/research-task.md
@docs/parallel-task/templates/test-task.md

## 工作流

执行开发任务时，遵循 10 步工作流：

1. 需求输入 → 接收需求单号或描述
2. 需求获取 → 使用 `requirements` MCP 工具获取需求详情，输出 requirements.md
3. 技术设计 → 生成 design.md + tasks.md
4. 技能匹配 → 五级查找（项目 skills → 全局 skills → skills.sh → Context7 MCP → WebSearch）
5. 最佳实践 → 应用匹配的 skills，更新 design.md
6. 需求验证 → 确认设计覆盖需求
7. 代码实现 → 按 task-types.md 中的并行策略调度
8. 交互验证 → 仅前端项目，使用 Playwright MCP
9. 代码审查 → 按任务类型选择 review 级别
10. 质量检查 → `lint → type → build` 依次通过

## MCP 配置

项目使用以下 MCP server，配置于 `.mcp.json`：

- **requirements** — ONES 需求获取（本项目内置）
- **github** — GitHub Issue/PR（[github/github-mcp-server](https://github.com/github/github-mcp-server)）
- **atlassian** — Jira/Confluence（[Atlassian Rovo MCP](https://www.atlassian.com/blog/announcements/remote-mcp-server)）
- **figma** — Figma 设计稿读取（[Figma MCP Server](https://github.com/figma/mcp-server-guide)）
- **context7** — 框架/库官方文档查询
- **playwright** — 前端页面交互验证

## 关键约束

- 最大并行任务数：5
- 代码开发任务使用 `isolated` 策略（按模块隔离）
- 代码重构任务使用 `serial` 策略（全局串行）
- 联调适配在 service 层通过 transform 处理，不新建 adapters 目录
- 质量检查顺序：lint → type → build，全部通过才算完成
