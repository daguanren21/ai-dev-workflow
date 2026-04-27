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

### Missing UI Reference

If visual fidelity matters, pause before implementation. If the developer confirms no visual reference is available, record the chosen text-based design assumptions.

### Coverage Validation Failure

Do not execute. Revise user stories, plan tasks, or verification gates until every core requirement is mapped.

### Verification Failure

Capture the failing command and relevant output. Fix the task that owns the failure, then rerun the same gate before moving forward.

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
