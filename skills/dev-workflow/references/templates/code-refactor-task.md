# Code Refactor Harness Task Template

## HarnessTask: HT-REF-1 - Refactor Shared Structure

### Control
- type: code:refactor
- agent_role: implementer
- scheduler: serial
- isolation_key: global
- dependencies: []
- review_level: strict
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2

### Inputs
- Requirement: US-<number> or REF-<number>
- Context: docs/plans/<feature-name>/implementation-plan.md
- Coverage: docs/plans/<feature-name>/validation-report.md

### Steps
- Identify the public contracts that must remain stable.
- Add or confirm tests around existing behavior before changing structure.
- Refactor one bounded area at a time.
- Run typecheck and targeted tests after each meaningful step.
- Run full verification gates before review.
- Keep passing gate output concise; record only the gate name and pass status.
- On failure, record the command, key error, likely owner, and repair action.
- Stop after two repair attempts and ask for human direction.

### Outputs
- Artifact: <refactored-paths>
- Compatibility Notes: docs/plans/<feature-name>/execution-log.md

### Verification
- Tests: `pnpm test:run`
- Types: `pnpm typecheck`
- Build: `pnpm build`

### Done When
- Public behavior and contracts are preserved or intentionally changed in the plan.
- Full verification gates pass.
- Strict review has no blocking findings.
