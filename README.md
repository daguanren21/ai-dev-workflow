# AI Development Workflow

[中文](./README.zh-CN.md)

An agent harness workflow for AI coding tools, enabling controlled requirement intake, planning, gated execution, verification, review, and handoff.

---

## What's Included

| Deliverable | Description |
|-------------|-------------|
| **Requirements MCP Server** (`src/`) | MCP server for fetching requirements, with built-in ONES adapter. Installable via npm. |
| **Agent Harness Workflow Skill** (`skills/dev-workflow/`) | Self-contained agent harness skill. Install it to run requirement intake, planning, gated execution, verification, review, and handoff. |

---

## Quick Start

### 1. Install Agent Harness Workflow Skill

```bash
npx skills add daguanren21/ai-dev-workflow
```

Install to a specific agent with `-a`:

```bash
npx skills add daguanren21/ai-dev-workflow -a claude-code
```

Once installed, AI coding tools will automatically use the dev-workflow harness to govern the full development process.

### 2. Install For Codex

Codex loads skills from `$CODEX_HOME/skills`. If `CODEX_HOME` is not set, the default is `~/.codex`.

From this repository:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills/dev-workflow"
cp -R skills/dev-workflow/* "${CODEX_HOME:-$HOME/.codex}/skills/dev-workflow/"
```

For local development, use a symlink instead so Codex picks up edits from this checkout after restart:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -s "$(pwd)/skills/dev-workflow" "${CODEX_HOME:-$HOME/.codex}/skills/dev-workflow"
```

Restart Codex after installing or updating the skill.

### 3. Trigger The Harness

The skill can be triggered automatically when the task looks like AI-assisted development work: requirement intake, issue implementation, task planning, gated execution, verification, review, or handoff.

You can also trigger it explicitly:

```text
Use the dev-workflow harness to implement this requirement: <requirement text or ticket id>
```

```text
Use the dev-workflow harness. Read ONES-123, write the plan first, then wait for confirmation before implementation.
```

```text
Use the dev-workflow harness for this GitHub issue: <issue url>
```

When the harness is active, the agent should announce:

```text
I'm using the dev-workflow harness to drive this development task.
```

By default, the harness generates user stories and an implementation plan before writing code, then pauses for confirmation. You do not need to repeat "write the plan first" in every prompt. Say so only when you want to bypass that gate.

Expected flow:

```text
Intake -> Context Load -> Normalize -> Harness Plan -> Coverage Validation -> Gated Execution -> Verification -> Review -> Handoff
```

### 4. Install MCP Server (Optional)

If you use ONES for requirement management:

```bash
npm install -g ai-dev-requirements
```

Create `.requirements-mcp.json` in your project root:

```json
{
  "sources": {
    "ones": {
      "enabled": true,
      "apiBase": "https://your-org.ones.com",
      "auth": {
        "type": "ones-pkce",
        "emailEnv": "ONES_ACCOUNT",
        "passwordEnv": "ONES_PASSWORD"
      }
    }
  },
  "defaultSource": "ones"
}
```

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "requirements": {
      "command": "npx",
      "args": ["ai-dev-requirements"],
      "env": {
        "ONES_ACCOUNT": "${ONES_ACCOUNT}",
        "ONES_PASSWORD": "${ONES_PASSWORD}"
      }
    }
  }
}
```

### 5. Add Companion MCP Servers (Optional)

Requirements are not limited to ONES. Pair with official MCP servers for GitHub / Jira / Figma:

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    },
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

---

## Supported Requirement Platforms

| Platform | Integration | Description |
|----------|-------------|-------------|
| ONES | Built-in adapter | Directly supported by this MCP server, OAuth2 PKCE auth |
| GitHub Issues | External MCP | Use [github/github-mcp-server](https://github.com/github/github-mcp-server) |
| Jira | External MCP | Use [Atlassian Rovo MCP Server](https://www.atlassian.com/blog/announcements/remote-mcp-server) |

> This project uses an adapter architecture (`BaseAdapter`). To add a new platform as a built-in adapter, extend `SourceType` and implement `BaseAdapter`.

---

## Agent Harness Workflow Skill

A self-contained AI-assisted agent harness skill that governs the full development lifecycle:

```
Intake -> Context Load -> Normalize -> Harness Plan -> Coverage Validation -> Gated Execution -> Verification -> Review -> Handoff
```

The harness follows a feedforward + feedback model: it guides the agent with plans, artifacts, and task boundaries, then uses deterministic gates such as lint, typecheck, build, tests, and review as backpressure before handoff.

Skill directory structure:

```
skills/dev-workflow/
├── SKILL.md                         # Skill entry (YAML frontmatter + harness definition)
└── references/
    ├── workflow.md                  # Agent harness lifecycle
    ├── task-types.md                # Harness task types, scheduler modes, declaration syntax
    ├── service-transform.md         # Service-layer transform pattern for Mock/API adaptation
    └── templates/                   # Task declaration templates
        ├── code-dev-task.md
        ├── code-fix-task.md
        ├── code-refactor-task.md
        ├── doc-write-task.md
        ├── research-task.md
        └── test-task.md
```

---

## Project Structure

```
ai-dev-workflow/
├── skills/dev-workflow/             # Agent Harness Workflow Skill (self-contained)
│   ├── SKILL.md
│   └── references/
│       ├── workflow.md              # Agent harness lifecycle
│       ├── task-types.md
│       ├── service-transform.md
│       └── templates/
│
├── src/                             # Requirements MCP Server source
│   ├── index.ts                     # Entry & MCP Server definition
│   ├── adapters/
│   │   ├── base.ts                  # BaseAdapter abstract class
│   │   ├── ones.ts                  # ONES adapter
│   │   └── index.ts                 # Factory function createAdapter()
│   ├── config/
│   │   └── loader.ts                # Config loading & env resolution
│   ├── tools/
│   │   ├── get-requirement.ts       # get_requirement tool
│   │   ├── search-requirements.ts   # search_requirements tool
│   │   └── list-sources.ts          # list_sources tool
│   ├── types/
│   │   ├── auth.ts
│   │   ├── config.ts
│   │   └── requirement.ts
│   └── utils/
│       ├── http.ts
│       └── map-status.ts
│
├── tests/                           # Tests
├── .requirements-mcp.json.example   # MCP Server config template
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── vitest.config.ts
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| TypeScript | MCP Server language |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MCP protocol SDK |
| [Zod](https://zod.dev/) | Schema validation & type inference |
| [tsdown](https://github.com/nicepkg/tsdown) | Build tool (ESM + CJS + dts) |
| [Vitest](https://vitest.dev/) | Test framework |
| [bumpp](https://github.com/antfu/bumpp) | Version management & publishing |
| Node.js >= 20 | Runtime |

---

## Development

```bash
# Install dependencies
pnpm install

# Dev mode
pnpm dev

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm lint
```

### Publishing

This project uses [bumpp](https://github.com/antfu/bumpp) for version management:

```bash
# Interactive version bump, auto commit + tag + push
pnpm release
```

---

## License

[MIT](LICENSE)
