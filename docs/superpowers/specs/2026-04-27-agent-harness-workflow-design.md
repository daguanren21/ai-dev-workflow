# Agent Harness Workflow Design

## Goal

Rewrite the dev workflow skill into an AI agent harness workflow while keeping the MCP server implementation unchanged.

The resulting skill should guide an agent through a controlled harness lifecycle: intake, context loading, requirement normalization, task graph planning, gated execution, verification, review, and artifact handoff.

## Scope

In scope:

- Rewrite `skills/dev-workflow/SKILL.md` as the primary agent harness entry point.
- Rewrite `skills/dev-workflow/references/workflow.md` around the harness lifecycle.
- Update `skills/dev-workflow/references/task-types.md` so task types map to harness scheduler semantics.
- Update task templates under `skills/dev-workflow/references/templates/` only where their current wording conflicts with harness execution.
- Update `README.md` and `README.zh-CN.md` so public documentation matches the new harness workflow.

Out of scope:

- No changes to `src/`.
- No changes to `tests/` unless documentation tooling later requires it.
- No changes to the Requirements MCP tool APIs, adapters, auth, config loader, or package exports.
- No runtime orchestration engine is added in this change. The harness is a skill-level workflow contract for AI coding agents.

## Current State

The repository currently ships two related deliverables:

- `src/`: a Requirements MCP Server with an ONES adapter.
- `skills/dev-workflow/`: a self-contained development workflow skill.

The current skill describes a requirement-driven sequence:

`Requirements -> User Stories -> UI Resources -> Skill Matching -> Implementation Plan -> Code -> Verification`

The reference workflow also describes a 10-step process with technical design, skill matching, requirement validation, parallel implementation, review, and quality checks.

This change keeps the requirement-driven foundation but reframes the skill as an agent harness. The harness defines the control plane around the agent: what inputs it may read, what artifacts it must produce, when it must pause, how work is scheduled, and how verification gates are enforced.

## Proposed Architecture

### Harness Entry Point

`skills/dev-workflow/SKILL.md` becomes the concise operating manual for the harness.

It should define:

- When the skill applies.
- The required startup announcement.
- The harness lifecycle.
- MCP usage boundaries.
- Required artifacts.
- Pause gates.
- Execution constraints.
- Quality gates.
- Common failure modes.

### Harness Lifecycle

The lifecycle should be:

1. Intake
   - Accept a requirement ID, issue link, document link, or natural language request.
   - Identify source type and requested outcome.

2. Context Load
   - Use MCP where available for requirements, issues, or design context.
   - Use direct user-provided text when no MCP source exists.
   - Save raw context to `docs/plans/{feature-name}/requirements.md`.

3. Normalize
   - Convert raw context into user stories and acceptance criteria.
   - Identify UI dependencies, backend dependencies, data dependencies, and external integrations.
   - Save to `user-stories.md`.
   - Pause for developer confirmation.

4. Harness Plan
   - Build a task graph from the normalized requirements.
   - Record task type, owner role, isolation key, dependencies, inputs, outputs, and verification gate.
   - Save to `implementation-plan.md`.

5. Coverage Validation
   - Produce a traceability matrix from requirement to user story to plan task to verification gate.
   - Save to `validation-report.md`.
   - Pause before implementation if coverage is incomplete or risky.

6. Execute
   - Use subagent-driven or inline execution according to the plan.
   - Preserve isolation boundaries.
   - Never run global refactors in parallel with unrelated code changes.

7. Verify
   - Run the repo-specific quality gates.
   - For this repository, documentation-only changes require at least targeted content review and `pnpm lint` if code or markdown linting is later added.
   - For code changes in consuming projects, run lint, typecheck, build, and tests as applicable.

8. Review
   - Review behavior, requirements coverage, artifacts, and residual risks.
   - For substantial code changes, use code review before completion.

9. Handoff
   - Summarize changed artifacts, verification results, and next steps.

### MCP Usage Boundary

MCP is an input and context layer for the harness, not the implementation target in this change.

Allowed MCP usage in the workflow:

- Fetch requirement details from the bundled Requirements MCP Server.
- Fetch GitHub or Jira issues through external MCP servers.
- Fetch Figma design context through a Figma MCP server.
- Use MCP-derived context to populate harness artifacts.

Disallowed for this change:

- Editing `src/` MCP server code.
- Adding new MCP tools.
- Changing adapter behavior.
- Changing package runtime exports.

### Artifact Contract

The harness should standardize this output tree:

```text
docs/plans/{feature-name}/
├── requirements.md
├── user-stories.md
├── implementation-plan.md
├── validation-report.md
├── execution-log.md
└── handoff.md
```

Optional UI artifacts remain under:

```text
docs/plans/{feature-name}/ui-references/
├── figma-notes.md
└── screenshots/
```

### Scheduler Semantics

`task-types.md` should keep the existing task categories but describe them as harness scheduling primitives:

- `parallel`: independent tasks, bounded by `parallel_limit`.
- `isolated`: tasks may run in parallel across isolation keys but serially within the same key.
- `serial`: tasks require a global lock.

Task declarations should include:

- Task type.
- Agent role.
- Isolation key.
- Dependencies.
- Inputs.
- Outputs.
- Verification gate.
- Review level.

### README Updates

Both README files should describe the deliverable as:

- Requirements MCP Server.
- Agent Harness Workflow Skill.

The quick-start section should still install the same skill path, but the explanation should say the skill drives harness-governed AI development rather than a generic parallel workflow.

## Error Handling And Recovery

The workflow must make recovery explicit:

- Missing requirement context: pause and ask for source or use the user-provided description.
- Missing UI reference for UI work: pause before implementation.
- Incomplete coverage validation: revise stories or plan before execution.
- Failed verification: capture failure, fix the relevant task, rerun the gate.
- Conflicting parallel work: stop the affected task group and serialize the conflict boundary.

## Testing And Verification

Because this change is expected to be documentation and skill-content only:

- Review changed markdown for internal consistency.
- Search for stale references to the old 7-phase/10-step workflow where they conflict with the harness model.
- Run `pnpm lint` to ensure no code style regressions from incidental changes.
- Run `pnpm build` only if source files or package metadata are changed.

## Risks

- The word "harness" can be ambiguous. This spec fixes the meaning as an AI agent workflow control plane, not Harness CI/CD and not a test harness.
- Over-preserving old workflow terms may make the skill hard for agents to follow. The rewrite should prefer one clear lifecycle.
- Over-editing templates may create unnecessary churn. Template updates should be limited to alignment with the new task declaration contract.
