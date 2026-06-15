---
name: workflow-timesheet-commit
description: Draft work-hour candidates after recent commits. This is optional and does not replace the daily Codex App automation.
---

# Workflow Timesheet Commit

Use this skill when the user wants an immediate work-hour draft after committing code.

## Workflow

1. Ensure the helper CLI exists. If `plugins/codex-workflow-assistant/scripts/dist/workflow-cli.mjs` is missing, run `pnpm build:workflow-plugin`.
2. Run:

```bash
node plugins/codex-workflow-assistant/scripts/dist/workflow-cli.mjs draft --date today --recent
```

3. Show the generated draft.
4. Show the matched workload benchmark category and verify no single task exceeds the benchmark cap.
5. Ask whether to keep it as a pending draft.
6. Do not submit work hours unless the user explicitly confirms via `$workflow-timesheet-submit`.

## Hook Policy

Do not install Git hooks automatically. If the user asks for a hook, explain that it is opt-in and show the exact hook command before writing it.
