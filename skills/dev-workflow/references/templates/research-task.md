# Research Harness Task Template

## HarnessTask: HT-RES-1 - Research Decision Input

### Control
- type: research
- agent_role: researcher
- scheduler: parallel
- isolation_key: research/<topic>
- dependencies: []
- review_level: light

### Inputs
- Requirement: US-<number> or QUESTION-<number>
- Context Source: MCP source, repository file, official documentation, or user-provided text
- Decision Needed: <specific decision>

### Steps
- Identify primary sources and repository-local evidence.
- Gather only the context needed for the decision.
- Compare viable options with tradeoffs.
- State the recommendation and why it fits the current codebase.
- Record citations or file references.

### Outputs
- Artifact: docs/plans/<feature-name>/research-<topic>.md
- Decision: recommendation with tradeoffs

### Verification
- Source Check: every factual claim is backed by a cited source or local file reference.
- Scope Check: recommendation answers the declared decision.

### Done When
- The decision can be used directly by the harness plan.
- Unknowns and assumptions are explicit.
- Light review has no blocking findings.
