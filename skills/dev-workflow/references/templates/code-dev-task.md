# Code Development Harness Task Template

## HarnessTask: HT-DEV-1 - Implement Feature Module

### Control
- type: code:dev
- agent_role: implementer
- scheduler: isolated
- isolation_key: src/<module>/
- dependencies: []
- review_level: strict

### Inputs
- Requirement: US-<number>
- Context: docs/plans/<feature-name>/user-stories.md
- Plan: docs/plans/<feature-name>/implementation-plan.md

### Steps
- Write or update the failing test that captures the acceptance criterion.
- Run the targeted test and record the failure.
- Implement the smallest production change inside the isolation key.
- Run the targeted test again and record the pass.
- Run the task verification gate declared below.

### Outputs
- Artifact: src/<module>/
- Test Artifact: tests/<module>/
- Execution Notes: docs/plans/<feature-name>/execution-log.md

### Verification
- Targeted: `pnpm test:run tests/<module>`
- Type safety: `pnpm typecheck`

### Done When
- The user story acceptance criteria are covered by tests or explicit verification.
- The implementation stays within the declared isolation key unless the plan is revised.
- The targeted verification gate passes.
