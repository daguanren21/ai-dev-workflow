# Codex Workflow Assistant Design

## Status

Approved for planning on 2026-06-15.

## Problem

The repository already provides a Requirements MCP server for fetching ONES requirements and adding manhour records. The missing workflow layer is a Codex App plugin that can start a requirement-driven development session, create an isolated branch, inspect GitLab activity, draft daily work-hour records, and hand the final write operation back to the user for confirmation.

The user wants Codex App to run the daily work-hour workflow as a resident automation at 17:00, not through an external cron or launchd job. The design therefore uses Codex App project automations as the scheduled runner and keeps external schedulers as a fallback only.

## Goals

- Accept a requirement number and fetch requirement context through the existing `requirements` MCP server.
- Create a development branch from `master`, `main`, or `dev` after checking the local Git workspace.
- Produce user stories and an implementation plan before code changes.
- Draft task plan start and plan end dates from the approved implementation plan.
- Read GitLab commits and merge requests for the current day through a GitLab token.
- Draft work-hour records using a middle-level developer estimate.
- Use `/Users/liyanchao/工作量评估参考表.xlsx` as the workload benchmark source for task splitting and estimation.
- Require user confirmation before calling `add_manhour`.
- Require user confirmation before calling `update_task_plan_dates`.
- Enforce an 8-hour default daily cap for normal work-hour drafting.
- Support manual self-test, joint-debugging, meeting, and investigation entries that may not produce code commits.
- Use Codex App Automations as the primary 17:00 resident task mechanism.
- Keep tokens, private URLs, requirement contents, and real task identifiers out of committed source, tests, docs, and logs.

## Non-Goals

- Do not modify the existing Requirements MCP server source unless a later implementation task explicitly requires a new MCP tool.
- Do not automatically submit work-hour records from an unattended automation run.
- Do not store GitLab tokens, ONES credentials, or requirement body text in Git.
- Do not replace the existing `skills/dev-workflow` harness.
- Do not implement a separate background daemon when Codex App Automations can run the daily workflow.

## User Stories

1. As a developer, I can enter a requirement number and have Codex fetch requirement detail, related issues, and test cases through the existing Requirements MCP server.
2. As a developer, I can choose `master`, `main`, or `dev` as the base branch and have the workflow create a requirement branch after checking that my local workspace is safe.
3. As a developer, I receive user stories and an implementation plan before any implementation code is changed.
4. As a developer, I can let Codex query GitLab for today's commits and merge requests using `GITLAB_TOKEN`.
5. As a developer, I receive a work-hour draft with an estimate, evidence, matched requirement number, and confidence level.
6. As a developer, I receive suggested plan start and plan end dates after the implementation plan is approved.
7. As a developer, I approve or edit the plan start and end dates before the workflow calls `update_task_plan_dates`.
8. As a developer, I approve, edit, or reject each work-hour draft before the workflow calls `add_manhour`.
9. As a developer, I get a daily 17:00 Codex App Automation run that drafts work-hour entries and reports them in Codex App Triage.
10. As a developer, I can manually add non-code work such as self-test, joint debugging, meeting, or investigation time to a requirement.
11. As a developer, I am warned when the day's draft total exceeds 8 hours, and the workflow does not auto-submit the excess.
12. As a developer, I can inspect the local draft history to avoid duplicate work-hour entries.

## Recommended Architecture

Use a repo-local Codex plugin plus local helper scripts:

```text
plugins/codex-workflow-assistant/
├── .codex-plugin/plugin.json
├── skills/
│   ├── workflow-requirement/
│   │   └── SKILL.md
│   ├── workflow-timesheet-daily/
│   │   └── SKILL.md
│   ├── workflow-timesheet-commit/
│   │   └── SKILL.md
│   ├── workflow-plan-dates/
│   │   └── SKILL.md
│   └── workflow-timesheet-submit/
│       └── SKILL.md
└── scripts/
    ├── workflow-cli.mjs
    └── lib/
        ├── env.mjs
        ├── git.mjs
        ├── gitlab.mjs
        ├── matcher.mjs
        ├── estimator.mjs
        ├── drafts.mjs
        └── format.mjs
```

The plugin provides Codex-facing skills. The helper scripts perform deterministic local work: Git checks, GitLab API calls, matching, estimate calculation, and draft serialization. The final ONES write stays in Codex through the existing `add_manhour` MCP tool after the user confirms the draft.

## Component Responsibilities

### Codex Plugin

- Exposes workflow skills to Codex App.
- Describes exactly when to call MCP tools and helper scripts.
- Provides prompts suitable for Codex App Automation.
- Does not contain credentials.
- Does not directly submit work-hour records without user confirmation.

### Requirement Workflow Skill

