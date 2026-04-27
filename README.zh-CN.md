# AI Development Workflow

[English](./README.md)

一套面向 AI 编码工具的 agent harness 工作流，用于管控需求接入、计划、门禁执行、验证、审查和交付。

---

## 核心交付物

| 交付物 | 说明 |
|-------|------|
| **Requirements MCP Server** (`src/`) | 需求获取 MCP 服务，内置 ONES 适配器，可通过 npm 安装 |
| **Agent Harness Workflow Skill** (`skills/dev-workflow/`) | 自包含的 AI agent harness 工作流 Skill，安装后即可跑通需求接入、计划、门禁执行、验证、审查和交付。 |

---

## 快速开始

### 1. 安装 Agent Harness Workflow Skill

```bash
npx skills add daguanren21/ai-dev-workflow
```

指定 AI 工具安装，使用 `-a`：

```bash
npx skills add daguanren21/ai-dev-workflow -a claude-code
```

安装后，AI 编码工具会自动识别并使用 dev-workflow harness 管控完整开发流程。

### 2. 安装到 Codex

Codex 从 `$CODEX_HOME/skills` 加载 skills。未设置 `CODEX_HOME` 时，默认目录是 `~/.codex`。

从当前仓库安装：

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills/dev-workflow"
cp -R skills/dev-workflow/* "${CODEX_HOME:-$HOME/.codex}/skills/dev-workflow/"
```

如果是在本地开发这个 skill，建议使用软链接，这样更新当前仓库后重启 Codex 即可生效：

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -s "$(pwd)/skills/dev-workflow" "${CODEX_HOME:-$HOME/.codex}/skills/dev-workflow"
```

安装或更新后需要重启 Codex。

### 3. 触发 Harness

当任务看起来是 AI 辅助开发工作时，skill 可以自动触发，例如：需求接入、issue 实现、任务规划、门禁执行、验证、审查或交付。

也可以显式触发：

```text
使用 dev-workflow harness 实现这个需求：<需求文本或工单号>
```

```text
使用 dev-workflow harness。读取 ONES-123，先写计划，确认后再实现。
```

```text
使用 dev-workflow harness 处理这个 GitHub issue：<issue url>
```

Harness 生效时，agent 应该先声明：

```text
I'm using the dev-workflow harness to drive this development task.
```

默认情况下，harness 会先生成 user stories 和 implementation plan，然后暂停等待确认，再开始写代码。你不需要每次重复“先写计划再实现”。只有想跳过这个门禁时，才需要明确说明。

预期流程：

```text
需求接入 → 上下文加载 → 需求规范化 → Harness 计划 → 覆盖校验 → 门禁执行 → 验证 → 审查 → 交付
```

### 4. 安装 MCP Server（可选）

如果使用 ONES 进行需求管理：

```bash
npm install -g ai-dev-requirements
```

在项目根目录创建 `.requirements-mcp.json`：

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

在 `.mcp.json` 中注册：

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

### 5. 搭配其他 MCP Server（可选）

需求不限于 ONES，可搭配官方 MCP Server 获取 GitHub / Jira / Figma 资源：

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

## 支持的需求管理平台

| 平台 | 接入方式 | 说明 |
|-----|---------|------|
| ONES | 内置适配器 | 本项目 MCP Server 直接支持，OAuth2 PKCE 认证 |
| GitHub Issues | 外置 MCP | 使用 [github/github-mcp-server](https://github.com/github/github-mcp-server) |
| Jira | 外置 MCP | 使用 [Atlassian Rovo MCP Server](https://www.atlassian.com/blog/announcements/remote-mcp-server) |

> 本项目采用适配器架构（`BaseAdapter`），如需将新平台作为内置适配器，扩展 `SourceType` 并实现 `BaseAdapter` 即可。

---

## Agent Harness Workflow Skill

自包含的 AI 辅助 agent harness 工作流 Skill，安装后自动管控完整开发生命周期：

```
需求接入 → 上下文加载 → 需求规范化 → Harness 计划 → 覆盖校验 → 门禁执行 → 验证 → 审查 → 交付
```

这个 harness 遵循“前馈 + 反馈”模型：先用计划、产物和任务边界引导 agent，再用 lint、typecheck、build、tests、review 等确定性门禁形成反压，合格后再交付。

Skill 目录结构：

```
skills/dev-workflow/
├── SKILL.md                         # Skill 入口（YAML frontmatter + harness 定义）
└── references/
    ├── workflow.md                  # Agent harness 生命周期
    ├── task-types.md                # Harness 任务类型、调度模式、声明语法
    ├── service-transform.md         # Service 层 Transform 适配模式
    └── templates/                   # 任务声明模板
        ├── code-dev-task.md
        ├── code-fix-task.md
        ├── code-refactor-task.md
        ├── doc-write-task.md
        ├── research-task.md
        └── test-task.md
```

---

## 项目结构

```
ai-dev-workflow/
├── skills/dev-workflow/             # Agent Harness Workflow Skill（自包含工作流）
│   ├── SKILL.md
│   └── references/
│       ├── workflow.md              # Agent harness 生命周期
│       ├── task-types.md
│       ├── service-transform.md
│       └── templates/
│
├── src/                             # Requirements MCP Server 源码
│   ├── index.ts                     # 入口 & MCP Server 定义
│   ├── adapters/
│   │   ├── base.ts                  # BaseAdapter 抽象类
│   │   ├── ones.ts                  # ONES 适配器
│   │   └── index.ts                 # 工厂函数 createAdapter()
│   ├── config/
│   │   └── loader.ts                # 配置文件加载 & 环境变量解析
│   ├── tools/
│   │   ├── get-requirement.ts       # get_requirement 工具
│   │   ├── search-requirements.ts   # search_requirements 工具
│   │   └── list-sources.ts          # list_sources 工具
│   ├── types/
│   │   ├── auth.ts
│   │   ├── config.ts
│   │   └── requirement.ts
│   └── utils/
│       ├── http.ts
│       └── map-status.ts
│
├── tests/                           # 测试
├── .requirements-mcp.json.example   # MCP Server 配置模板
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── vitest.config.ts
```

---

## 技术栈

| 技术 | 用途 |
|-----|------|
| TypeScript | MCP Server 开发语言 |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MCP 协议 SDK |
| [Zod](https://zod.dev/) | 参数校验与类型推导 |
| [tsdown](https://github.com/nicepkg/tsdown) | 构建工具（ESM + CJS + dts） |
| [Vitest](https://vitest.dev/) | 测试框架 |
| [bumpp](https://github.com/antfu/bumpp) | 版本管理与发布 |
| Node.js >= 20 | 运行时 |

---

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 运行测试
pnpm test

# 类型检查
pnpm lint
```

### 发版流程

本项目使用 [bumpp](https://github.com/antfu/bumpp) 管理版本：

```bash
# 交互式选择版本号，自动 commit + tag + push
pnpm release
```

---

## License

[MIT](LICENSE)
