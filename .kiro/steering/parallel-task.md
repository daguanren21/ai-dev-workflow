# Parallel Task Framework

## Core Docs

- Read `docs/parallel-task/README.md` for the full specification (SSOT)
- Read `docs/parallel-task/workflow.md` for the 10-step workflow
- Read `docs/parallel-task/task-types.md` for task types and scheduling
- Read `docs/parallel-task/service-transform.md` for Mock/API adaptation

## Workflow

Follow this workflow for all development tasks:

1. Gather requirements via `requirements` MCP tool
2. Generate `design.md` and `tasks.md`
3. Match skills using the 5-level lookup (project skills -> global skills -> skills.sh -> Context7 MCP -> WebSearch)
4. Apply best practices, update `design.md`
5. Validate design against requirements
6. Implement code following task-types scheduling rules
7. Run UI verification with Playwright (frontend projects only)
8. Code review at appropriate level (light / standard / strict)
9. Quality gate: lint -> type -> build

## Task Types

- `code:dev` — isolated (parallel across modules, serial within)
- `code:fix` — isolated (parallel across files, serial within)
- `code:refactor` — serial (global lock)
- `doc:write` / `doc:translate` — parallel
- `research` — parallel, supports caching
- `data` — isolated by data source
- `test` — parallel

## Constraints

- Max parallel tasks: 5
- Output plans to `docs/plans/{ticket}/`
- Use service-layer transform for Mock-to-API adaptation, no separate adapters directory
- Quality checks must pass in order: lint, type, build

## Templates

- Use templates from `docs/parallel-task/templates/` when creating tasks
