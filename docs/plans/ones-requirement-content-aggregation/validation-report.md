# Coverage Validation Report

## Traceability Matrix

| Requirement | User Story | Harness Task | Verification Gate | Status |
|-------------|------------|--------------|-------------------|--------|
| Aggregate related wiki and task detail content | US-1 | Task 1, Task 2, Task 3 | `pnpm test:run tests/adapters/ones.test.ts` | Covered |
| Extract wiki links from anchor tags | US-1 | Task 1, Task 3 | anchor-link regression test | Covered |
| Extract wiki links from plain pasted URLs | US-1 | Task 1, Task 3 | plain-url regression test | Covered |
| Deduplicate wiki pages from relation and description | US-1 | Task 1, Task 3 | duplicate wiki regression test | Covered |
| Fallback to task detail when no wiki content exists | US-1 | Task 1, Task 3 | detail fallback regression test | Covered |
| Preserve existing requirement output behavior | US-2 | Task 1, Task 4 | existing adapter tests and tool tests | Covered |

## Sensor Coverage

| Sensor Class | Planned Gate | Status |
|--------------|--------------|--------|
| Maintainability | `pnpm lint` | Planned |
| Architecture | adapter-only diff review | Planned |
| Behavior | targeted adapter tests and full `pnpm test:run` | Planned |

## Risk Items

| Risk | Mitigation |
|------|------------|
| ONES wiki URL formats may vary beyond `/page/<uuid>` and `page=<uuid>` | Keep extraction helper focused and covered; add future patterns when observed |
| HTML fallback decoding is intentionally lightweight | Prefer `descriptionText` when present; only strip HTML when plain text is unavailable |
| Wiki title is unknown when link comes only from description | Use `Wiki <uuid>` as fallback title |

## Decision

Pass for implementation after developer confirmation.
