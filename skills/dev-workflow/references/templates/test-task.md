# Test Harness Task Template

## HarnessTask: HT-TEST-1 - Verify Behavior

### Control
- type: test
- agent_role: tester
- scheduler: parallel
- isolation_key: tests/<module>/
- dependencies: []
- review_level: standard

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
