# Codex Workflow Assistant

Codex Workflow Assistant starts requirement-driven development workflows, writes confirmed task plan dates, and drafts daily work-hour entries from GitLab activity.

## Required Environment

```text
GITLAB_URL=https://gitlab.example.com
GITLAB_TOKEN=glpat-example
GITLAB_PROJECT_ID=12345
WORKFLOW_DAILY_HOUR_CAP=8
WORKFLOW_DEFAULT_BASE_BRANCH=dev
WORKFLOW_DEFAULT_BENCHMARK_CATEGORY=前端-新增组件
WORKFLOW_DEFAULT_COMPLEXITY=medium
WORKFLOW_STATE_DIR=.codex-workflow
```

Keep real token values in your local shell, Codex environment, or secret manager. Do not commit them.

## Build

Helper source lives in TypeScript under `scripts/src/`. Build the runnable `.mjs` entry with:

```bash
pnpm build:workflow-plugin
```

The generated CLI entry is:

```text
plugins/codex-workflow-assistant/scripts/dist/workflow-cli.mjs
```

The generated `scripts/dist/` directory is ignored by Git. Run `pnpm build:workflow-plugin` after installing or updating the plugin.

## Workload Benchmark Rule

Work-hour estimates use the workload reference table as their baseline. A single task draft must not exceed the matched benchmark hours. When estimated work exceeds the benchmark cap, split it into multiple parallel task drafts under the same requirement.

The benchmark data is derived from `/Users/liyanchao/工作量评估参考表.xlsx`. The real workbook stays outside Git.

For daily automation, set `WORKFLOW_DEFAULT_BENCHMARK_CATEGORY` and `WORKFLOW_DEFAULT_COMPLEXITY` to the category and level that should be used when a commit or merge request does not explicitly provide a benchmark category.

## Start Requirement Work

Ask Codex:

```text
$workflow-requirement start requirement 96706 from dev
```

The workflow fetches requirement context, creates a branch, and produces user stories plus an implementation plan before code changes.

## Set Task Plan Dates

Ask Codex:

```text
$workflow-plan-dates set plan dates for requirement 96706
```

Codex suggests `planStartDate` and `planEndDate` in `YYYY-MM-DD` format. After you confirm the exact values, Codex calls `update_task_plan_dates`.

## Daily 17:00 Automation

Create a Codex App project automation with this prompt:

```text
$workflow-timesheet-daily
Generate today's work-hour draft for this project. Query GitLab activity, match requirement IDs, estimate against the workload benchmark table, split any task that exceeds its benchmark cap, apply the 8-hour cap, and report entries that need my confirmation. Do not submit work hours unless I explicitly confirm the exact entries in this thread.
```

Recommended automation settings:

- Run as a project-scoped standalone automation.
- Schedule it daily at 17:00.
- Use a dedicated background worktree for Git repositories.
- Keep sandbox settings at workspace-write and allow only the GitLab network access the workflow needs.

## Manual Non-Code Work

```bash
node plugins/codex-workflow-assistant/scripts/dist/workflow-cli.mjs note --task 96706 --hours 1 --kind self-test --description "self-test and joint debugging"
```

## Submit Confirmed Drafts

Ask Codex:

```text
$workflow-timesheet-submit submit draft 2026-06-15-96706-commits-1
```

Codex shows the final task ID, benchmark category, benchmark cap, hours, date, and description before calling `add_manhour`.
