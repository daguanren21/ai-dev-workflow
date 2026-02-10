---
"requirements-mcp-server": minor
---

Remove bundled Jira and GitHub adapters; use official MCP servers instead

- **BREAKING:** Removed `JiraAdapter` and `GitHubAdapter`. Users should use
  [github/github-mcp-server](https://github.com/github/github-mcp-server) and
  [Atlassian Rovo MCP Server](https://www.atlassian.com/blog/announcements/remote-mcp-server) directly.
- `SourceType` narrowed to `'ones'`. `BaseAdapter` architecture preserved for future extensibility.
- Added self-contained **dev-workflow** skill (`skills/dev-workflow/`) with full workflow definition,
  task types, scheduling strategies, and service-layer transform references.
- Added changeset-based versioning and changelog workflow.
