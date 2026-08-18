# Requirement Coverage Validation

> Validate the current implementation plan against approved user stories before requesting plan approval or starting implementation.

## Gate Position

```text
Approved User Stories
        |
        v
Implementation Plan
        |
        v
Coverage Validation
        |
        +---- Conditional or Fail ----> revise and revalidate
        |
        v
Plan Approval
        |
        v
Implementation
```

Coverage validation always runs. A passing report unlocks the plan-approval prompt; it does not itself authorize implementation.

## Inputs

| Input | Requirement |
|-------|-------------|
| Source context | Usable source or sanitized source summary with decisions and assumptions |
| User stories | Current Gate 1-approved `user-stories.md` revision |
| Harness plan | Current `implementation-plan.md` revision |
| Repository evidence | Relevant architecture, tests, conventions, and available deterministic checks |

If the user stories are not approved or the plan is stale, stop before validation.

## Step 1: Build The Traceability Matrix

Map each requirement to a story, harness task, and verification gate:

```markdown
| Requirement | User Story | Harness Task | Verification Gate | Status |
|-------------|------------|--------------|-------------------|--------|
| R1 | US-1 | HT-DEV-1 | Targeted test and typecheck | Covered |
| R2 | US-2 | HT-DEV-2, HT-TEST-1 | Integration test | Covered |
| R3 | None | None | None | Missing |
```

Use anonymized requirement labels in persisted artifacts. Do not reproduce private source text merely to populate the matrix.

## Step 2: Evaluate Every Requirement

Check:

| Check | Passing Condition |
|-------|-------------------|
| Story coverage | Every core requirement maps to at least one approved user story |
| Acceptance criteria | Behavior is observable and includes relevant failure or boundary cases |
| Task coverage | Every acceptance criterion has an implementation, documentation, data, research, or verification owner |
| Mutation boundary | Each write task declares the files, modules, or external systems it may change |
| Dependency order | Every prerequisite appears before the task that depends on it |
| Verification coverage | Every user-visible behavior and critical contract has a deterministic check or explicit review gate |
| Review coverage | Risk determines an appropriate light, standard, or strict review level |
| Privacy and safety | No plan artifact requires credentials, full private source bodies, or undeclared mutations |

## Step 3: Run Coverage Sensors

Use all applicable sensor classes:

| Sensor Class | Checks | Examples |
|--------------|--------|----------|
| Maintainability | Internal quality and supportability | lint, typecheck, duplication, complexity, documentation consistency |
| Architecture | Structural and ownership boundaries | dependency direction, package exports, module ownership, public contracts |
| Behavior | User-visible correctness | unit tests, integration tests, browser checks, acceptance checks |
| Safety | Authorization and data handling | mutation confirmation, secrets, private-source retention, destructive actions |
| Change resilience | Requirement and compatibility drift | version invalidation, migration, backward compatibility, stale task decomposition |

When an existing task decomposition materially differs from the current requirement, classify it as a blocking mismatch and notify the developer. Do not silently implement the stale tasks.

## Step 4: Classify The Result

| Result | Condition | Next Action |
|--------|-----------|-------------|
| `Pass` | Every core requirement is covered and no blocking risk remains | Present the plan and report summary at Gate 2 |
| `Conditional` | Only low-risk, explicitly described exceptions remain | Pause for a developer decision; update artifacts and revalidate |
| `Fail` | A core requirement, decision, task, mutation boundary, or verification gate is missing | Return to the earliest affected phase |

Rules:

- Coverage percentage is informative, not authoritative.
- A missing core requirement always fails.
- A high-risk ambiguity always fails and returns to `/grill-me`.
- An accepted low-risk exception must be recorded in the revised plan and report before revalidation.
- Gate 2 may be requested only after the current report is `Pass`.

## Validation Report Contract

Write `docs/plans/{feature-name}/validation-report.md`:

```markdown
# Coverage Validation Report

## Artifact Revisions

- Stories revision: <revision>
- Plan revision: <revision>
- Result: Pass | Conditional | Fail

## Traceability Matrix

| Requirement | User Story | Harness Task | Verification Gate | Status |
|-------------|------------|--------------|-------------------|--------|
| R1 | US-1 | HT-DEV-1 | <gate> | Covered |

## Sensor Results

| Sensor Class | Status | Evidence or Gap |
|--------------|--------|-----------------|
| Maintainability | Pass | <evidence> |
| Architecture | Pass | <evidence> |
| Behavior | Pass | <evidence> |
| Safety | Pass | <evidence> |
| Change resilience | Pass | <evidence> |

## Exceptions And Risks

- <accepted exception or none>

## Gate Decision

- Gate 2 eligible: Yes | No
- Required next action: <action or none>
```

The report references artifact revisions so a changed story or plan makes the result visibly stale.

## Common Omissions

| Area | Validation Question |
|------|---------------------|
| Authorization | Who may perform the action, and where is the check verified? |
| Input validation | Are invalid, empty, oversized, and malformed inputs covered? |
| Concurrency | Can retries or concurrent writes create duplication, races, or stale state? |
| Performance | Is a measurable performance requirement mapped to an appropriate check? |
| Compatibility | Does the plan preserve supported callers, formats, and runtime versions? |
| Internationalization | Are locale behavior and fallback requirements explicit? |
| Accessibility | Are keyboard, semantic, contrast, and assistive-technology needs covered? |
| Requirement change | Do existing tasks and tests still match the current approved stories? |
| Sensitive data | Could artifacts, fixtures, logs, or examples expose private source content? |

## Invalidation

The report becomes stale when any approved story, plan task, mutation boundary, dependency, verification gate, or accepted exception changes. Rerun validation before requesting or reusing Gate 2 approval.
