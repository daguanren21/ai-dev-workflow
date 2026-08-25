# ai-dev-requirements

## 0.4.0

### Minor Changes

- [`f00e2b6`](https://github.com/daguanren21/ai-dev-workflow/commit/f00e2b6809a2a40026553a16799ce36c735ecbbb) Thanks [@daguanren21](https://github.com/daguanren21)! - Add ONES Wiki read, search, path resolution, and confirmed create/update support through the product collaboration protocol. Separate ONES authentication, task queries, content handling, planning, issue reads, writes, and testcase reads into focused modules, and strengthen environment parsing, external-content decoding, and remote-image address validation.

## 0.3.1

### Patch Changes

- [`4ebbcae`](https://github.com/daguanren21/ai-dev-workflow/commit/4ebbcae2f32b271d0d9b0f241c12c88308e06c49) Thanks [@daguanren21](https://github.com/daguanren21)! - Classify ONES child requirements with `detailType=5` as requirements in `get_work_item`.

## 0.3.0

### Minor Changes

- [`0de2cab`](https://github.com/daguanren21/ai-dev-workflow/commit/0de2cab728014a3daaf7072e4368457f73e9d63d) Thanks [@daguanren21](https://github.com/daguanren21)! - Add safe ONES pending-task inspection and requirement-decomposition workflows, including approval-gated task creation and scheduling details for dashboard consumers.

## 0.2.1

### Patch Changes

- [`96e7cfa`](https://github.com/daguanren21/ai-dev-workflow/commit/96e7cfa156a8ded584cb22abbe76e4aa9c4f2729) Thanks [@daguanren21](https://github.com/daguanren21)! - Refresh inline ONES requirement images through signed attachment URLs and support display-ID lookups without optional related-activity failures blocking the result.

## 0.2.0

### Minor Changes

- [`dea6a6b`](https://github.com/daguanren21/ai-dev-workflow/commit/dea6a6b841bff84203948a56726d91115b524f80) Thanks [@daguanren21](https://github.com/daguanren21)! - Migrate the requirements server to MCP SDK v2, replace `get_requirement` with the type-aware `get_work_item` tool, route ONES work items through `issueType` and `subIssueType`, and add a structured `get_grilling_brief` contract for the grill-me workflow.
