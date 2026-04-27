# Harness Engineering Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporate the useful Harness Engineering feedback into the existing dev-workflow harness documentation without changing MCP server code.

**Architecture:** Keep the skill as a lightweight agent harness contract. Add Blueprint, Backpressure, Context Quality, and coverage-sensor concepts to the references where agents need operational detail, then keep README updates concise so developers know the design principle without absorbing the full internal model.

**Tech Stack:** Markdown skill files, skills.sh `SKILL.md` format, existing TypeScript MCP package unchanged.

---

## File Structure

- Modify: `skills/dev-workflow/SKILL.md`
  - Responsibility: concise harness entry point and critical operating rules.
- Modify: `skills/dev-workflow/references/workflow.md`
  - Responsibility: detailed lifecycle, Blueprint, Backpressure, Context Quality, coverage sensors, recovery rules.
- Modify: `skills/dev-workflow/references/task-types.md`
  - Responsibility: task declaration control fields for feedback mode and retry limit.
- Modify: `skills/dev-workflow/references/templates/code-dev-task.md`
  - Responsibility: implementation task template with backpressure and retry guidance.
- Modify: `skills/dev-workflow/references/templates/code-fix-task.md`
  - Responsibility: fix task template with failure-as-feedback loop.
- Modify: `skills/dev-workflow/references/templates/code-refactor-task.md`
  - Responsibility: serial refactor template with deterministic gates.
- Modify: `skills/dev-workflow/references/templates/doc-write-task.md`
  - Responsibility: documentation template with context quality checks.
- Modify: `skills/dev-workflow/references/templates/research-task.md`
  - Responsibility: research template with protected-source fallback.
- Modify: `skills/dev-workflow/references/templates/test-task.md`
  - Responsibility: test task template with targeted-first verification.
- Modify: `README.md`
  - Responsibility: short English principle note.
- Modify: `README.zh-CN.md`
  - Responsibility: short Chinese principle note.
- No changes: `src/**`, `tests/**`, `package.json`, build config.

## Task 1: Add Operating Principles To Skill Entry

**Files:**
- Modify: `skills/dev-workflow/SKILL.md`

- [ ] **Step 1: Add a concise `Harness Engineering Principles` section after Core principle**

Add these bullets:

```markdown
## Harness Engineering Principles

- Treat the harness as feedforward guidance plus feedback sensors, not just a checklist.
- Keep `SKILL.md` concise; load detailed references only when needed.
- Prefer deterministic gates for repeatable work: dependency install, lint, typecheck, build, tests, diff checks.
- Use backpressure: successful gates stay quiet, failed gates expose precise, actionable errors.
- Mark context source quality before planning; do not infer from blocked, login-gated, or verification-gated pages.
```

- [ ] **Step 2: Update Verify phase with backpressure summary**

Add:

```markdown
- Prefer targeted gates before full gates.
- Keep successful gate output concise.
- On failure, capture the command, key error, likely owner task, and next repair action.
```

- [ ] **Step 3: Verify the skill entry references detailed workflow**

Run:

```bash
rg -n "Harness Engineering Principles|backpressure|source quality|references/workflow.md" skills/dev-workflow/SKILL.md
```

Expected: matches for the new principles and the detailed reference.

## Task 2: Expand Detailed Workflow Reference

**Files:**
- Modify: `skills/dev-workflow/references/workflow.md`

- [ ] **Step 1: Add Context Quality under Context Load**

Add a source status table:

```markdown
| Status | Meaning | Allowed Next Step |
|--------|---------|-------------------|
| `ok` | Source content was loaded and is usable | Normalize |
| `user_supplied` | Developer pasted or described the content | Normalize with source note |
| `blocked_by_verification` | Source returned a captcha or verification page | Ask for paste, screenshot, export, or summary |
| `login_required` | Source requires auth the agent does not have | Ask for accessible context |
| `unavailable` | Source cannot be fetched | Ask for fallback or stop |
```

- [ ] **Step 2: Add Blueprint section after Phase Table**

Define deterministic nodes and agent-loop nodes:

```markdown
| Node Type | Examples | Rule |
|-----------|----------|------|
| Deterministic | install, lint, typecheck, build, tests, diff checks | Always run when declared; do not leave to agent memory |
| Agent Loop | understand, plan, implement, repair, review | Agent may reason and iterate within the declared gate |
```

- [ ] **Step 3: Add Backpressure section after Verify**

State:

```markdown
Good backpressure is fast, quiet on success, precise on failure.
```

Include:

- targeted gates before full gates
- success output summary only
- failure output includes command, key error, owner task, repair instruction
- default retry limit is 2 before human escalation

- [ ] **Step 4: Add Coverage Sensor Classes to Coverage Validation**

