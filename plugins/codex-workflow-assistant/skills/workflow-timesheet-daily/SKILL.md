---
name: workflow-timesheet-daily
description: Draft today's work-hour entries from GitLab activity. Designed for Codex App project automations at 17:00.
---

# Workflow Timesheet Daily

Use this skill from a Codex App project automation scheduled at 17:00.

## Automation Prompt

Generate today's work-hour draft for this project. Query GitLab activity, match requirement IDs, estimate against the workload benchmark table, split any task that exceeds its benchmark cap, apply the 8-hour daily cap, and report entries that need user confirmation. Do not submit work hours unless the user explicitly confirms exact entries in this thread.

## Workflow

1. Ensure `GITLAB_TOKEN` is available in the Codex environment. The GitLab URL and project path are inferred from the repository `origin` remote unless explicitly overridden.
2. Ensure the helper CLI exists. If `plugins/codex-workflow-assistant/scripts/dist/workflow-cli.mjs` is missing, run `pnpm build:workflow-plugin`.
3. Run:

```bash
node plugins/codex-workflow-assistant/scripts/dist/workflow-cli.mjs draft --date today
```

4. Read the generated markdown summary.
5. Present each draft entry with task ID, benchmark category, benchmark cap, hours, date, description, evidence, and confidence.
6. Ask the user to approve, edit, or reject entries.
7. If the user confirms entries, use `$workflow-timesheet-submit`.

## Automation Requirements

- Codex App must be running at the scheduled time.
- The project folder must still exist.
- The automation should run in a dedicated worktree for Git repositories.
- Network access to GitLab must be permitted by the current sandbox and rules.

## Submission Rule

Never call `add_manhour` from an unattended automation run. Confirmation must happen in the thread after the draft is visible to the user.

## Benchmark Rule

Use the workload reference table as the estimation baseline. A single task draft must not exceed the selected benchmark hours. If estimated work exceeds the benchmark cap, split it into multiple parallel task drafts under the same requirement and mark the split evidence.
