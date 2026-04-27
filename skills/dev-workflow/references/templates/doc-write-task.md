# Documentation Harness Task Template

## HarnessTask: HT-DOC-1 - Write Documentation Artifact

### Control
- type: doc:write
- agent_role: documenter
- scheduler: parallel
- isolation_key: docs/<artifact-name>
- dependencies: []
- review_level: light
- feedback_mode: quiet_success | actionable_failure
- retry_limit: 2

### Inputs
- Requirement: US-DOC-<number>
- Source Context: docs/plans/<feature-name>/requirements.md
- Plan Context: docs/plans/<feature-name>/implementation-plan.md

### Steps
- Identify the audience and required artifact.
- Update the target document using the repository's existing style.
- Keep terminology consistent with related docs.
- Check links, paths, commands, and examples.
- Record any assumptions in execution notes.
- Keep passing gate output concise; record only the gate name and pass status.
- On failure, record the command, key error, likely owner, and repair action.
- Stop after two repair attempts and ask for human direction.

### Outputs
- Artifact: <documentation-path>
- Execution Notes: docs/plans/<feature-name>/execution-log.md

### Verification
- Content Review: confirm the document matches source context and contains no stale workflow names.
- Repository Gate: `pnpm lint`

### Done When
- The document accurately describes the implemented behavior or workflow.
- Cross-references point to existing files.
- Light review has no blocking findings.
