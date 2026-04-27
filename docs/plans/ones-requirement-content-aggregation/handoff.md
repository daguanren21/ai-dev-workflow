# Handoff

## Summary

- `get_requirement` now aggregates ONES requirement content from both related wiki pages and task detail fields.
- Wiki links embedded in task detail are supported as anchor links and plain pasted URLs.
- Wiki content is deduplicated by wiki UUID across `relatedWikiPages` and task detail links.
- If no wiki content is available, the requirement description falls back to task detail text.

## Changed Files

- `src/adapters/ones.ts`
- `tests/adapters/ones.test.ts`
- `docs/plans/ones-requirement-content-aggregation/*`

## Verification

- `pnpm test:run tests/adapters/ones.test.ts`: passed, 29 tests.
- `pnpm test:run tests/tools/get-requirement.test.ts tests/adapters/ones.test.ts`: passed, 34 tests.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- `pnpm test:run`: passed, 8 test files and 68 tests.

## Residual Risk

- Wiki URL extraction currently supports `/page/<uuid>` and `page=<uuid>` formats. Add more patterns if ONES introduces other wiki URL shapes.
- When a wiki link is only present in task detail, the title is rendered as `Wiki <uuid>` because the task detail link does not expose the wiki page title.
