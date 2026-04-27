# Agent Harness Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the shipped `dev-workflow` skill into an AI agent harness workflow without changing MCP server code.

**Architecture:** The harness remains a documentation and skill contract. `skills/dev-workflow/SKILL.md` becomes the operating entry point, `references/workflow.md` defines the full lifecycle, `references/task-types.md` defines scheduling semantics, templates become harness task declarations, and README files describe the new public positioning.

**Tech Stack:** Markdown skill files, skills.sh `SKILL.md` format, existing TypeScript MCP package unchanged.

---

## File Structure

- Modify: `skills/dev-workflow/SKILL.md`
  - Responsibility: primary agent-facing harness operating manual.
- Modify: `skills/dev-workflow/references/workflow.md`
  - Responsibility: detailed harness lifecycle, gates, artifacts, recovery, and MCP boundaries.
- Modify: `skills/dev-workflow/references/task-types.md`
  - Responsibility: harness scheduler primitives and task declaration syntax.
- Modify: `skills/dev-workflow/references/templates/code-dev-task.md`
  - Responsibility: harness template for feature implementation tasks.
- Modify: `skills/dev-workflow/references/templates/code-fix-task.md`
  - Responsibility: harness template for defect correction tasks.
- Modify: `skills/dev-workflow/references/templates/code-refactor-task.md`
  - Responsibility: harness template for serial refactor tasks.
- Modify: `skills/dev-workflow/references/templates/doc-write-task.md`
  - Responsibility: harness template for documentation tasks.
- Modify: `skills/dev-workflow/references/templates/research-task.md`
  - Responsibility: harness template for context/research tasks.
- Modify: `skills/dev-workflow/references/templates/test-task.md`
  - Responsibility: harness template for verification tasks.
- Modify: `README.md`
  - Responsibility: English public overview and quick start.
- Modify: `README.zh-CN.md`
  - Responsibility: Chinese public overview and quick start.
- No changes: `src/**`, `tests/**`, `package.json`, build config.

## Task 1: Rewrite Skill Entry Point

**Files:**
- Modify: `skills/dev-workflow/SKILL.md`

- [ ] **Step 1: Replace frontmatter description**

Use this exact intent in the YAML description:

```yaml
description: >
  Use when starting any AI-assisted development task that needs a controlled agent harness:
  requirement intake, MCP/context loading, normalization, task graph planning, gated execution,
  verification, review, and handoff. Supports ONES/GitHub/Jira/Figma MCP as context sources,
  but does not require changing MCP server code.
```

- [ ] **Step 2: Rewrite overview**

The overview must state these rules:

```markdown
AI agent harness for requirement-driven software work. The harness controls what context the agent may load, which artifacts it must produce, when it must pause, how tasks are scheduled, and which verification gates must pass before handoff.

**Announce at start:** "I'm using the dev-workflow harness to drive this development task."

**Core principle:** Harness first. Normalize inputs, create traceable artifacts, validate coverage, execute behind gates, and hand off evidence. Do not jump from a requirement directly to code.
```

- [ ] **Step 3: Replace process phases with harness lifecycle**

Add these lifecycle sections in order:

```markdown
### Phase 1: Intake
### Phase 2: Context Load
### Phase 3: Normalize Requirements
### Phase 4: Build Harness Plan
### Phase 5: Validate Coverage
### Phase 6: Execute Behind Gates
### Phase 7: Verify
### Phase 8: Review
### Phase 9: Handoff
```

Each phase must define input, action, output, and pause behavior where applicable.

- [ ] **Step 4: Add MCP boundary section**

Add a section named `MCP Boundary` with these rules:

```markdown
MCP is a context layer for the harness.

Allowed:
- Fetch ONES requirements through the bundled Requirements MCP Server.
- Fetch GitHub or Jira issue context through external MCP servers.
- Fetch Figma design context through a Figma MCP server.
- Use MCP-derived context to populate harness artifacts.

Not part of this harness skill:
- Changing MCP server source code.
- Adding MCP tools.
- Changing adapters, auth, config loading, or package exports.
```

- [ ] **Step 5: Verify entry point no longer advertises the old 7-phase flow**

Run:

```bash
rg -n "7 phases|Requirements → User Stories|Implementation Plan → Code|10-step" skills/dev-workflow/SKILL.md
```

Expected: no output.

