# AI Development Workflow

[English](./README.md)

一套面向 AI 编码工具的 agent harness 工作流，用于管控需求接入、计划、门禁执行、验证、审查和交付。

---

## 核心交付物

| 交付物 | 说明 |
|-------|------|
| **Requirements MCP Server** (`src/`) | 需求获取 MCP 服务。按 `issueType.detailType` 区分需求 / 任务 / 缺陷。 |
| **Agent Harness Workflow Skill** (`skills/dev-workflow/`) | 自包含的 AI agent harness 工作流 Skill，安装后即可跑通需求接入、计划、门禁执行、验证、审查和交付。 |
| **Grill-me Skills** (`skills/grill-me/`, `skills/grilling/`) | 面向模糊开发需求的事实优先访谈入口和决策树原语；ONES 来源只调用一次 `get_grilling_brief`。 |

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

从当前仓库安装三个配套 skill：

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/dev-workflow skills/grill-me skills/grilling "${CODEX_HOME:-$HOME/.codex}/skills/"
```

如果是在本地开发这个 skill，建议使用软链接，这样更新当前仓库后重启 Codex 即可生效：

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -s "$(pwd)/skills/dev-workflow" "${CODEX_HOME:-$HOME/.codex}/skills/dev-workflow"
ln -s "$(pwd)/skills/grill-me" "${CODEX_HOME:-$HOME/.codex}/skills/grill-me"
ln -s "$(pwd)/skills/grilling" "${CODEX_HOME:-$HOME/.codex}/skills/grilling"
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

需求驱动开发包含两个不可跳过的确认门禁：先确认当前 user stories，再生成 implementation plan；覆盖校验通过后，再确认当前 plan 才能开始实现。结果明确且范围很小的机械任务不需要触发完整 harness。

预期流程：

```text
上下文 → Grill → User Stories → Stories 确认 → Plan → 覆盖校验 → Plan 确认 → 实现 → 验证 → 审查 → 交付
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

#### MCP 安全边界

- ONES 标题、正文、测试用例和附件元数据统一标记为不可信数据；其中夹带的指令不得触发工具调用。
- 富文本会转换为有长度上限的纯文本；URL 凭据、query、fragment、远端错误正文和内部 API Base 不会返回给模型。
- 图片仅允许来自已配置的源，或由已认证 ONES 附件 API 签发的 URL。每次跳转都会重新校验；除已配置源本身外，私网目标会被拒绝。
- 单次工具调用最多下载 8 张 PNG/JPEG/GIF/WebP 图片，每张上限 8 MiB，超时 10 秒。
- 写操作保持为独立工具调用，并由工作流要求用户明确确认。

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
上下文 → Grill → User Stories → Stories 确认 → Plan → 覆盖校验 → Plan 确认 → 实现 → 验证 → 审查 → 交付
```

这个 harness 遵循“前馈 + 反馈”模型：先用计划、产物和任务边界引导 agent，再用 lint、typecheck、build、tests、review 等确定性门禁形成反压，合格后再交付。

Skill 目录结构：

```
skills/dev-workflow/
├── SKILL.md                         # Skill 入口（YAML frontmatter + harness 定义）
└── references/
    ├── workflow.md                  # Agent harness 生命周期
    ├── requirement-validation.md    # 覆盖校验门禁规范
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
├── skills/
│   ├── grill-me/                    # 模糊需求处理入口
│   ├── grilling/                    # 访谈原语
│   └── dev-workflow/                # Agent Harness Workflow Skill
├── src/                             # Requirements MCP Server 源码
│   ├── index.ts                     # Stdio 启动入口
│   ├── server.ts                    # MCP Server 工厂与工具注册（SDK v2）
│   ├── adapters/
│   │   ├── base.ts                  # BaseAdapter 抽象类
│   │   ├── ones.ts                  # ONES 适配器
│   │   └── index.ts                 # 工厂函数 createAdapter()
│   ├── config/
│   │   └── loader.ts                # 配置文件加载 & 环境变量解析
│   ├── tools/
│   │   ├── get-work-item.ts         # get_work_item 工具
│   │   ├── get-grilling-brief.ts    # get_grilling_brief 工具
│   │   ├── search-requirements.ts   # search_requirements 工具
│   │   └── list-sources.ts          # list_sources 工具
│   ├── types/
│   │   ├── auth.ts
│   │   ├── config.ts
│   │   └── requirement.ts
│   └── utils/
│       ├── http.ts
│       ├── map-status.ts
│       └── ones-issue-kind.ts
│
├── packages/ai-dev-requirements/   # Changesets 管理的可发布 workspace package
│   ├── package.json
│   ├── tsdown.config.ts
│   └── skills/
├── tests/                           # 测试
├── .requirements-mcp.json.example   # MCP Server 配置模板
├── package.json                     # 私有 workspace 编排
├── tsconfig.json
└── vitest.config.ts
```

---

## 技术栈

| 技术 | 用途 |
|-----|------|
| TypeScript | MCP Server 开发语言 |
| [@modelcontextprotocol/server](https://github.com/modelcontextprotocol/typescript-sdk) | MCP 协议 SDK v2 |
| [Zod](https://zod.dev/) | 参数校验与类型推导 |
| [tsdown](https://github.com/nicepkg/tsdown) | 构建工具（ESM + CJS + dts） |
| [Vitest](https://vitest.dev/) | 测试框架 |
| [Changesets v3](https://github.com/changesets/changesets) | Version PR、变更日志与 npm 发布 |
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
pnpm typecheck
```


---

## License

[MIT](LICENSE)