- Fetches requirement data with `get_requirement`.
- Optionally fetches related issues with `get_related_issues`.
- Optionally fetches test cases with `get_testcases`.
- Calls the local CLI to create a branch only after the user selects a base branch.
- Requires user-story and implementation-plan approval before implementation.
- Hands off to the plan-date skill after the implementation plan is approved.

### Plan-Date Skill

- Reads the approved implementation plan, current date, selected base branch, and expected task count.
- Suggests `planStartDate` and `planEndDate` in `YYYY-MM-DD` format.
- Defaults `planStartDate` to the first active development day unless the user supplies another date.
- Estimates `planEndDate` from implementation complexity, verification scope, and known non-code work such as self-test or joint debugging.
- Shows the final task ID, plan start date, and plan end date before writing.
- Calls `update_task_plan_dates` only after explicit user confirmation.

### Git Helper

- Detects the repository root.
- Checks whether the worktree is clean before branch creation.
- Validates allowed base branches: `master`, `main`, and `dev`.
- Creates a branch name such as `req/96706-short-title` with sanitized text.
- Does not run destructive Git commands.

### GitLab Helper

- Reads `GITLAB_URL`, `GITLAB_TOKEN`, and either `GITLAB_PROJECT_ID` or the Git remote URL.
- Fetches commits and merge requests for a date range.
- Uses page-based pagination until no more records are returned.
- Emits normalized activity records that tests can verify without network access.

### Requirement Matcher

- Matches requirement IDs from branch names, commit messages, and merge request titles.
- Gives higher confidence to branch and merge request title matches than loose commit message matches.
- Leaves unmatched activity as review-needed instead of guessing.

### Work-Hour Estimator

- Estimates as a middle-level developer.
- Uses the workload reference table as the baseline for benchmark category, complexity level, and maximum hours per task.
- Uses evidence such as changed files, insertion/deletion counts, test-related changes, number of commits, and manual non-code notes.
- Rounds to 0.5-hour increments.
- Splits estimated work into multiple parallel task drafts when the total exceeds the benchmark cap for the selected category.
- Caps normal daily draft totals at 8 hours.
- Marks excess, unmatched, or low-confidence entries as manual-review.

### Draft Store

- Writes only local machine state.
- Stores draft metadata, estimates, evidence, and submit status.
- Does not store GitLab tokens, ONES credentials, raw requirement bodies, or private URLs.
- Uses stable draft IDs so repeated runs do not duplicate the same activity.

### Submit Skill

- Reads selected draft entries.
- Shows the exact `taskId`, `hours`, `description`, and `date`.
- Calls `add_manhour` only after explicit user confirmation.
- Records the returned manhour key in local draft state after a successful submit.

## Codex App Automation Design

Codex App Automations are the primary scheduled runner for the daily workflow. The project automation should run at 17:00 each workday and invoke the plugin skill:

```text
$workflow-timesheet-daily
Generate today's work-hour draft for this project. Query GitLab activity, match requirement IDs, apply the 8-hour cap, and report entries that need my confirmation. Do not submit work hours unless I explicitly confirm the exact entries in this thread.
```

Recommended settings:

- Type: project-scoped standalone automation.
- Schedule: daily at 17:00, or a custom cron expression if weekdays-only behavior is required.
- Project: the repository being worked on.
- Git mode: dedicated background worktree when the project is a Git repository.
- Output: Codex App Triage entry with draft summary and next actions.
- Sandbox: workspace-write plus allowlisted network commands needed for GitLab API access.

Important behavior constraints:

- The local machine must be powered on.
- Codex App must be running.
- The project path must still exist.
- Automations run unattended, so they must draft and report rather than submit.
- If sandbox policy blocks network access, the automation reports the missing permission instead of fabricating data.

## Commit-Time Drafting

Commit-time drafting remains optional. It is useful for capturing context while it is fresh, but it should not replace the 17:00 Codex App Automation.

The first version should provide a manual command:

```bash
node plugins/codex-workflow-assistant/scripts/workflow-cli.mjs draft --date today
```

A later version can offer an opt-in `post-commit` Git hook installer. It must never install hooks without explicit user action.

## Manual Non-Code Work

The workflow supports manual notes for work that has no code commit:

```bash
node plugins/codex-workflow-assistant/scripts/workflow-cli.mjs note \
  --task 96706 \
  --hours 1 \
  --kind self-test \
  --description "self-test and joint debugging"
```

Supported kinds:

- `self-test`
- `joint-debug`
- `meeting`
- `investigation`
- `review`
- `other`

Manual notes count toward the 8-hour daily cap unless the user explicitly treats the work as overtime.

## Data Flow

### Start Development

1. User asks Codex to start requirement `96706`.
2. Codex uses `get_requirement` to fetch requirement context.
3. Codex summarizes requirement scope and asks for base branch if it is not provided.
4. Codex calls the local CLI to validate Git state and create the branch.
5. Codex writes user stories and an implementation plan.
6. User confirms the implementation plan.
7. Codex suggests plan start and plan end dates.
8. User confirms or edits the dates.
9. Codex calls `update_task_plan_dates`.
10. User confirms before implementation code changes.