## Task 2: Rewrite Detailed Workflow Reference

**Files:**
- Modify: `skills/dev-workflow/references/workflow.md`

- [ ] **Step 1: Replace the title and summary**

Use:

```markdown
# Agent Harness Workflow

> Controlled lifecycle for AI coding agents: intake, context load, normalization, harness plan, coverage validation, gated execution, verification, review, and handoff.
```

- [ ] **Step 2: Replace the old flow diagram**

Use this flow:

```text
① Intake
     ↓
② Context Load ──→ requirements.md
     ↓
③ Normalize ──→ user-stories.md
     ↓
④ Harness Plan ──→ implementation-plan.md
     ↓
⑤ Coverage Validation ──→ validation-report.md
     ↓
┌────────────────────────────┐
│ ⑥ Execute Behind Gates      │
│      ↓                     │
│ ⑦ Verify                   │
│      ↓                     │
│ ⑧ Review                   │
└────────────────────────────┘
     ↓
⑨ Handoff ──→ handoff.md
```

- [ ] **Step 3: Define artifact contract**

Include this tree:

```text
docs/plans/{feature-name}/
├── requirements.md
├── user-stories.md
├── implementation-plan.md
├── validation-report.md
├── execution-log.md
└── handoff.md
```

Also keep optional UI references under `ui-references/figma-notes.md` and `ui-references/screenshots/`.

- [ ] **Step 4: Define phase table**

The phase table must include columns:

```markdown
| Phase | Name | Required | Harness Output | Pause |
```

Rows must cover all nine phases. Pause is `Yes` for Normalize and Coverage Validation, conditional for Context Load when required context is missing, and no for the remaining phases unless verification fails.

- [ ] **Step 5: Add recovery rules**

Add explicit recovery rules for:

```markdown
- Missing context
- Missing UI reference
- Coverage validation failure
- Verification failure
- Parallel conflict
```

- [ ] **Step 6: Verify old 10-step language is removed**

Run:

```bash
rg -n "10 步|10-step|技术设计|最佳实践|五级查找" skills/dev-workflow/references/workflow.md
```

Expected: no output, except if the term is intentionally explained as replaced by the harness.

## Task 3: Update Scheduler Semantics

**Files:**
- Modify: `skills/dev-workflow/references/task-types.md`

- [ ] **Step 1: Rename summary**

Use:

```markdown
# Harness Task Types & Scheduler

Task types are scheduling primitives for the agent harness. They define how work may run, what isolation is required, and what review level applies before handoff.
```

- [ ] **Step 2: Update task table**

The table must include:

```markdown
| Type | ID | Scheduler | Review Level | Harness Use |
```

Keep these task IDs:

```text
code:dev
code:fix
code:refactor
doc:write
doc:translate
research
data
test
```

- [ ] **Step 3: Replace declaration syntax**

Use this declaration shape:

```markdown
## HarnessTask: <task id> - <task name>

### Control
- type: code:dev | code:fix | code:refactor | doc:write | doc:translate | research | data | test
- agent_role: implementer | reviewer | researcher | tester | documenter
- scheduler: parallel | isolated | serial
- isolation_key: <module-or-file-path>
- dependencies: []
- review_level: light | standard | strict

### Inputs
- Requirement: <requirement id or story id>
- Context: <artifact path or MCP source>

### Outputs
- Artifact: <file path>
- Verification: <command or review gate>

### Done When
- <observable completion condition>
```

- [ ] **Step 4: Verify no stale task declaration syntax remains**

Run:

```bash
rg -n "TaskGroup|@isolated|@cache|@depends" skills/dev-workflow/references/task-types.md
```

Expected: no output.

## Task 4: Update Harness Templates

**Files:**
- Modify: `skills/dev-workflow/references/templates/code-dev-task.md`
- Modify: `skills/dev-workflow/references/templates/code-fix-task.md`
- Modify: `skills/dev-workflow/references/templates/code-refactor-task.md`
- Modify: `skills/dev-workflow/references/templates/doc-write-task.md`
- Modify: `skills/dev-workflow/references/templates/research-task.md`
- Modify: `skills/dev-workflow/references/templates/test-task.md`

- [ ] **Step 1: Inspect current templates**

Run:

