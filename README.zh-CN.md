# AI Development Workflow

[English](./README.md)

一套面向 AI 编码工具的并行任务开发框架，实现端到端的开发工作流自动化。

---

## 核心交付物

| 交付物 | 说明 |
|-------|------|
| **Requirements MCP Server** (`src/`) | 需求获取 MCP 服务，内置 ONES 适配器，可通过 npm 安装 |
| **Dev Workflow Skill** (`skills/dev-workflow/`) | 自包含的开发工作流 Skill，安装后即可跑通完整流程 |

---

## 快速开始

### 1. 安装 Dev Workflow Skill

```bash
npx skills add daguanren21/ai-dev-workflow
```

指定 AI 工具安装，使用 `-a`：

```bash
npx skills add daguanren21/ai-dev-workflow -a claude-code
```

安装后，AI 编码工具会自动识别并使用 dev-workflow skill 驱动完整的开发流程。

### 2. 安装 MCP Server（可选）

如果使用 ONES 进行需求管理：

```bash
npm install -g @ai-dev/requirements
```

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

在 `.mcp.json` 中注册：

```json
{
  "mcpServers": {
    "requirements": {
      "command": "npx",
      "args": ["@ai-dev/requirements"],
      "env": {
        "ONES_ACCOUNT": "${ONES_ACCOUNT}",
        "ONES_PASSWORD": "${ONES_PASSWORD}"
      }
    }
  }
}
```

### 3. 搭配其他 MCP Server（可选）

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
    ├── workflow.md                  # 10 步端到端工作流
    ├── task-types.md                # 任务类型、调度策略、声明语法
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
├── skills/dev-workflow/             # Dev Workflow Skill（自包含工作流）
│   ├── SKILL.md
│   └── references/
│       ├── workflow.md
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
