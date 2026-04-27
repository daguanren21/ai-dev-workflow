# Agent Harness Workflow

> Controlled lifecycle for AI coding agents: intake, context load, normalization, harness plan, coverage validation, gated execution, verification, review, and handoff.

---

## End-to-End Flow

```text
1. Intake
     |
     v
2. Context Load -> requirements.md
     |
     v
3. Normalize -> user-stories.md
     |
     v
4. Harness Plan -> implementation-plan.md
     |
     v
5. Coverage Validation -> validation-report.md
     |
     v
+--------------------------+
| 6. Execute Behind Gates  |
|      |                   |
|      v                   |
| 7. Verify                |
|      |                   |
|      v                   |
| 8. Review                |
+--------------------------+
     |
     v
9. Handoff -> handoff.md
```

## Artifact Contract

```text
docs/plans/{feature-name}/
├── requirements.md
├── user-stories.md
├── implementation-plan.md
├── validation-report.md
├── execution-log.md
└── handoff.md
```

Optional UI artifacts:

```text
docs/plans/{feature-name}/ui-references/
├── figma-notes.md
└── screenshots/
```

## Phase Table

| Phase | Name | Required | Harness Output | Pause |
|:---:|------|:---:|------|------|
| 1 | Intake | Yes | Source inventory and `docs/plans/{feature-name}/` path | Only if the request has no actionable source or goal |
| 2 | Context Load | Yes | `requirements.md` | Conditional when required context is missing |
| 3 | Normalize | Yes | `user-stories.md` | Yes, developer confirms stories and UI needs |
| 4 | Harness Plan | Yes | `implementation-plan.md` | Conditional when scope or risk changes |
| 5 | Coverage Validation | Yes | `validation-report.md` | Yes when coverage is incomplete or risky |
| 6 | Execute Behind Gates | Yes | Changed artifacts and `execution-log.md` | On blocker, conflict, or unclear instruction |
| 7 | Verify | Yes | Verification evidence | On failed or unavailable gate |
| 8 | Review | Yes | Review notes and risk list | On blocking finding |
| 9 | Handoff | Yes | `handoff.md` or final response | No |

## Default Execution Policy

When the dev-workflow harness is active, planning is the default. The developer does not need to repeat "generate user stories and an implementation plan before coding."

Default behavior:

- Normalize raw context into user stories.
- Pause for developer confirmation after user stories.
- Generate an implementation plan.
- Pause for developer confirmation before implementation.
- Start coding only after confirmation, or when the developer explicitly bypasses the planning gate.

Explicit bypass examples:

```text
Use dev-workflow harness, but skip the planning gate and directly implement this small docs change.
```

```text
直接开写，不需要等我确认计划。
```

## Blueprint Model

The harness is a hybrid Blueprint: deterministic nodes handle repeatable control flow, while agent-loop nodes handle reasoning and repair.

| Node Type | Examples | Rule |
|-----------|----------|------|
| Deterministic | install, lint, typecheck, build, tests, diff checks | Always run when declared; do not leave to agent memory |
| Agent Loop | understand, plan, implement, repair, review | Agent may reason and iterate within the declared gate |

Deterministic nodes save context and reduce preventable errors. Agent-loop nodes are useful only inside explicit inputs, outputs, isolation keys, and verification gates.

## Phase Details

### 1. Intake

Accepted inputs:

- Requirement management ID, such as ONES task ID, Jira issue key, or GitHub issue number.
- Issue, document, Figma, or screenshot link.
- Natural language requirement from the developer.

The agent identifies the requested outcome, source type, expected deliverable, and a stable `{feature-name}` for artifact paths.

### 2. Context Load

The harness may load context through:

- Bundled Requirements MCP Server for ONES.
- External GitHub or Jira MCP servers for issue context.
- Figma MCP server for design context.
- Local repository files.
- User-provided text.

The output is raw context in `requirements.md`. The agent must keep raw context distinct from interpretation so later coverage validation can trace back to the original input.

#### Context Quality

Record source quality before normalization:

| Status | Meaning | Allowed Next Step |
|--------|---------|-------------------|
| `ok` | Source content was loaded and is usable | Normalize |
| `user_supplied` | Developer pasted or described the content | Normalize with source note |
| `blocked_by_verification` | Source returned a captcha or verification page | Ask for paste, screenshot, export, or summary |
| `login_required` | Source requires auth the agent does not have | Ask for accessible context |
| `unavailable` | Source cannot be fetched | Ask for fallback or stop |

If source status is not `ok` or `user_supplied`, do not infer content from the URL, title, or surrounding metadata. Ask for fallback context and record the fallback used.

### 3. Normalize

The agent converts raw context into user stories:

```markdown
### US-1: <story title>
**As a** <role>,
**I want** <goal>,
**So that** <value>.

#### Acceptance Criteria
- [ ] Given <precondition>, When <action>, Then <expected result>

#### Dependencies
- UI: Figma link, screenshot path, text description, or "No UI dependency"
- Backend: API or service dependency
- Data: schema, fixture, migration, or "No data dependency"
- External: third-party service, MCP source, or "No external dependency"
```

The harness pauses after normalization so the developer can confirm scope and UI references.

### 4. Harness Plan

The plan turns user stories into a task graph. Every task records:

