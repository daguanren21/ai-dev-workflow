# Code Fix Harness Task Template

## HarnessTask: HT-FIX-1 - Fix Defect

### Control
- type: code:fix
- stage: implementation
- agent_role: implementer
- scheduler: isolated
- isolation_key: <file-or-module-path>
- dependencies: []
- required_gates: [stories_approved, coverage_passed, plan_approved]
- review_level: standard
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2

### Inputs
- Requirement: BUG-<number> or US-<number>
- Failure Evidence: sanitized issue context or reproducible local evidence
- Plan: docs/plans/<feature-name>/implementation-plan.md

### Steps
- Confirm every required gate applies to the current story, plan, and validation revisions.
- Reproduce or describe the failure from evidence.
- Add a regression test that fails for the defect.
- Make the smallest fix inside the isolation key.
- Rerun the regression test and record the result.
- Run any broader gate affected by the fix.
- Keep passing gate output concise; record only the gate name and pass status.
- On failure, record the command, key error, likely owner, and repair action.
- Stop after two repair attempts and ask for human direction.

### Outputs
- Artifact: <file-or-module-path>
- Regression Test: tests/<affected-area>/
- Execution Notes: docs/plans/<feature-name>/execution-log.md

### Verification
- Regression: `pnpm test:run tests/<affected-area>`
- Quality: `pnpm lint`

### Done When
- The fix stayed inside the approved mutation boundary and used current gate approvals.
- The original failure is covered by a regression test or explicit reproduction check.
- The fix does not change unrelated behavior.
- The regression gate passes.
