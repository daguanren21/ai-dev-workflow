---
name: workflow-timesheet-daily
description: Draft today's work-hour entries from GitLab activity. Designed for Codex App project automations at 17:00.
---

# Workflow Timesheet Daily

Use this skill from a Codex App project automation scheduled at 17:00.

## Automation Prompt

Generate today's work-hour draft for this project. Query GitLab activity, match requirement IDs, apply the 8-hour cap, and report entries that need user confirmation. Do not submit work hours unless the user explicitly confirms exact entries in this thread.

## Workflow

1. Run:

```bash
node plugins/codex-workflow-assistant/scripts/workflow-cli.mjs draft --date today
```

2. Read the generated markdown summary.
3. Present each draft entry with task ID, hours, date, description, evidence, and confidence.
4. Ask the user to approve, edit, or reject entries.
5. If the user confirms entries, use `$workflow-timesheet-submit`.

## Automation Requirements

- Codex App must be running at the scheduled time.
- The project folder must still exist.
- The automation should run in a dedicated worktree for Git repositories.
- Network access to GitLab must be permitted by the current sandbox and rules.

## Submission Rule

Never call `add_manhour` from an unattended automation run. Confirmation must happen in the thread after the draft is visible to the user.
