# User Stories

## US-1: Aggregate ONES requirement content from related wiki and task detail

**As a** developer using the Requirements MCP Server,
**I want** `get_requirement` to combine ONES related wiki content with task detail content,
**So that** the agent receives the complete requirement context before planning or implementation.

### Acceptance Criteria

- [ ] Given a task has `relatedWikiPages`, When `get_requirement` is called, Then wiki content is fetched and included in the formatted requirement description.
- [ ] Given a task detail description contains a wiki link in an `<a href="...">` tag, When `get_requirement` is called, Then the wiki page UUID is extracted, fetched, and included.
- [ ] Given a task detail description contains a plain pasted wiki URL rather than an anchor tag, When `get_requirement` is called, Then the wiki page UUID is extracted, fetched, and included.
- [ ] Given the same wiki page appears in both `relatedWikiPages` and task detail description, When `get_requirement` is called, Then the wiki content appears only once.
- [ ] Given no wiki page can be found, When `get_requirement` is called, Then `descriptionText` or `description` is included as the requirement detail fallback.
- [ ] Given wiki fetching fails or returns empty content, When detail description exists, Then the formatted requirement still includes the detail fallback rather than losing requirement content.

### Dependencies

- UI: No UI dependency.
- Backend: `src/adapters/ones.ts`.
- Data: `tests/fixtures/ones-response.json` or inline test fixtures.
- External: ONES GraphQL task detail shape and wiki REST content endpoint.

## US-2: Preserve existing `get_requirement` behavior

**As a** maintainer,
**I want** existing related tasks, parent task, status, priority, and requirement formatting behavior to remain stable,
**So that** current MCP users do not lose context or see breaking output changes.

### Acceptance Criteria

- [ ] Given existing ONES fixtures, When adapter tests run, Then existing assertions for title, status, priority, type, assignee, and related tasks still pass.
- [ ] Given requirements are fetched by numeric task number, When `getRequirement` resolves the number to UUID, Then the new aggregation still works after resolution.
- [ ] Given the task has no detail description and no wiki content, When `getRequirement` runs, Then existing basic task information remains in the description.

### Dependencies

- UI: No UI dependency.
- Backend: `src/adapters/ones.ts`.
- Data: existing adapter tests.
- External: none beyond existing mocked fetch flow.
