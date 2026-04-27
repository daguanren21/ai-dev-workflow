---
name: dev-workflow
description: >
  Use when starting any AI-assisted development task that needs a controlled agent harness:
  requirement intake, MCP/context loading, normalization, task graph planning, gated execution,
  verification, review, and handoff. Supports ONES/GitHub/Jira/Figma MCP as context sources,
  but does not require changing MCP server code.
metadata:
  author: ai-dev-workflow
  version: "0.1.0"
---

# Dev Workflow Harness

## Setup

Install this skill:

```bash
npx skills add daguanren21/ai-dev-workflow
```

Install to a specific agent with `-a`:

```bash
npx skills add daguanren21/ai-dev-workflow -a claude-code
npx skills add daguanren21/ai-dev-workflow -a cursor
```

**Prerequisites:**

1. Optional community skill discovery:

```bash
npx skills add vercel-labs/skills --skill find-skills -a claude-code
```

2. Optional companion MCP servers based on context source:

| Source | MCP Server |
|--------|------------|
| ONES | `ai-dev-requirements` (bundled) |
| GitHub | [github/github-mcp-server](https://github.com/github/github-mcp-server) |
| Jira | [Atlassian Rovo MCP](https://www.atlassian.com/blog/announcements/remote-mcp-server) |
| Figma | [Figma MCP Server](https://developers.figma.com/docs/figma-mcp-server/) |

## Overview

AI agent harness for requirement-driven software work. The harness controls what context the agent may load, which artifacts it must produce, when it must pause, how tasks are scheduled, and which verification gates must pass before handoff.

**Announce at start:** "I'm using the dev-workflow harness to drive this development task."

**Core principle:** Harness first. Normalize inputs, create traceable artifacts, validate coverage, execute behind gates, and hand off evidence. Do not jump from a requirement directly to code.

## Harness Lifecycle

### Phase 1: Intake

**Input:** requirement ID, issue link, document link, Figma link, screenshot, or natural language request.

**Action:**
- Identify the requested outcome.
- Identify context sources: ONES, GitHub, Jira, Figma, local files, or user text.
- Choose a stable `{feature-name}` for artifact paths.

**Output:** source inventory and artifact path: `docs/plans/{feature-name}/`.

**Pause:** only if the request has no actionable requirement or source.

### Phase 2: Context Load

**Input:** source inventory from intake.

**Action:**
- Fetch ONES requirements with the bundled Requirements MCP Server when available.
- Fetch GitHub or Jira issue context with external MCP servers when available.
- Fetch Figma design context with Figma MCP when UI work depends on a Figma file.
- Use user-provided text directly when no MCP source exists.

**Output:** `docs/plans/{feature-name}/requirements.md`.

**Pause:** if required context is unavailable and cannot be replaced by user-provided text.

### Phase 3: Normalize Requirements

**Input:** `requirements.md`.

**Action:**
- Convert raw context into independently deliverable user stories.
- Write acceptance criteria with Given/When/Then.
- Mark UI dependencies, backend dependencies, data dependencies, and external integrations.
- Record open questions and assumptions explicitly.

**Output:** `docs/plans/{feature-name}/user-stories.md`.

**Pause:** always. The developer must confirm stories and required UI references before planning.

### Phase 4: Build Harness Plan

**Input:** confirmed user stories, UI references, project conventions, and relevant skills.

**Action:**
- Build a task graph from user stories.
- Assign task type, agent role, scheduler mode, isolation key, dependencies, inputs, outputs, review level, and verification gate.
- Prefer small tasks that can be reviewed and verified independently.
- Use `references/task-types.md` for scheduler semantics and templates from `references/templates/`.

**Output:** `docs/plans/{feature-name}/implementation-plan.md`.

**Pause:** follow the planning tool or team gate. If no explicit gate exists, pause before implementation when the plan changes scope or risk.

### Phase 5: Validate Coverage

**Input:** requirements, user stories, and harness plan.

**Action:**
- Build a traceability matrix: requirement -> user story -> task -> verification gate.
- Check every requirement for story coverage, acceptance criteria, implementation task, edge cases, and verification.
- Classify uncovered items and risks.

**Output:** `docs/plans/{feature-name}/validation-report.md`.

**Pause:** always when coverage is incomplete, high risk, or requires product judgment.

### Phase 6: Execute Behind Gates

**Input:** approved harness plan.

**Action:**
- Use subagent-driven execution when available; otherwise execute inline with checkpoints.
- Preserve isolation keys.
- Run `parallel` tasks within `parallel_limit`.
- Run `isolated` tasks serially within the same isolation key and in parallel across different keys.
- Run `serial` tasks under a global lock.
- Record meaningful execution notes in `execution-log.md`.

**Output:** source, test, documentation, or generated artifacts declared by the plan.

**Pause:** on blockers, repeated verification failure, unclear instructions, or isolation conflicts.

### Phase 7: Verify

**Input:** changed artifacts.

**Action:**
- Run the verification gates declared by each task.
- For TypeScript projects, prefer `pnpm lint`, `pnpm typecheck`, `pnpm build`, and targeted tests when applicable.
- For frontend projects, verify user-facing behavior with browser automation where available.
- Capture failures before fixing them.

**Output:** verification evidence in `execution-log.md` or `handoff.md`.

**Pause:** if required verification cannot run or fails repeatedly.

### Phase 8: Review

**Input:** final diff and verification evidence.

**Action:**
- Review requirement coverage, behavioral risk, changed files, and verification results.
- Use strict review for new features and refactors.
- Use standard review for fixes and tests.
- Use light review for documentation and research.

**Output:** review notes, risk list, and any follow-up tasks.

**Pause:** if review finds a blocking defect or missing requirement coverage.

### Phase 9: Handoff

**Input:** final artifacts, verification evidence, and review notes.

**Action:**
- Summarize changed files and user-visible behavior.
- State verification commands and results.
- State residual risks or skipped checks.
- Provide next actions only when they are concrete.

**Output:** `docs/plans/{feature-name}/handoff.md` when the project requires persistent handoff, plus the final agent response.

## MCP Boundary

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

## Artifact Contract

Use this structure for harness artifacts:

```text
docs/plans/{feature-name}/
├── requirements.md
├── user-stories.md
├── implementation-plan.md
├── validation-report.md
├── execution-log.md
└── handoff.md
```

Optional UI artifacts:

```text
docs/plans/{feature-name}/ui-references/
├── figma-notes.md
└── screenshots/
```

## Scheduling Rules

| Scheduler | Meaning | Constraint |
|-----------|---------|------------|
| `parallel` | Independent work | Bounded by `parallel_limit` |
| `isolated` | Work isolated by module, file, or data source | Serial within an isolation key, parallel across keys |
| `serial` | Work requiring a global lock | One task at a time |

Default `parallel_limit`: 5.

Use `references/task-types.md` for task declarations and review levels.

## Recovery Rules

| Failure | Harness Response |
|---------|------------------|
| Missing context | Pause and ask for source, or proceed only with explicit user-provided text |
| Missing UI reference | Pause before implementation for UI work that depends on visual fidelity |
| Coverage validation failure | Revise user stories or plan before execution |
| Verification failure | Capture failure, fix the relevant task, rerun the gate |
| Parallel conflict | Stop the affected group and serialize the conflict boundary |

## Quick Reference

| Phase | Output | Pause |
|-------|--------|-------|
| 1. Intake | Source inventory | Conditional |
| 2. Context Load | `requirements.md` | Conditional |
| 3. Normalize | `user-stories.md` | Yes |
| 4. Harness Plan | `implementation-plan.md` | Conditional |
| 5. Coverage Validation | `validation-report.md` | Yes on risk |
| 6. Execute | Changed artifacts + `execution-log.md` | On blocker |
| 7. Verify | Verification evidence | On failure |
| 8. Review | Review notes | On blocking finding |
| 9. Handoff | `handoff.md` or final response | No |

## Common Mistakes

- Jumping from requirement to code without normalized stories and a plan.
- Treating MCP as the implementation target instead of a context source.
- Running tasks with the same isolation key in parallel.
- Skipping coverage validation before implementation.
- Claiming completion without fresh verification evidence.
- Leaving handoff without changed files, verification results, and residual risks.
