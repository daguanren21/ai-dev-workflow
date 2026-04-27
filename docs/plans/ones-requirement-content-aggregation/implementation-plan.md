# ONES Requirement Content Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggregate ONES requirement content from related wiki pages and task detail descriptions, including wiki links embedded as anchors or plain URLs.

**Architecture:** Extend the existing ONES adapter only. `getRequirement` will fetch task detail fields through GraphQL, extract wiki UUIDs from related pages and description HTML/text, dedupe wiki pages, fetch wiki content, and fall back to detail text when wiki content is absent.

**Tech Stack:** TypeScript, Vitest, existing ONES adapter fetch mocks.

---

## File Structure

- Modify: `src/adapters/ones.ts`
  - Add task description fields to the requirement GraphQL type/query.
  - Add helper functions for wiki UUID extraction, HTML-to-text fallback, wiki dedupe, and detail fallback selection.
  - Update `getRequirement` aggregation order.
- Modify: `tests/adapters/ones.test.ts`
  - Add regression tests for anchor wiki links, plain URL wiki links, duplicate wiki pages, and description fallback.
- Optionally Modify: `tests/fixtures/ones-response.json`
  - Only if shared fixture changes are cleaner than inline fixtures.
- No changes: MCP tool schemas, `src/tools/get-requirement.ts`, auth, config loader, package exports.

## Task 1: Add Failing Tests For Detail Aggregation

**Files:**
- Modify: `tests/adapters/ones.test.ts`

- [ ] **Step 1: Add test for anchor wiki link in task detail**

Add a test under `describe('getRequirement', ...)` that:

- mocks login flow
- returns a task with `description` containing `<a href="https://1s.oristand.com/wiki/#/team/63FL1oSZ/space/Nt5vQAJN/page/wiki-anchor-uuid">点击查看</a>`
- returns wiki content for `wiki-anchor-uuid`
- expects `result.description` to contain the wiki content

Expected initial result: fail because `TASK_DETAIL_QUERY` does not request description fields and no wiki extraction exists.

- [ ] **Step 2: Add test for plain pasted wiki URL**

Add a test where `descriptionText` contains:

```text
具体需求内容详见wiki：https://1s.oristand.com/wiki/#/team/63FL1oSZ/space/Nt5vQAJN/page/wiki-plain-uuid
```

Expect the adapter to fetch and include `wiki-plain-uuid` content.

Expected initial result: fail.

- [ ] **Step 3: Add test for duplicate wiki dedupe**

Add a test where:

- `relatedWikiPages` contains `wiki-dup-uuid`
- `description` also contains a URL ending in `/page/wiki-dup-uuid`
- wiki content fetch is called once for that UUID
- `result.description` contains one `###` section for that wiki

Expected initial result: fail.

- [ ] **Step 4: Add test for detail fallback**

Add a test where:

- no `relatedWikiPages`
- no wiki link in `description` or `descriptionText`
- `descriptionText` contains requirement content
- `result.description` contains a `## Requirement Detail` section with that text

Expected initial result: fail.

- [ ] **Step 5: Run targeted tests and confirm failure**

Run:

```bash
pnpm test:run tests/adapters/ones.test.ts
```

Expected: new tests fail.

## Task 2: Extend Task Detail Query And Types

**Files:**
- Modify: `src/adapters/ones.ts`

- [ ] **Step 1: Extend `OnesTaskNode`**

Add optional fields:

```ts
description?: string
descriptionText?: string
desc_rich?: string
```

- [ ] **Step 2: Extend `TASK_DETAIL_QUERY`**

Add fields inside `task`:

```graphql
description
descriptionText
desc_rich: description
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
pnpm test:run tests/adapters/ones.test.ts
```

Expected: tests still fail until extraction/aggregation is implemented.

## Task 3: Implement Wiki Link Extraction And Detail Fallback

**Files:**
- Modify: `src/adapters/ones.ts`

- [ ] **Step 1: Add wiki UUID extraction helper**

Add a helper near other pure helper functions:

```ts
function extractWikiPageUuidsFromText(text: string): string[] {
  if (!text)
    return []

  const uuids = new Set<string>()
  const patterns = [
    /\/page\/([A-Za-z0-9_-]+)/g,
    /page=([A-Za-z0-9_-]+)/g,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1])
        uuids.add(match[1])
    }
  }

  return [...uuids]
}
```

This handles both anchor `href` HTML and plain pasted URLs because both appear in the raw description string.

- [ ] **Step 2: Add HTML-to-text fallback helper**

Add:

```ts
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
```

- [ ] **Step 3: Add detail fallback selector**

Add:

```ts
function getTaskDetailText(task: OnesTaskNode): string {
  return task.descriptionText?.trim()
    || htmlToPlainText(task.desc_rich ?? task.description ?? '')
}
```

- [ ] **Step 4: Build deduped wiki refs in `getRequirement`**

Replace direct `const wikiPages = task.relatedWikiPages ?? []` logic with:

```ts
const wikiRefs = new Map<string, { title: string, uuid: string }>()

for (const wiki of task.relatedWikiPages ?? []) {
  if (!wiki.errorMessage)
    wikiRefs.set(wiki.uuid, { title: wiki.title, uuid: wiki.uuid })
}

const detailForLinkExtraction = [task.description, task.descriptionText, task.desc_rich].filter(Boolean).join('\n')
for (const wikiUuid of extractWikiPageUuidsFromText(detailForLinkExtraction)) {
  if (!wikiRefs.has(wikiUuid))
    wikiRefs.set(wikiUuid, { title: `Wiki ${wikiUuid}`, uuid: wikiUuid })
}
```

- [ ] **Step 5: Fetch wiki contents from deduped refs**

Use:

```ts
const wikiContents = await Promise.all(
  [...wikiRefs.values()].map(async (wiki) => {
    const content = await this.fetchWikiContent(wiki.uuid)
    return { title: wiki.title, uuid: wiki.uuid, content }
  }),
)
```

- [ ] **Step 6: Add detail fallback section**

After wiki documents, add:

```ts
const detailText = getTaskDetailText(task)
const hasWikiContent = wikiContents.some(wiki => wiki.content.trim())
if (detailText && !hasWikiContent) {
  parts.push('')
  parts.push('---')
  parts.push('')
  parts.push('## Requirement Detail')
  parts.push('')
  parts.push(detailText)
}
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
pnpm test:run tests/adapters/ones.test.ts
```

Expected: new and existing adapter tests pass.

## Task 4: Full Verification

**Files:**
- Inspect all modified files.

- [ ] **Step 1: Run focused tool tests**

Run:

```bash
pnpm test:run tests/tools/get-requirement.test.ts tests/adapters/ones.test.ts
```

Expected: pass.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: pass.

- [ ] **Step 3: Run full tests**

Run:

```bash
pnpm test:run
```

Expected: pass.

- [ ] **Step 4: Review diff**

Run:

```bash
git diff -- src/adapters/ones.ts tests/adapters/ones.test.ts docs/plans/ones-requirement-content-aggregation
```

Expected: changes are limited to requirement aggregation logic, tests, and plan artifacts.
