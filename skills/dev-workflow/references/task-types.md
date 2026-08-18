# Harness Task Types & Scheduler

Task types are scheduling primitives for the agent harness. They define how work may run, what isolation is required, and what review level applies before handoff.

Task type does not grant permission to execute. Lifecycle stage, gate state, dependencies, and mutation boundary must all allow the task to run.

## Task Types

| Type | ID | Scheduler | Review Level | Harness Use |
|------|----|-----------|--------------|-------------|
| Code Development | `code:dev` | `isolated` | strict | New behavior in a bounded module or feature area |
| Code Fix | `code:fix` | `isolated` | standard | Defect correction owned by a file, module, or failing gate |
| Code Refactor | `code:refactor` | `serial` | strict | Structure change with broad impact or shared contracts |
| Doc Writing | `doc:write` | `parallel` | light | New or updated documentation artifacts |
| Doc Translation | `doc:translate` | `parallel` | light | Translation work that preserves source meaning |
| Research | `research` | `parallel` | light | Context gathering, option comparison, or source analysis |
| Data Processing | `data` | `isolated` | standard | Fixture, migration, import, export, or data-source work |
| Testing | `test` | `parallel` | standard | Unit, integration, regression, or verification work |

## Scheduler Modes

| Scheduler | Rule | Use When |
|-----------|------|----------|
| `parallel` | Tasks may run concurrently up to `parallel_limit` | Work touches independent artifacts |
| `isolated` | Tasks sharing an isolation key run serially; different keys may run concurrently | Work is safe across modules but unsafe inside the same module or file |
| `serial` | One task runs at a time under a global lock | Work changes shared contracts, architecture, or broad behavior |

Default `parallel_limit`: 5.

## Task Declaration Syntax

```markdown
## HarnessTask: <task id> - <task name>

### Control
- type: code:dev | code:fix | code:refactor | doc:write | doc:translate | research | data | test
- stage: discovery | planning | implementation | verification | handoff
- agent_role: implementer | reviewer | researcher | tester | documenter
- scheduler: parallel | isolated | serial
- isolation_key: <module-or-file-path>
- dependencies: []
- required_gates: [] | [stories_approved] | [stories_approved, coverage_passed, plan_approved]
- review_level: light | standard | strict
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2

### Inputs
- Requirement: <requirement id or story id>
- Context: <artifact path or MCP source>

### Outputs
- Artifact: <file path>
- Verification: <command or review gate>

### Done When
- <observable completion condition>
```

## Control Fields

| Field | Required | Meaning |
|-------|:---:|---------|
| `type` | Yes | Work category and default review expectation |
| `stage` | Yes | Lifecycle phase in which the task is allowed to run |
| `agent_role` | Yes | Primary role responsible for the task |
| `scheduler` | Yes | Execution mode: `parallel`, `isolated`, or `serial` |
| `isolation_key` | Yes for `isolated`, optional for others | Module, file, data source, or shared contract boundary |
| `dependencies` | Yes | Task IDs that must finish first; use an empty list when none exist |
| `required_gates` | Yes | Current approvals and validation states required before execution |
| `review_level` | Yes | `light`, `standard`, or `strict` |
| `feedback_mode` | Yes | How verification output is exposed to the agent |
| `retry_limit` | Yes | Maximum repair attempts before human escalation |

## Gate Preconditions

| Task Stage | Default Required Gates | Mutation Rule |
|------------|------------------------|---------------|
| `discovery` | `[]` | Read-only fact gathering only; source mutations are forbidden |
| `planning` | `[stories_approved]` | May write planning artifacts, not implementation artifacts |
| `implementation` | `[stories_approved, coverage_passed, plan_approved]` | May mutate only the approved task boundary |
| `verification` | `[stories_approved, coverage_passed, plan_approved]` | Test-file writes require plan authorization; check execution is read-only |
| `handoff` | `[stories_approved, coverage_passed, plan_approved]` | May write only declared handoff artifacts |

Gate state is revision-bound. If an upstream artifact changes, affected tasks return to blocked even when an older approval exists.

## Review Levels

| Level | Applies To | Required Review |
|-------|------------|-----------------|
| `light` | Documentation, research, low-risk metadata | Check accuracy, links, scope, and consistency |
| `standard` | Fixes, tests, data work, bounded behavior | Check correctness, regression risk, and verification evidence |
| `strict` | New features, refactors, shared contracts | Check requirements coverage, architecture, edge cases, and full verification gates |

## Backpressure

Verification output should act as backpressure:

- `quiet_success`: passing gates report only the gate name and pass status.
- `actionable_failure`: failing gates expose the command, key error, likely owner task, and repair instruction.
- Prefer targeted gates before full gates to keep feedback fast and relevant.
- Default `retry_limit` is 2 repair attempts before human escalation.
- Long logs belong in `execution-log.md`, not in the active agent context.

## Scheduling Examples

### Independent Documentation

```markdown
## HarnessTask: HT-DOC-1 - Update README quick start

### Control
- type: doc:write
- stage: implementation
- agent_role: documenter
- scheduler: parallel
- isolation_key: docs/readme
- dependencies: []
- required_gates: [stories_approved, coverage_passed, plan_approved]
- review_level: light
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2

### Inputs
- Requirement: US-DOC-1
- Context: docs/plans/harness/user-stories.md

### Outputs
- Artifact: README.md
- Verification: content review plus `pnpm lint`

### Done When
- README describes the current harness lifecycle and no stale public workflow wording remains.
```

### Isolated Feature Work

```markdown
## HarnessTask: HT-FEAT-1 - Implement requirement search filter

### Control
- type: code:dev
- stage: implementation
- agent_role: implementer
- scheduler: isolated
- isolation_key: src/tools/search-requirements.ts
- dependencies: [HT-PLAN-1]
- required_gates: [stories_approved, coverage_passed, plan_approved]
- review_level: strict
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2

### Inputs
- Requirement: US-2
- Context: docs/plans/search-filter/user-stories.md

### Outputs
- Artifact: src/tools/search-requirements.ts
- Verification: `pnpm test:run tests/tools/search-requirements.test.ts`

### Done When
- Search accepts the new filter, preserves existing behavior, and targeted tests pass.
```

### Serial Refactor

```markdown
## HarnessTask: HT-REF-1 - Split adapter factory responsibilities

### Control
- type: code:refactor
- stage: implementation
- agent_role: implementer
- scheduler: serial
- isolation_key: global
- dependencies: [HT-COVERAGE-1]
- required_gates: [stories_approved, coverage_passed, plan_approved]
- review_level: strict
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2

### Inputs
- Requirement: US-REF-1
- Context: docs/plans/adapter-refactor/implementation-plan.md

### Outputs
- Artifact: src/adapters/
- Verification: `pnpm test:run && pnpm typecheck && pnpm build`

### Done When
- Public adapter behavior is unchanged, contracts remain typed, and full verification gates pass.
```

## Failure Handling

- If a required gate is missing or stale, keep the task blocked and return to the earliest invalidated phase.
- If execution requires a mutation outside the approved boundary, stop and revise the plan before writing.
- If a `parallel` task conflicts with another task, stop both tasks and reclassify the boundary as `isolated`.
- If an `isolated` task conflicts within the same key, serialize that key and continue other keys.
- If a `serial` task fails, stop the harness and resolve the failure before scheduling more work.
- If verification is unavailable, record the reason and ask for confirmation before handoff.
