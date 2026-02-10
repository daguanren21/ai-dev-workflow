# AI Development Workflow

一套面向 AI 编码工具的并行任务开发框架，实现端到端的开发工作流自动化。

---

## 核心交付物

| 交付物 | 说明 |
|-------|------|
| **Requirements MCP Server** (`src/`) | 需求获取 MCP 服务，内置 ONES 适配器，可通过 npm 安装 |
| **Dev Workflow Skill** (`skills/dev-workflow/`) | 自包含的开发工作流 Skill，安装后即可跑通完整流程 |
| **并行任务框架文档** (`docs/parallel-task/`) | 通用的 AI 辅助开发规范，定义工作流、任务类型、调度策略 |

---

## 快速开始

### 1. 安装 MCP Server

```bash
npm install -g requirements-mcp-server
```

### 2. 配置 MCP

在项目根目录创建 `.requirements-mcp.json`：

```json
{
  "sources": {
    "ones": {
      "baseUrl": "https://your-org.ones.com",
      "auth": {
        "type": "ones-pkce",
        "envMapping": {
          "username": "ONES_ACCOUNT",
          "password": "ONES_PASSWORD"
        }
      }
    }
  },
  "defaultSource": "ones"
}
```

### 3. 注册到 AI 工具

在 `.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "requirements": {
      "command": "npx",
      "args": ["requirements-mcp"],
      "env": {
        "ONES_ACCOUNT": "${ONES_ACCOUNT}",
        "ONES_PASSWORD": "${ONES_PASSWORD}"
      }
    }
  }
}
```

### 4. 安装 Dev Workflow Skill（可选）

```bash
npx skills add ai-dev-workflow/skills/dev-workflow
```

安装后，AI 编码工具会自动识别并使用 dev-workflow skill 驱动完整的开发流程。

### 5. 搭配其他 MCP Server（可选）

需求不限于 ONES，可搭配官方 MCP Server 获取 GitHub / Jira 需求：

```json
{
  "mcpServers": {
    "requirements": {
      "command": "npx",
      "args": ["requirements-mcp"],
      "env": { "ONES_ACCOUNT": "${ONES_ACCOUNT}", "ONES_PASSWORD": "${ONES_PASSWORD}" }
    },
    "github": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    },
    "figma": {
      "url": "http://127.0.0.1:3845/mcp"
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp"]
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

## Dev Workflow Skill

自包含的 AI 辅助开发工作流 Skill，安装后自动驱动 7 个阶段：

```
需求获取 → 用户故事 → UI 资源获取 → 技能匹配 → 实现计划 → 代码实现 → 验证
```

Skill 目录结构：

```
skills/dev-workflow/
├── SKILL.md                         # Skill 入口（YAML frontmatter + 工作流定义）
└── references/
    ├── task-types.md                # 任务类型、调度策略、声明语法、模板
    └── service-transform.md         # Service 层 Transform 适配模式
```

---

## 项目结构

```
ai-dev-workflow/
├── AGENTS.md                        # 通用 AI 工具入口（Codex / Qodo / Cursor）
├── CLAUDE.md                        # Claude Code 入口
├── .kiro/steering/                  # Kiro 入口
│   └── parallel-task.md
│
├── skills/dev-workflow/             # Dev Workflow Skill（自包含工作流）
│   ├── SKILL.md
│   └── references/
│       ├── task-types.md
│       └── service-transform.md
│
├── docs/parallel-task/              # 并行任务框架核心文档（SSOT）
│   ├── README.md
│   ├── workflow.md
│   ├── task-types.md
│   ├── service-transform.md
│   └── templates/
│       ├── code-dev-task.md
│       ├── code-fix-task.md
│       ├── code-refactor-task.md
│       ├── doc-write-task.md
│       ├── research-task.md
│       └── test-task.md
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

## 支持的 AI 工具

| 工具 | 入口文件 | 说明 |
|-----|---------|------|
| Claude Code | `CLAUDE.md` | 使用 `@` 语法引用规范文件 |
| OpenAI Codex | `AGENTS.md` | 通用入口 |
| Cursor | `AGENTS.md` | 通用入口 |
| Qodo | `AGENTS.md` | 通用入口 |
| Kiro | `.kiro/steering/` | Kiro steering 格式 |

---

## 技术栈

| 技术 | 用途 |
|-----|------|
| TypeScript | MCP Server 开发语言 |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MCP 协议 SDK |
| [Zod](https://zod.dev/) | 参数校验与类型推导 |
| [tsdown](https://github.com/nicepkg/tsdown) | 构建工具（ESM + CJS + dts） |
| [Vitest](https://vitest.dev/) | 测试框架 |
| [Changesets](https://github.com/changesets/changesets) | 版本管理与 Changelog |
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

本项目使用 [Changesets](https://github.com/changesets/changesets) 管理版本和 Changelog：

```bash
# 1. 添加变更记录
pnpm changeset

# 2. 更新版本号 & 生成 CHANGELOG
pnpm version

# 3. 构建并发布到 npm
pnpm release
```

---

## License

[MIT](LICENSE)
