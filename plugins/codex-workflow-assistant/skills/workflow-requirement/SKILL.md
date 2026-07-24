---
name: workflow-requirement
description: Start a requirement-driven development workflow in Codex App. Fetch requirement context, create a safe branch, and require user-story and implementation-plan approval before code changes.
---

# Workflow Requirement

Use this skill when the user enters a requirement number and wants Codex to start development.

## Inputs

- Requirement ID, task number, or requirement link.
- Optional base branch: `master`, `main`, or `dev`.

## Workflow

1. Fetch the requirement with `get_requirement`.
2. Fetch related issues with `get_related_issues` when the requirement has pending defects or the user asks for defects.
3. Fetch test cases with `get_testcases` when a task number is available.
4. Ensure the helper CLI exists. If `plugins/codex-workflow-assistant/scripts/dist/workflow-cli.mjs` is missing, run `pnpm build:workflow-plugin`.
5. Summarize the requirement without copying private content into committed files.
6. If the base branch is missing, ask the user to choose `master`, `main`, or `dev`.
7. Run:

```bash
node plugins/codex-workflow-assistant/scripts/dist/workflow-cli.mjs branch --requirement <id> --base <base-branch>
```

8. Produce user stories and an implementation plan.
9. After the implementation plan is approved, use `$workflow-plan-dates` to suggest and confirm task plan dates.
10. Wait for user confirmation before implementation.

## Safety Rules

- Do not modify files before the user confirms the implementation plan.
- Do not run destructive Git commands.
- Stop if the helper reports a dirty worktree.
- Do not write real requirement body text, private URLs, tokens, or credentials into source files, tests, docs, or commit messages.
