# Test Harness Task Template

## HarnessTask: HT-TEST-1 - Verify Behavior

### Control
- type: test
- agent_role: tester
- scheduler: parallel
- isolation_key: tests/<module>/
- dependencies: []
- review_level: standard
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2

### Inputs
- Requirement: US-<number>
- Implementation Artifact: <source-path>
- Acceptance Criteria: docs/plans/<feature-name>/user-stories.md

### Steps
- Identify the behavior, edge case, or regression to verify.
- Add the smallest test that proves the behavior.
- Run the test and confirm it fails when the implementation is absent or broken when practical.
- Restore or keep the implementation and confirm the test passes.
- Run the broader affected test gate.
- Keep passing gate output concise; record only the gate name and pass status.
- On failure, record the command, key error, likely owner, and repair action.
- Stop after two repair attempts and ask for human direction.

### Outputs
- Artifact: tests/<module>/
- Execution Notes: docs/plans/<feature-name>/execution-log.md

### Verification
- Targeted: `pnpm test:run tests/<module>`
- Broader Gate: `pnpm test:run`

### Done When
- The test maps to an acceptance criterion or documented regression.
- The targeted gate passes.
- Standard review has no blocking findings.