- Task type.
- Agent role.
- Scheduler mode.
- Isolation key.
- Dependencies.
- Inputs.
- Outputs.
- Verification gate.
- Review level.

Use `task-types.md` for valid task types and scheduling rules. Use the templates directory for task declarations.

The harness pauses after the plan. This pause is mandatory by default because it is the final point where the developer can adjust scope, task boundaries, verification gates, and risk before code changes begin.

### 5. Coverage Validation

Build a traceability matrix:

```markdown
| Requirement | User Story | Harness Task | Verification Gate | Status |
|-------------|------------|--------------|-------------------|--------|
| R1 | US-1 | HT-1 | `pnpm test -- auth` | Covered |
```

Check each requirement for:

- Story coverage.
- Acceptance criteria completeness.
- Implementation task coverage.
- Edge case and error path coverage.
- Verification gate coverage.

Coverage validation should include three sensor classes:

| Sensor Class | Checks | Examples |
|--------------|--------|----------|
| Maintainability | internal quality | lint, typecheck, duplication, complexity, docs consistency |
| Architecture | structural boundaries | dependency direction, module ownership, public contracts |
| Behavior | user-visible correctness | unit tests, integration tests, UI automation, acceptance checks |

Coverage outcomes:

| Result | Condition | Next Action |
|--------|-----------|-------------|
| Pass | All requirements covered and no high-risk gaps | Execute |
| Conditional | Low-risk gap is documented and accepted | Execute after developer confirmation |
| Fail | Core requirement missing or high-risk ambiguity remains | Revise stories or plan |

### 6. Execute Behind Gates

Execution follows the scheduler:

- `parallel`: independent tasks may run concurrently up to `parallel_limit`.
- `isolated`: tasks sharing an isolation key run serially; different keys may run in parallel.
- `serial`: global lock; one task at a time.

Execution rules:

- Prefer subagent-driven execution when available.
- Use inline execution with checkpoints when subagents are unavailable or not requested.
- Do not revert unrelated user changes.
- Record meaningful notes, blockers, and verification results in `execution-log.md`.

### 7. Verify

Verification comes from the plan. Common gates:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:run
```

For documentation-only changes, verification may be targeted content review plus repository lint. For frontend behavior, use browser automation where available.

The agent must read command output and report actual evidence. A gate that cannot run must be listed as a skipped check with the reason.

#### Backpressure

Good backpressure is fast, quiet on success, precise on failure.

- Run targeted gates before full gates when the plan identifies an owner area.
- On success, record only the gate name and pass status unless full output is requested.
- On failure, expose the command, key error, likely owner task, and repair instruction.
- Default retry limit is 2 repair attempts before human escalation.
- Avoid dumping large passing logs into the active context; store longer evidence in `execution-log.md` when needed.

### 8. Review

Review checks:

- Requirement coverage.
- User-visible behavior.
- Changed file scope.
- Error handling and edge cases.
- Test or verification adequacy.
- Residual risk.

Review level:

- `light`: documentation, research, and low-risk artifacts.
- `standard`: fixes, tests, and bounded behavior changes.
- `strict`: new features, refactors, shared contracts, and high-impact changes.

### 9. Handoff

The handoff contains:

- Summary of changed artifacts.
- Verification commands and results.
- Requirement coverage status.
- Residual risks or skipped checks.
- Concrete follow-up actions, if any.

Use `handoff.md` when the project needs a persistent artifact. Otherwise include the same facts in the final agent response.

## MCP Boundary

MCP is a context input layer. It may fetch requirements, issue details, related work, test cases, and design context. The harness uses that context to create artifacts and make decisions.

MCP is not the implementation target unless the requested feature explicitly asks for MCP server changes. When MCP server changes are out of scope, do not edit adapters, auth, config loading, tool definitions, package exports, or runtime behavior.

## Recovery Rules

### Missing Context

Pause and ask for the source or permission to proceed from the current user-provided description. Record the missing context in `requirements.md` or `execution-log.md`.

### Protected Source

If a URL, MCP source, or document returns verification, login, or access-control content, mark `source_status` as `blocked_by_verification`, `login_required`, or `unavailable`. Request pasted text, screenshot, exported Markdown, exported PDF, or a concise user summary before normalization.

### Missing UI Reference

If visual fidelity matters, pause before implementation. If the developer confirms no visual reference is available, record the chosen text-based design assumptions.

### Coverage Validation Failure

Do not execute. Revise user stories, plan tasks, or verification gates until every core requirement is mapped.

### Verification Failure

Capture the failing command and relevant output. Fix the task that owns the failure, then rerun the same gate before moving forward. Stop after the declared retry limit and ask for human direction.

### Parallel Conflict

Stop the affected task group. Serialize work within the conflicting isolation key and document the conflict in `execution-log.md`.

## Project Type Detection

Use project files to choose verification gates and task boundaries:

```yaml
project_type: frontend | backend | fullstack | library | documentation

detection:
  frontend: src/components, src/views, React, Vue, Svelte, Next.js, or browser tests
  backend: src/api, src/services, server runtime, database access, or API tests
  fullstack: both frontend and backend indicators
  library: package exports, build artifacts, public types, or reusable modules
  documentation: markdown-only changes with no runtime behavior change
```

For this repository, the default project type is `library` with a bundled `documentation` skill artifact.
