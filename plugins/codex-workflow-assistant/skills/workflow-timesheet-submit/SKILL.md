---
name: workflow-timesheet-submit
description: Submit confirmed work-hour draft entries through the existing requirements MCP add_manhour tool.
---

# Workflow Timesheet Submit

Use this skill only after the user confirms exact work-hour entries.

## Workflow

1. Show each confirmed entry:
   - taskId
   - benchmark category
   - benchmark cap
   - hours
   - date
   - description
2. Ask for explicit confirmation if the current user message does not already confirm those exact values.
3. Call `add_manhour` once per confirmed entry.
4. After a successful call, run:

```bash
node plugins/codex-workflow-assistant/scripts/dist/workflow-cli.mjs mark-submitted --draft-id <draft-id> --manhour-key <key>
```

5. Report submitted entries and remaining pending entries.

## Safety Rules

- Do not submit entries marked `over-cap` unless the user explicitly says the entry is overtime and confirms the target task.
- Do not submit low-confidence or unmatched entries without user edits.
- Do not submit more than 8 normal hours for a day.
- Do not submit a single task entry whose hours exceed its workload benchmark cap; split it first.