### Daily Draft

1. Codex App Automation wakes at 17:00.
2. The automation invokes `$workflow-timesheet-daily`.
3. The skill calls the helper script to fetch GitLab activity.
4. The helper matches activity to requirement IDs.
5. The estimator creates capped draft entries.
6. The helper writes draft metadata.
7. Codex reports the draft in Triage and asks for confirmation.

### Submit Confirmed Work Hours

1. User confirms a draft entry or edits the entry values.
2. Codex shows the final parameters.
3. Codex calls `add_manhour`.
4. Codex records the returned manhour key in local draft state.
5. Codex reports any remaining unsubmitted draft entries.

### Submit Confirmed Plan Dates

1. User confirms a requirement or task ID and an approved implementation plan.
2. Codex suggests `planStartDate` and `planEndDate`.
3. User confirms or edits both dates.
4. Codex calls `update_task_plan_dates`.
5. Codex reports the updated dates and keeps implementation gated by the approved plan.

## Work-Hour Estimation Rules

The first version uses deterministic rules instead of model-only estimation. The workload benchmark table is the source of truth for category and complexity caps. Single task entries must not exceed the selected benchmark hours; overflow becomes additional parallel task drafts under the same requirement.

| Evidence | Draft Hours |
| --- | --- |
| Documentation-only or tiny config change | 0.5 |
| Small code change with limited files | 1.0 |
| Small code change plus tests | 1.5 |
| Medium feature or bug fix across 3-6 source files | 2.0-3.0 |
| Cross-module change with tests and review work | 3.5-5.0 |
| Large multi-area change | 5.5-6.0 and manual-review |
| Manual self-test or joint debugging note | User-provided hours |

Benchmark policy:

- Default to the `B.中等（h）` value for middle-level estimates unless the user or implementation evidence clearly selects A or C.
- Use the nearest available lower level if a benchmark has no C-level value.
- Enforce the table's single task cap before enforcing the daily 8-hour cap.
- Split work over the selected benchmark cap into multiple same-requirement task drafts.
- Keep the actual Excel file outside Git; commit only anonymized/static benchmark rules derived from it.

Daily cap policy:

- Sum normal draft entries for the selected date.
- Include already submitted draft entries in the total.
- If the total exceeds 8 hours, mark excess entries as `over-cap`.
- Never submit over-cap entries from automation.
- The user can explicitly trigger overtime submission for a target requirement or task.

## Configuration

Environment variables:

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

`GITLAB_PROJECT_ID` is preferred. Remote URL inference is allowed only when it can produce a clear single project path. Secrets are read from environment variables and are never written to draft files.

## Security And Privacy

- Do not commit real requirement contents, credentials, private URLs, GitLab tokens, or ONES tokens.
- Test fixtures must use anonymized IDs and domains such as `gitlab.example.com`.
- Automation output should include summaries and evidence, not full requirement bodies.
- Network access must go through Codex App sandbox and rule approval.
- `add_manhour` must be called only after explicit user confirmation.
- `update_task_plan_dates` must be called only after explicit user confirmation.

## Error Handling

- Missing GitLab token: report the missing variable and skip GitLab fetch.
- Missing project ID and ambiguous remote: ask the user to set `GITLAB_PROJECT_ID`.
- Dirty worktree during branch creation: stop and ask the user to commit, stash, or choose another workspace.
- Unknown base branch: reject and list `master`, `main`, and `dev`.
- Unmatched commits: create a review-needed draft bucket.
- Duplicate draft: reuse the existing draft ID and update evidence rather than creating another pending entry.
- Failed `add_manhour`: show the MCP error and keep the draft unsubmitted.
- Invalid plan date format: reject the value and ask for `YYYY-MM-DD`.
- Plan end date before plan start date: reject the values and ask for corrected dates.
- Failed `update_task_plan_dates`: show the MCP error and leave implementation gated.

## Testing Strategy

- Unit-test Git command parsing with injected command runners.
- Unit-test GitLab pagination with injected `fetch`.
- Unit-test requirement matching.
- Unit-test hour estimation and 8-hour cap.
- Unit-test benchmark category limits and task splitting.
- Unit-test draft de-duplication and state transitions.
- Verify the plan-date skill prompt requires confirmation before calling `update_task_plan_dates`.
- Validate plugin manifest with the plugin validator.
- Run repository checks: `pnpm test:run`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Open Decisions For Implementation

- Use a repo-local marketplace at `.agents/plugins/marketplace.json` if the workspace allows writing that path; otherwise create the plugin first and request approval before adding the marketplace entry.
- Start with manual submit confirmation inside Codex, then consider a stricter machine-readable confirmation format after the first manual workflow is tested.
- Start without an installed Git hook; add an opt-in hook installer only after daily automation is stable.