```bash
sed -n '1,220p' skills/dev-workflow/references/templates/code-dev-task.md
sed -n '1,220p' skills/dev-workflow/references/templates/code-fix-task.md
sed -n '1,220p' skills/dev-workflow/references/templates/code-refactor-task.md
sed -n '1,220p' skills/dev-workflow/references/templates/doc-write-task.md
sed -n '1,220p' skills/dev-workflow/references/templates/research-task.md
sed -n '1,220p' skills/dev-workflow/references/templates/test-task.md
```

Expected: templates are short markdown files that can be rewritten in place.

- [ ] **Step 2: Rewrite each template to the harness declaration format**

Each template must contain:

```markdown
# <Template Name>

## HarnessTask: <id> - <name>

### Control
### Inputs
### Steps
### Outputs
### Verification
### Done When
```

Use concrete default control values for each template:

```text
code-dev-task.md: type code:dev, agent_role implementer, scheduler isolated, review_level strict
code-fix-task.md: type code:fix, agent_role implementer, scheduler isolated, review_level standard
code-refactor-task.md: type code:refactor, agent_role implementer, scheduler serial, review_level strict
doc-write-task.md: type doc:write, agent_role documenter, scheduler parallel, review_level light
research-task.md: type research, agent_role researcher, scheduler parallel, review_level light
test-task.md: type test, agent_role tester, scheduler parallel, review_level standard
```

- [ ] **Step 3: Verify template consistency**

Run:

```bash
rg -n "HarnessTask|### Control|### Inputs|### Outputs|### Verification|### Done When" skills/dev-workflow/references/templates
```

Expected: every template contains all listed headings.

## Task 5: Update Public README Files

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Update deliverable names**

English README:

```markdown
| **Agent Harness Workflow Skill** (`skills/dev-workflow/`) | Self-contained agent harness skill. Install it to run requirement intake, planning, gated execution, verification, review, and handoff. |
```

Chinese README:

```markdown
| **Agent Harness Workflow Skill** (`skills/dev-workflow/`) | 自包含的 AI agent harness 工作流 Skill，安装后即可跑通需求接入、计划、门禁执行、验证、审查和交付。 |
```

- [ ] **Step 2: Update quick-start explanation**

English:

```markdown
Once installed, AI coding tools will automatically use the dev-workflow harness to govern the full development process.
```

Chinese:

```markdown
安装后，AI 编码工具会自动识别并使用 dev-workflow harness 管控完整开发流程。
```

- [ ] **Step 3: Update workflow phase list**

English:

```text
Intake → Context Load → Normalize → Harness Plan → Coverage Validation → Gated Execution → Verification → Review → Handoff
```

Chinese:

```text
需求接入 → 上下文加载 → 需求规范化 → Harness 计划 → 覆盖校验 → 门禁执行 → 验证 → 审查 → 交付
```

- [ ] **Step 4: Update directory comment for workflow reference**

English:

```text
workflow.md                  # Agent harness lifecycle
```

Chinese:

```text
workflow.md                  # Agent harness 生命周期
```

- [ ] **Step 5: Verify stale README phrasing is removed**

Run:

```bash
rg -n "parallel-task development framework|7 phases|10-step|Requirements → User Stories|并行任务开发框架|7 个阶段|10 步" README.md README.zh-CN.md
```

Expected: no output.

## Task 6: Final Verification

**Files:**
- Inspect all modified markdown files.

- [ ] **Step 1: Check that no MCP code changed**

Run:

```bash
git diff --name-only -- src tests package.json tsconfig.json tsdown.config.ts vitest.config.ts eslint.config.ts
```

Expected: no output.

- [ ] **Step 2: Check markdown consistency**

Run:

```bash
rg -n "7-phase|10-step|TaskGroup|@isolated|@cache|@depends" skills/dev-workflow README.md README.zh-CN.md
```

Expected: no output. After implementation, the skill and README files must not contain stale syntax.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: exit code 0.

- [ ] **Step 4: Review final diff**

Run:

```bash
git diff --stat
git diff -- skills/dev-workflow README.md README.zh-CN.md
```

Expected: diffs are limited to skill, references, templates, README files, and this plan.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add skills/dev-workflow README.md README.zh-CN.md docs/superpowers/plans/2026-04-27-agent-harness-workflow.md
git commit -m "docs: rewrite dev workflow as agent harness"
```

Expected: commit succeeds.
