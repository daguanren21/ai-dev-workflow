# ONES Requirement Content Aggregation Requirements

## Source

User-provided requirement in conversation.

## Requirement

When fetching a requirement from ONES, requirement content can come from two places:

- Related wiki pages already exposed by `task.relatedWikiPages`.
- Task detail fields returned by the Task GraphQL query, especially `description`, `descriptionText`, and `desc_rich`.

The MCP `get_requirement` output should aggregate both sources instead of relying only on related wiki pages.

## Details

The ONES Task GraphQL endpoint can return task detail fields:

- `description`: rich HTML description.
- `descriptionText`: plain text description.
- `desc_rich`: alias of `description`.

The description may contain a wiki link in either format:

- HTML anchor: `<a href="https://1s.oristand.com/wiki/#/team/.../page/<wikiUuid>">点击查看</a>`
- Plain pasted URL: `https://1s.oristand.com/wiki/#/team/.../page/<wikiUuid>`

If the description contains a wiki link, the adapter should fetch that wiki content and prefer it as a requirement document source.

If no wiki link can be extracted from the description, the adapter should include the task detail description as the requirement content.

Related wiki pages should continue to be supported. Duplicate wiki pages from `relatedWikiPages` and description links should be deduplicated by wiki UUID.

## Non-Goals

- Do not change MCP tool names or public schemas.
- Do not change ONES authentication.
- Do not change unrelated issue detail behavior.
- Do not add a new MCP endpoint.

## Expected Output Behavior

`get_requirement` should still return a formatted `Requirement` whose `description` includes:

- Basic task info.
- Related tasks and parent task when present.
- Requirement document content from wiki links or related wiki pages.
- Task detail description as fallback when no wiki content is available.
