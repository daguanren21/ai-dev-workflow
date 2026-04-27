# Harness Task Types & Scheduler

Task types are scheduling primitives for the agent harness. They define how work may run, what isolation is required, and what review level applies before handoff.

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
- agent_role: implementer | reviewer | researcher | tester | documenter
- scheduler: parallel | isolated | serial
- isolation_key: <module-or-file-path>
- dependencies: []
- review_level: light | standard | strict

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
| `agent_role` | Yes | Primary role responsible for the task |
| `scheduler` | Yes | Execution mode: `parallel`, `isolated`, or `serial` |
| `isolation_key` | Yes for `isolated`, optional for others | Module, file, data source, or shared contract boundary |
| `dependencies` | Yes | Task IDs that must finish first; use an empty list when none exist |
| `review_level` | Yes | `light`, `standard`, or `strict` |

## Review Levels

| Level | Applies To | Required Review |
|-------|------------|-----------------|
| `light` | Documentation, research, low-risk metadata | Check accuracy, links, scope, and consistency |
| `standard` | Fixes, tests, data work, bounded behavior | Check correctness, regression risk, and verification evidence |
| `strict` | New features, refactors, shared contracts | Check requirements coverage, architecture, edge cases, and full verification gates |

## Scheduling Examples

### Independent Documentation

```markdown
## HarnessTask: HT-DOC-1 - Update README quick start

### Control
- type: doc:write
- agent_role: documenter
- scheduler: parallel
- isolation_key: docs/readme
- dependencies: []
- review_level: light

### Inputs
- Requirement: US-DOC-1
- Context: docs/plans/harness/requirements.md

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
- agent_role: implementer
- scheduler: isolated
- isolation_key: src/tools/search-requirements.ts
- dependencies: [HT-PLAN-1]
- review_level: strict

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
- agent_role: implementer
- scheduler: serial
- isolation_key: global
- dependencies: [HT-COVERAGE-1]
- review_level: strict

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

- If a `parallel` task conflicts with another task, stop both tasks and reclassify the boundary as `isolated`.
- If an `isolated` task conflicts within the same key, serialize that key and continue other keys.
- If a `serial` task fails, stop the harness and resolve the failure before scheduling more work.
- If verification is unavailable, record the reason and ask for confirmation before handoff.
