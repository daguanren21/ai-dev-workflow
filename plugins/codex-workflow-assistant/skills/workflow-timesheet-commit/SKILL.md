---
name: workflow-timesheet-commit
description: Draft work-hour candidates after recent commits. This is optional and does not replace the daily Codex App automation.
---

# Workflow Timesheet Commit

Use this skill when the user wants an immediate work-hour draft after committing code.

## Workflow

1. Run:

```bash
node plugins/codex-workflow-assistant/scripts/workflow-cli.mjs draft --date today --recent
```

2. Show the generated draft.
3. Ask whether to keep it as a pending draft.
4. Do not submit work hours unless the user explicitly confirms via `$workflow-timesheet-submit`.

## Hook Policy

Do not install Git hooks automatically. If the user asks for a hook, explain that it is opt-in and show the exact hook command before writing it.
