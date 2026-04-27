# Code Fix Harness Task Template

## HarnessTask: HT-FIX-1 - Fix Defect

### Control
- type: code:fix
- agent_role: implementer
- scheduler: isolated
- isolation_key: <file-or-module-path>
- dependencies: []
- review_level: standard

### Inputs
- Requirement: BUG-<number> or US-<number>
- Failure Evidence: docs/plans/<feature-name>/requirements.md
- Context: docs/plans/<feature-name>/execution-log.md

### Steps
- Reproduce or describe the failure from evidence.
- Add a regression test that fails for the defect.
- Make the smallest fix inside the isolation key.
- Rerun the regression test and record the result.
- Run any broader gate affected by the fix.

### Outputs
- Artifact: <file-or-module-path>
- Regression Test: tests/<affected-area>/
- Execution Notes: docs/plans/<feature-name>/execution-log.md

### Verification
- Regression: `pnpm test:run tests/<affected-area>`
- Quality: `pnpm lint`

### Done When
- The original failure is covered by a regression test or explicit reproduction check.
- The fix does not change unrelated behavior.
- The regression gate passes.
