---
name: workflow-plan-dates
description: Suggest and submit confirmed task plan start and end dates through the existing requirements MCP update_task_plan_dates tool.
---

# Workflow Plan Dates

Use this skill after the user approves the implementation plan for a requirement or task.

## Inputs

- taskId: requirement or task ID, number, key, or displayId.
- Approved implementation plan.
- Optional plan start date in `YYYY-MM-DD`.
- Optional plan end date in `YYYY-MM-DD`.

## Workflow

1. Read the approved implementation plan and identify expected implementation, verification, self-test, and joint-debugging scope.
2. Suggest `planStartDate` and `planEndDate` in `YYYY-MM-DD` format.
3. Show the exact values:
   - taskId
   - planStartDate
   - planEndDate
4. Ask for explicit confirmation if the current user message does not already confirm those exact values.
5. Call `update_task_plan_dates` with the confirmed values.
6. Report the updated plan dates.

## Date Rules

- Use the current local date as the default `planStartDate` when the user does not provide one.
- `planEndDate` must be the same as or later than `planStartDate`.
- Keep dates in `YYYY-MM-DD`.
- Do not call `update_task_plan_dates` with vague values such as `today`, `tomorrow`, or `next week`.

## Safety Rules

- Do not update plan dates before the implementation plan is approved.
- Do not update plan dates without explicit confirmation of exact dates.
- Do not write private requirement content into source files, tests, docs, or commit messages.