Add:

```markdown
| Sensor Class | Checks | Examples |
|--------------|--------|----------|
| Maintainability | internal quality | lint, typecheck, duplication, complexity, docs consistency |
| Architecture | structural boundaries | dependency direction, module ownership, public contracts |
| Behavior | user-visible correctness | unit tests, integration tests, UI automation, acceptance checks |
```

- [ ] **Step 5: Update Recovery Rules for protected sources and retries**

Add protected source recovery and retry limit rules.

- [ ] **Step 6: Verify detailed workflow contains the new concepts**

Run:

```bash
rg -n "Context Quality|Blueprint|Backpressure|Sensor Class|blocked_by_verification|retry limit" skills/dev-workflow/references/workflow.md
```

Expected: matches for all new concepts.

## Task 3: Add Feedback Controls To Task Types

**Files:**
- Modify: `skills/dev-workflow/references/task-types.md`

- [ ] **Step 1: Add `feedback_mode` and `retry_limit` to declaration syntax**

Add these fields under `### Control`:

```markdown
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2
```

- [ ] **Step 2: Add control field descriptions**

Add:

```markdown
| `feedback_mode` | Yes | How verification output is exposed to the agent |
| `retry_limit` | Yes | Maximum repair attempts before human escalation |
```

- [ ] **Step 3: Add Backpressure section**

Document:

- quiet success
- actionable failure
- targeted-first verification
- two repair attempts by default

- [ ] **Step 4: Update examples with the new fields**

Every example control block must include:

```markdown
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2
```

- [ ] **Step 5: Verify task types contain feedback controls**

Run:

```bash
rg -n "feedback_mode|retry_limit|quiet_success|actionable_failure" skills/dev-workflow/references/task-types.md
```

Expected: matches in declaration syntax, field docs, and examples.

## Task 4: Update Templates

**Files:**
- Modify: `skills/dev-workflow/references/templates/code-dev-task.md`
- Modify: `skills/dev-workflow/references/templates/code-fix-task.md`
- Modify: `skills/dev-workflow/references/templates/code-refactor-task.md`
- Modify: `skills/dev-workflow/references/templates/doc-write-task.md`
- Modify: `skills/dev-workflow/references/templates/research-task.md`
- Modify: `skills/dev-workflow/references/templates/test-task.md`

- [ ] **Step 1: Add feedback fields to every template control block**

Add:

```markdown
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2
```

- [ ] **Step 2: Add task-specific backpressure lines**

Use these lines where appropriate:

```markdown
- Keep passing gate output concise; record only the gate name and pass status.
- On failure, record the command, key error, likely owner, and repair action.
- Stop after two repair attempts and ask for human direction.
```

- [ ] **Step 3: Add protected-source handling to research template**

Add:

```markdown
- If a web or MCP source is blocked by verification, login, or access control, record `source_status` and request a fallback instead of inferring content.
```

- [ ] **Step 4: Verify every template has feedback controls**

Run:

```bash
rg -n "feedback_mode|retry_limit|source_status|repair action" skills/dev-workflow/references/templates
```

Expected: every template includes feedback fields, and the research template includes `source_status`.

## Task 5: Update README Principle Notes

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Add a concise design principle after the lifecycle block**

English:

```markdown
The harness follows a feedforward + feedback model: it guides the agent with plans, artifacts, and task boundaries, then uses deterministic gates such as lint, typecheck, build, tests, and review as backpressure before handoff.
```

Chinese:

```markdown
这个 harness 遵循“前馈 + 反馈”模型：先用计划、产物和任务边界引导 agent，再用 lint、typecheck、build、tests、review 等确定性门禁形成反压，合格后再交付。
```

- [ ] **Step 2: Verify README notes exist**

Run:

```bash
rg -n "feedforward|backpressure|前馈|反压" README.md README.zh-CN.md
```

Expected: matches in both README files.

## Task 6: Final Verification And Commit

**Files:**
- Inspect all modified markdown files.

- [ ] **Step 1: Check no MCP code changed**

Run:

```bash
git diff --name-only -- src tests package.json tsconfig.json tsdown.config.ts vitest.config.ts eslint.config.ts pnpm-lock.yaml
```

Expected: no output.

- [ ] **Step 2: Check markdown diff cleanliness**

Run:

```bash
git diff --check
```

Expected: no output.

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

Expected: diffs only update harness documentation and this plan.

- [ ] **Step 5: Commit**

Run:

```bash
git add skills/dev-workflow README.md README.zh-CN.md docs/superpowers/plans/2026-04-27-harness-engineering-feedback.md
git commit -m "docs: add harness engineering feedback controls"
```

Expected: commit succeeds.
