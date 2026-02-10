---
name: dev-workflow
description: >
  Use when starting any development task - receiving a requirement ticket number, requirement description,
  or when user says "start developing", "new feature", "implement XXX". Drives the full workflow from
  requirement fetching through user stories, UI resource acquisition, skill matching, implementation
  planning, coding, and verification. Supports ONES/GitHub/Jira MCP for requirements, Figma MCP for
  design references, and npx skills find for frontend UI skills when no design is provided.
metadata:
  author: ai-dev-workflow
  version: "0.1.0"
---

# Dev Workflow

## Overview

Requirement-driven AI-assisted development workflow. From requirements to user stories, from user stories to implementation plans, from plans to code.

**Announce at start:** "I'm using the dev-workflow skill to drive the development process."

**Core principle:** Requirements first, then user stories, then plan, then code. Never skip to code without a confirmed user story and plan.

## The Process

### Phase 1: Fetch Requirements

Identify the requirement source and fetch using the corresponding MCP:

| Source | MCP Server | Tool |
|--------|-----------|------|
| ONES | `requirements` MCP (bundled) | `get_requirement` |
| GitHub | `github` MCP ([github/github-mcp-server](https://github.com/github/github-mcp-server)) | get issue |
| Jira | `atlassian` MCP ([Atlassian Rovo MCP](https://www.atlassian.com/blog/announcements/remote-mcp-server)) | get issue |
| Natural language | No MCP needed | Use user's description directly |

Save raw requirements to `docs/plans/{feature-name}/requirements.md`.

### Phase 2: Write User Stories

Convert requirements into standard user stories:

```markdown
### US-1: {title}
**As a** {role},
**I want** {goal},
**So that** {value}.

#### Acceptance Criteria
- [ ] Given {precondition}, When {action}, Then {expected result}

#### UI Notes
- 🎨 Figma: {link} | 🖼️ Screenshot: {path} | 📝 No UI dependency
```

Rules:
1. Each story must be independently deliverable
2. Acceptance criteria use Given/When/Then
3. Stories involving UI: mark and **pause** for developer to provide UI reference
4. Non-UI stories: mark as "No UI dependency"

Save to `docs/plans/{feature-name}/user-stories.md`.

**PAUSE:** Present stories to developer for confirmation. Collect UI references.

### Phase 3: Acquire UI Resources

**Path A — Developer provided UI reference:**
- **Figma copy link** → Use Figma MCP Server to read design details (components, variables, layout)
- **Screenshot/image** → Analyze image directly for UI structure
- **Text description** → Understand UI intent from description

**Path B — No UI reference provided:**

Search for frontend UI skills via `npx skills find`:

```bash
npx skills find frontend design
npx skills find ui component
npx skills find css styling
```

Load matching community skills and apply their best practices to guide UI implementation.

Also check the 5-level skill lookup (Phase 4) for project-level UI conventions.

### Phase 4: Match Skills (5-Level Lookup)

Extract tech keywords from user stories, find best practices by priority:

| Priority | Source | Description |
|:---:|------|------|
| L1 | Project `skills/` | Project-specific conventions (highest priority) |
| L2 | Installed global skills | superpowers, giga-ui, vue-best-practices, etc. |
| L3 | `npx skills find {keyword}` | skills.sh community ecosystem |
| L4 | Context7 MCP | Framework/library official docs |
| L5 | WebSearch | Fallback |

### Phase 5: Write Implementation Plan

**REQUIRED SUB-SKILL:** Use `superpowers:writing-plans` to generate the plan.

Based on user stories + UI resources + matched skills, generate bite-sized plan:
- Each step 2-5 minutes, TDD, exact file paths and code
- DRY, YAGNI, frequent commits

Save to `docs/plans/{feature-name}/implementation-plan.md`.

### Phase 6: Implement Code

**REQUIRED SUB-SKILL:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

Follow task types and scheduling strategies defined in `references/task-types.md`.

Key constraints:
- Max 5 parallel tasks
- `code:dev` → isolated (serial within module, parallel across modules)
- `code:refactor` → serial (global lock)
- `doc:write` / `test` → parallel

### Phase 7: Verify

1. **Quality gate** (in order, all must pass):
   ```bash
   pnpm lint    # Code style
   pnpm type    # TypeScript type check (tsc --noEmit)
   pnpm build   # Build verification
   ```
2. **UI verification** (frontend projects only): Playwright MCP
3. **Code review:** **REQUIRED SUB-SKILL:** Use `superpowers:requesting-code-review`

## Quick Reference

| Phase | Output | Pause? |
|-------|--------|--------|
| 1. Requirements | `requirements.md` | No |
| 2. User Stories | `user-stories.md` | **Yes** — developer confirms |
| 3. UI Resources | figma-notes / screenshots | Only if UI stories exist |
| 4. Skill Matching | matched skills list | No |
| 5. Plan | `implementation-plan.md` | Per writing-plans skill |
| 6. Code | Source files + tests | Per executing-plans skill |
| 7. Verify | lint + type + build pass | No |

## Output Structure

```
docs/plans/{feature-name}/
├── requirements.md
├── user-stories.md
├── ui-references/
│   ├── figma-notes.md
│   └── screenshots/
└── implementation-plan.md
```

## Common Mistakes

- **Skipping user stories** — jumping straight from requirements to code. Always convert to user stories first.
- **Not pausing for UI** — continuing without UI reference when stories involve UI changes. Always pause and ask.
- **Ignoring skill matching** — not checking for relevant project/community skills before planning. Always run the 5-level lookup.
- **Wrong parallelism** — running `code:refactor` tasks in parallel. Refactoring is always serial.
