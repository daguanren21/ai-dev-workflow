# AI Development Workflow

一套面向 AI 编码工具的并行任务开发框架，实现端到端的开发工作流自动化。

---

## 核心交付物

本项目包含两个核心部分：

| 交付物 | 说明 |
|-------|------|
| **并行任务框架文档** (`docs/parallel-task/`) | 通用的 AI 辅助开发规范，定义工作流、任务类型、调度策略、适配模式 |
| **Requirements MCP Server** (`src/`) | 统一需求获取服务，支持 Ones / Jira / GitHub 等需求管理系统 |

---

## 快速开始

### 方式一：使用框架文档

将 `docs/parallel-task/` 复制到你的项目中，并创建对应的 AI 工具入口文件：

```bash
# 1. 复制核心规范文档
cp -r docs/parallel-task/ <你的项目>/docs/parallel-task/

# 2. 复制 AI 工具入口文件（按需选择）
cp AGENTS.md <你的项目>/          # Codex / Qodo / Cursor
cp CLAUDE.md <你的项目>/          # Claude Code
cp -r .kiro/ <你的项目>/          # Kiro
```

### 方式二：安装 MCP Server

```bash
# 1. 安装
npm install -g requirements-mcp-server

# 2. 在项目根目录创建配置文件
cp .requirements-mcp.json.example .requirements-mcp.json

# 3. 配置环境变量（以 Ones 为例）
export ONES_USERNAME="your-username"
export ONES_PASSWORD="your-password"

# 4. 在 .mcp.json 中注册 MCP Server
```

`.mcp.json` 配置示例：

```json
{
  "mcpServers": {
    "requirements": {
      "command": "npx",
      "args": ["requirements-mcp"],
      "env": {
        "ONES_USERNAME": "${ONES_USERNAME}",
        "ONES_PASSWORD": "${ONES_PASSWORD}"
      }
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

## 技术栈

| 技术 | 用途 |
|-----|------|
| TypeScript | MCP Server 开发语言 |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MCP 协议 SDK |
| [Zod](https://zod.dev/) | 参数校验与类型推导 |
| [tsdown](https://github.com/nicepkg/tsdown) | 构建工具 |
| [Vitest](https://vitest.dev/) | 测试框架 |
| Node.js >= 20 | 运行时 |

---

## 项目结构

```
ai-dev-workflow/
├── AGENTS.md                        # 通用 AI 工具入口（Codex / Qodo / Cursor）
├── CLAUDE.md                        # Claude Code 入口
├── .kiro/steering/                  # Kiro 入口
│   └── parallel-task.md
│
├── docs/parallel-task/              # 并行任务框架核心文档（SSOT）
│   ├── README.md                    # 框架说明
│   ├── workflow.md                  # 10 步工作流定义
│   ├── task-types.md                # 任务类型与调度策略
│   ├── service-transform.md         # Service 层 Transform 适配模式
│   └── templates/                   # 任务声明模板
│       ├── code-dev-task.md
│       ├── code-fix-task.md
│       ├── code-refactor-task.md
│       ├── doc-write-task.md
│       ├── research-task.md
│       └── test-task.md
│
├── src/                             # Requirements MCP Server 源码
│   ├── adapters/                    # 平台适配器（Ones / Jira / GitHub）
│   │   └── base.ts
│   ├── config/                      # 配置加载
│   │   └── loader.ts
│   ├── types/                       # 类型定义
│   │   ├── auth.ts
│   │   ├── config.ts
│   │   └── requirement.ts
│   └── utils/                       # 工具函数
│       ├── http.ts
│       └── map-status.ts
│
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
| Claude Code | `CLAUDE.md` | 使用 @ 语法引用规范文件 |
| OpenAI Codex | `AGENTS.md` | 通用入口 |
| Cursor | `AGENTS.md` | 通用入口 |
| Qodo | `AGENTS.md` | 通用入口 |
| Kiro | `.kiro/steering/` | Kiro steering 格式 |

---

## 支持的需求管理平台

| 平台 | 认证方式 | 状态 |
|-----|---------|------|
| Ones | Basic Auth（用户名 + 密码） | 开发中 |
| Jira | API Token | 开发中 |
| GitHub Issues | Personal Access Token | 开发中 |

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

---

## License

[MIT](LICENSE)
