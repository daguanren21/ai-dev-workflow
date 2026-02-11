# Claude Code CLI v2.1.37 — 源码架构深度分析

> 分析时间: 2026-02-09
> 版本: 2.1.37 (构建: 2026-02-07T18:38:23Z)
> 来源: npm registry `@anthropic-ai/claude-code@2.1.37`

---

## 目录

- [概览](#概览)
- [1. 系统提示词架构](#1-系统提示词架构-system-prompts)
- [2. 工具系统](#2-工具系统-tools)
- [3. Hook 系统](#3-hook-系统)
- [4. 子代理系统](#4-子代理系统-subagents)
- [5. 技能系统](#5-技能系统-skills)
- [6. Memory 系统](#6-memory-系统-claudemd)
- [7. 设置系统](#7-设置系统-settings)
- [8. 插件系统](#8-插件系统-plugins)
- [9. MCP 集成](#9-mcp-集成)
- [10. 关键设计模式](#10-关键设计模式)
- [架构总图](#架构总图)

---

## 概览

| 属性 | 值 |
|------|------|
| 版本 | 2.1.37 (构建: 2026-02-07) |
| 入口 | `cli.js` (单文件, 美化后 488,737 行, ~18MB) |
| 运行时 | Node.js ≥ 18 |
| 打包方式 | 全部代码 bundle 为单个 JS 文件 (minified) |
| 附带资源 | `resvg.wasm`, `tree-sitter.wasm`, `tree-sitter-bash.wasm` |
| 包大小 | 约 75MB (含 wasm 和 vendor) |

### 包文件结构

```
package/
├── cli.js                    # 主入口 (11.3MB minified, 18MB beautified)
├── package.json              # 包元数据
├── README.md                 # 文档
├── LICENSE.md                # 许可证
├── bun.lock                  # Bun 锁文件
├── sdk-tools.d.ts            # SDK 类型定义 (67KB)
├── resvg.wasm                # SVG 渲染引擎 (2.5MB)
├── tree-sitter.wasm          # 语法解析器 (205KB)
├── tree-sitter-bash.wasm     # Bash 语法解析 (1.4MB)
└── vendor/                   # 第三方依赖
```

---

## 1. 系统提示词架构 (System Prompts)

系统提示词采用 **模块化拼接** 架构，由多个函数生成独立片段，最终组合成完整 prompt。

### 1.1 核心入口

有两个系统提示词构建路径：

| 函数 | 行号 | 用途 |
|------|------|------|
| `qN()` | 433864 | **标准路径** — 常规会话使用 |
| `vHq()` | 433854 | **简化路径** — 实验性变体 (`tengu_vinteuil_phrase`) |

### 1.2 标准路径 (`qN`) 组装流程

```
VKz($)     → 基础身份 "You are Claude Code..." + 安全策略 + 反馈信息
NKz($)     → # Tone and style / # Professional objectivity / # No time estimates
TKz(J)     → # Task Management (仅当启用 TodoWrite 工具时)
vKz(J)     → # Asking questions (仅当启用 AskUserQuestion 时)
kHq()      → Hooks 使用提示
EKz($, J)  → # Doing tasks (核心编码规则)
kKz()      → system-reminder 说明 + 无限上下文声明
LKz(J, D)  → # Tool usage policy (Task/Explore agent, 并行调用, 技能)
tV6        → 安全策略 (CTF/pentesting 限制)
RKz(J)     → Todo 工具强提醒
yKz()      → # Code References (file_path:line_number)
动态段      → session_memory, auto_memory, env_info, language, output_style, mcp_instructions, scratchpad
```

**代码 (cli.js:433864-433877):**

```javascript
async function qN(A, q, K, Y) {
    // 标准路径系统提示词构建
    let z = NHq(); // 检查变体标志
    if (z === "tengu_vinteuil_phrase") return vHq(A, q, K, Y); // 简化路径

    let [H, $, O] = await Promise.all([Dv(w), GuA(), WuA(q, K)]);
    let _ = jq(), J = new Set(A.map((W) => W.name));

    // 技能命令检测
    let D = H.map(W => `/${W.userFacingName()}`).length > 0 && J.has(jJ)
        ? `- /<skill-name> ... Use the ${jJ} tool to execute them.` : "";

    // 动态段注册
    let j = [
        bd("session_memory", () => LHq()),
        ud("auto_memory", () => P0A(), "MEMORY.md is read from disk each turn"),
        ud("ant_model_override", () => RHq(), "GrowthBook feature value can change"),
        bd("env_info", () => WuA(q, K)),
        bd("language", () => yHq(_.language)),
        ud("output_style", () => CHq($), "User can change mid-session"),
        ud("mcp_instructions", () => SHq(Y), "MCP servers connect/disconnect"),
        bd("scratchpad", () => bHq())
    ];

    // 拼接所有段
    return [VKz($), NKz($), TKz(J), vKz(J), kHq(), EKz($, J),
            kKz(), LKz(J, D), tV6, RKz(J), yKz(), ...M]
           .filter(W => W !== null);
}
```

### 1.3 简化路径 (`vHq`) 组装流程

```
CKz($)     → 基础身份 (Agent 变体)
SKz(_)     → # System (工具规则、权限模式、system-reminder、hooks)
hKz()      → # Doing tasks (简化版，面向 Agent SDK)
IKz()      → # Executing actions with care (可逆性/爆炸半径评估)
xKz(_, w)  → # Using your tools (详细工具使用规则)
bKz()      → # Tone and style (简化版)
动态段      → 与标准路径类似
```

### 1.4 核心提示词内容

#### 基础身份 (cli.js:433609-433619)

```javascript
function VKz(A) {
    return `
You are an interactive CLI tool that helps users ${
    A !== null
        ? 'according to your "Output Style" below...'
        : "with software engineering tasks."
} Use the instructions below and the tools available to you to assist the user.

${tV6}  // 安全策略
IMPORTANT: You must NEVER generate or guess URLs for the user...`
}
```

#### Tone & Style (cli.js:433623-433635)

```javascript
function NKz(A) {
    if (A !== null) return null; // 有自定义 Output Style 时跳过
    return `# Tone and style
- Only use emojis if the user explicitly requests it.
- Your output will be displayed on a command line interface.
  Your responses should be short and concise.
- Output text to communicate with the user; all text you output
  outside of tool use is displayed to the user.
- NEVER create files unless they're absolutely necessary.
- Do not use a colon before tool calls.

# Professional objectivity
Prioritize technical accuracy and truthfulness over validating
the user's beliefs...

# No time estimates
Never give time estimates or predictions for how long tasks
will take...`
}
```

#### Doing tasks (cli.js:433700-433711)

```javascript
function EKz(A, q) {
    return `# Doing tasks
- NEVER propose changes to code you haven't read.
- Be careful not to introduce security vulnerabilities (OWASP top 10).
- Avoid over-engineering. Only make changes that are directly requested.
  - Don't add features, refactor code, or make "improvements" beyond what was asked.
  - Don't add error handling for scenarios that can't happen.
  - Don't create helpers or abstractions for one-time operations.
- Avoid backwards-compatibility hacks. If something is unused, delete it completely.`
}
```

#### 安全策略 (cli.js:433607)

```javascript
var tV6 = "IMPORTANT: Assist with authorized security testing, defensive security,
CTF challenges, and educational contexts. Refuse requests for destructive techniques,
DoS attacks, mass targeting, supply chain compromise, or detection evasion for
malicious purposes. Dual-use security tools require clear authorization context:
pentesting engagements, CTF competitions, security research, or defensive use cases.";
```

### 1.5 关键变量映射

| 变量 | 行号 | 内容 |
|------|------|------|
| `N8A` | 125407 | `"You are Claude Code, Anthropic's official CLI for Claude."` |
| `et8` | 125408 | Agent SDK 变体身份 |
| `tV6` | 433607 | 安全策略文本 |
| `jV9` | 236172 | Memory 注入 header: `"Codebase and user instructions..."` |
| `V4` | — | Bash 工具名 |
| `wq` | — | Read 工具名 |
| `Cq` | — | Edit 工具名 |
| `X5` | — | Write 工具名 |
| `Yz` | — | Glob 工具名 |
| `wY` | — | Grep 工具名 |
| `DK` | — | Task 工具名 |
| `kH` | — | AskUserQuestion 工具名 |
| `jJ` | — | Skill 工具名 |

---

## 2. 工具系统 (Tools)

### 2.1 内置工具清单

| 变量名 | 工具名 | 类型 | 描述 |
|--------|--------|------|------|
| `V4` | **Bash** | 执行 | 命令执行，支持沙箱 |
| `wq` | **Read** | 只读 | 读取文件（支持 PDF, 图片, Jupyter） |
| `X5` | **Write** | 写入 | 创建/覆盖文件 |
| `Cq` | **Edit** | 写入 | 精确字符串替换编辑 |
| `Yz` | **Glob** | 只读 | 文件模式匹配搜索 |
| `wY` | **Grep** | 只读 | 基于 ripgrep 的内容搜索 |
| `DK` | **Task** | 调度 | 子代理启动和管理 |
| `y$` | **WebFetch** | 只读 | 网页内容抓取和分析 |
| — | **WebSearch** | 只读 | 网络搜索 |
| `kH` | **AskUserQuestion** | 交互 | 向用户提问 |
| `jJ` | **Skill** | 调度 | 技能调用 |
| `TO.name` | **TodoWrite** | 状态 | 任务管理 (TaskCreate/TaskUpdate/TaskList) |
| `$O6` | **ExitPlanMode** | 控制 | 退出规划模式 |
| — | **EnterPlanMode** | 控制 | 进入规划模式 |
| `rj` | **NotebookEdit** | 写入 | Jupyter Notebook 编辑 |
| — | **SendMessage** | 通信 | 团队消息发送 |
| — | **TeamCreate** | 团队 | 创建团队 |
| — | **TeamDelete** | 团队 | 删除团队 |

### 2.2 工具定义结构

每个工具通过 **Zod JSON Schema** 定义参数 (cli.js:327421 附近)：

```javascript
// Task 工具 schema 示例
{
    subagent_type: z.string().describe("The type of specialized agent to use"),
    prompt: z.string(),
    description: z.string(),
    name: z.string().optional(),
    model: z.enum(["sonnet", "opus", "haiku"]).optional(),
    run_in_background: z.boolean().optional(),
    resume: z.string().optional(),
    team_name: z.string().optional(),
    mode: z.enum(["acceptEdits", "bypassPermissions", "default", ...]).optional(),
    max_turns: z.number().optional()
}
```

### 2.3 工具提示词规则

提示词中明确了工具使用优先级 (cli.js:433844-433845)：

```
1. Read > cat/head/tail     — 读文件用 Read
2. Edit > sed/awk           — 编辑用 Edit
3. Write > echo/heredoc     — 创建文件用 Write
4. Glob > find/ls           — 查文件用 Glob
5. Grep > grep/rg           — 搜内容用 Grep
6. Bash                     — 仅用于真正的系统命令
```

---

## 3. Hook 系统

### 3.1 事件类型 (cli.js:46538)

```javascript
xx = [
    "PreToolUse",          // 工具执行前
    "PostToolUse",         // 工具成功后
    "PostToolUseFailure",  // 工具失败后
    "Notification",        // 通知
    "UserPromptSubmit",    // 用户提交提示
    "SessionStart",        // 会话开始
    "SessionEnd",          // 会话结束
    "Stop",                // Agent 完成
    "SubagentStart",       // 子代理启动
    "SubagentStop",        // 子代理停止
    "PreCompact",          // 压缩前
    "PermissionRequest",   // 权限请求
    "Setup",               // 设置
    "TeammateIdle",        // 队友空闲
    "TaskCompleted"        // 任务完成
]
```

### 3.2 Hook 类型定义

**三种 Hook 执行方式 (cli.js:46549-46570):**

#### Command Hook

```javascript
z.object({
    type: z.literal("command"),
    command: z.string(),          // Shell 命令
    timeout: z.number().optional(),
    statusMessage: z.string().optional(),  // Spinner 消息
    once: z.boolean().optional(),          // 只执行一次
    async: z.boolean().optional()          // 异步不阻塞
})
```

#### Prompt Hook

```javascript
z.object({
    type: z.literal("prompt"),
    prompt: z.string(),           // LLM 提示词 ($ARGUMENTS 占位符)
    timeout: z.number().optional(),
    model: z.string().optional(), // 默认使用小快模型
    statusMessage: z.string().optional(),
    once: z.boolean().optional()
})
```

#### Agent Hook

```javascript
z.object({
    type: z.literal("agent"),
    prompt: z.string(),           // 验证描述 ($ARGUMENTS 占位符)
    timeout: z.number().optional(), // 默认 60 秒
    model: z.string().optional(),   // 默认 Haiku
    statusMessage: z.string().optional(),
    once: z.boolean().optional()
})
```

### 3.3 Matcher 系统 (cli.js:46571-46573)

```javascript
dz8 = z.object({
    matcher: z.string().optional(), // 匹配模式 (如工具名 "Write")
    hooks: z.array(pz8)             // 匹配时执行的 hooks
});

rE = z.partialRecord(z.enum(xx), z.array(dz8)); // 事件 → matcher 数组
```

### 3.4 Hook 配置示例

```json
{
    "hooks": {
        "PostToolUse": [{
            "matcher": { "tools": ["BashTool"] },
            "hooks": [{ "type": "command", "command": "echo Done" }]
        }],
        "PreToolUse": [{
            "matcher": "Write",
            "hooks": [{
                "type": "command",
                "command": "lint-check $FILE"
            }]
        }]
    }
}
```

### 3.5 Hook 执行流程

```
事件触发 → 检查 hookEvent 是否已注册 → 匹配 matcher
→ 执行 hook (command/prompt/agent)
→ 处理退出码:
   - 0: 成功
   - 2: 阻塞错误
→ 处理 JSON 输出:
   - allow/deny/ask 决策
   - updatedInput 修改工具参数
```

### 3.6 启动时 Hook (cli.js:241472)

```javascript
Uv9 = ["SessionStart", "Setup"]; // 这些在会话启动时自动触发
```

---

## 4. 子代理系统 (Subagents)

### 4.1 内置代理类型

| 类型 | 行号 | 模型 | 工具权限 | 颜色 | 用途 |
|------|------|------|----------|------|------|
| **Bash** | 242264 | inherit | `[Bash]` | — | 命令执行专家 |
| **general-purpose** | 242276 | inherit | `["*"]` 全部 | — | 通用代理 |
| **Explore** | 242456 | **haiku** | 只读 (禁用 Task/Edit/Write/NotebookEdit) | — | 快速代码搜索 |
| **Plan** | 242523 | inherit | 只读 (同 Explore) | — | 架构规划 |
| **statusline-setup** | 242302 | **sonnet** | `[Read, Edit]` | orange | 状态栏配置 |

### 4.2 Bash 代理 (cli.js:242250-242272)

```javascript
{
    agentType: "Bash",
    whenToUse: "Command execution specialist for running bash commands.",
    tools: [Bash],
    model: "inherit",
    getSystemPrompt: () => `You are a command execution specialist for Claude Code.

Guidelines:
- Execute commands precisely as instructed
- For git operations, follow git safety protocols
- Report command output clearly and concisely
- If a command fails, explain the error and suggest solutions
- Use command chaining (&&) for dependent operations
- Quote paths with spaces properly`
}
```

### 4.3 General-purpose 代理 (cli.js:242276-242298)

```javascript
{
    agentType: "general-purpose",
    whenToUse: "General-purpose agent for researching complex questions,
                searching for code, and executing multi-step tasks.",
    tools: ["*"],  // 全部工具
    getSystemPrompt: () => `You are an agent for Claude Code...

Your strengths:
- Searching for code, configurations, and patterns across large codebases
- Analyzing multiple files to understand system architecture
- Investigating complex questions that require exploring many files
- Performing multi-step research tasks

Guidelines:
- For file searches: Use Grep or Glob broadly. Use Read for specific paths.
- For analysis: Start broad and narrow down.
- Be thorough: Check multiple locations, consider different naming conventions.
- NEVER create files unless absolutely necessary.
- Return file paths as absolute paths.`
}
```

### 4.4 Explore 代理 (cli.js:242430-242465)

```javascript
{
    agentType: "Explore",
    model: "haiku",           // 使用最快模型
    disallowedTools: [Task, ExitPlanMode, Edit, Write, NotebookEdit],
    criticalSystemReminder_EXPERIMENTAL: "CRITICAL: This is a READ-ONLY task.",
    getSystemPrompt: () => `You are a codebase exploration specialist...

Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path
- Use Bash ONLY for read-only operations (ls, git status, git log...)
- NEVER use Bash for: mkdir, touch, rm, cp, mv, git add, git commit...

NOTE: You are meant to be a fast agent that returns output as quickly as possible.
- Make efficient use of tools
- Wherever possible spawn multiple parallel tool calls`
}
```

### 4.5 Plan 代理 (cli.js:242468-242532)

```javascript
{
    agentType: "Plan",
    model: "inherit",         // 继承主模型
    disallowedTools: [Task, ExitPlanMode, Edit, Write, NotebookEdit],
    criticalSystemReminder_EXPERIMENTAL: "CRITICAL: This is a READ-ONLY task.",
    getSystemPrompt: () => `You are a software architect and planning specialist...

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===

Your Process:
1. Understand Requirements
2. Explore Thoroughly (Glob, Grep, Read; Bash only for read-only)
3. Design Solution
4. Detail the Plan

Required Output:
### Critical Files for Implementation
List 3-5 files most critical for implementing this plan:
- path/to/file1.ts - [Brief reason]
- path/to/file2.ts - [Brief reason]`
}
```

### 4.6 子代理路由逻辑 (cli.js:323122-323185)

```javascript
// subagent_type 参数到代理类型的映射
if (A?.subagent_type && A.subagent_type !== Vu1.agentType) {
    if (A.subagent_type === "worker") return "Task";
    return A.subagent_type;  // 直接映射
}
```

---

## 5. 技能系统 (Skills)

### 5.1 SKILL.md 加载流程 (cli.js:233079-233152)

```
$Q7(directory, namespace, ...) {
  1. 检查 directory/SKILL.md 是否存在
     → 存在: 解析为单个技能，返回
  2. 否则: 遍历子目录
     → 检查每个 subdir/SKILL.md
     → 解析 frontmatter + content
     → 注册为命令
  3. 返回技能列表
}
```

**代码 (cli.js:233079-233111):**

```javascript
async function $Q7(A, q, K, Y, z, w) {
    let $ = [];
    if (!H.existsSync(A)) return [];

    let O = path.join(A, "SKILL.md");
    if (H.existsSync(O)) {
        if (Xx(H, O, w)) return $;  // 文件大小检查
        let J = H.readFileSync(O, { encoding: "utf-8" });
        let { frontmatter: X, content: D } = _0(J, O); // 解析 frontmatter
        let j = `${q}:${basename(A)}`;  // 命名空间:名称
        let M = { filePath: O, baseDir: dirname(O), frontmatter: X, content: D };
        let W = Bb1(j, M, K, Y, z, true, { isSkillMode: true });
        if (W) $.push(W);
        return $;
    }

    // 遍历子目录
    let _ = H.readdirSync(A);
    for (let J of _) {
        if (!J.isDirectory() && !J.isSymbolicLink()) continue;
        let D = path.join(A, J.name, "SKILL.md");
        if (H.existsSync(D)) {
            // ... 同上解析逻辑
            let G = `${q}:${J.name}`;  // 命名空间:子目录名
        }
    }
    return $;
}
```

### 5.2 技能发现路径

| 位置 | 作用域 |
|------|--------|
| `~/.claude/skills/` | 用户级 |
| `.claude/skills/` | 项目级 |
| 插件包内 `skills/` | 插件级 |

### 5.3 Frontmatter 支持字段 (cli.js:328416)

```
type              # 类型
progressMessage   # 进度消息
contentLength     # 内容长度
argNames          # 参数名
model             # 使用的模型
source            # 来源
pluginInfo        # 插件信息
disableNonInteractive # 禁止非交互模式
skillRoot         # 技能根目录
context           # 上下文
agent             # 代理配置
getPromptForCommand # 命令提示词
frontmatterKeys   # frontmatter 键
name              # 名称
description       # 描述
hasUserSpecifiedDescription # 用户是否指定了描述
isEnabled         # 是否启用
isHidden          # 是否隐藏
aliases           # 别名
isMcp             # 是否 MCP
argumentHint      # 参数提示
whenToUse         # 何时使用
version           # 版本
disableModelInvocation # 禁止模型调用
userInvocable     # 用户可调用
loadedFrom        # 加载来源
immediate         # 立即执行
userFacingName    # 用户可见名称
```

### 5.4 技能目录结构

```
.claude/skills/
├── commit/
│   └── SKILL.md          # /commit 技能
├── review-pr/
│   └── SKILL.md          # /review-pr 技能
└── custom-skill/
    └── SKILL.md          # 自定义技能
```

---

## 6. Memory 系统 (CLAUDE.md)

### 6.1 加载层级 (cli.js:236102-236124)

```javascript
function AU7(projectDir, currentFile, processedPaths) {
    let Y = [];

    // 1. 项目级 CLAUDE.md (需要 projectSettings 权限)
    if (rJ("projectSettings")) {
        Y.push(...eL(path.join(projectDir, "CLAUDE.md"), "Project", processedPaths, false));
        Y.push(...eL(path.join(projectDir, ".claude", "CLAUDE.md"), "Project", processedPaths, false));
    }

    // 2. 本地覆盖 (需要 localSettings 权限)
    if (rJ("localSettings")) {
        Y.push(...eL(path.join(projectDir, "CLAUDE.local.md"), "Local", processedPaths, false));
    }

    // 3. 规则目录
    let rulesDir = path.join(projectDir, ".claude", "rules");
    Y.push(...loadRules({ rulesDir, type: "Project", conditionalRule: false }));

    // 4. 条件规则 (基于 glob 匹配当前文件)
    Y.push(...loadConditionalRules(currentFile, rulesDir, "Project", processedPaths, false));

    return Y;
}
```

### 6.2 完整加载优先级

| 优先级 | 类型 | 路径 | 说明 |
|--------|------|------|------|
| 1 (最高) | Enterprise | `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS) | IT 管理 |
| 2 | Project | `./CLAUDE.md` | 项目根 (可 git 跟踪) |
| 3 | Project | `./.claude/CLAUDE.md` | .claude 目录 |
| 4 | Rules | `./.claude/rules/*.md` | 规则目录 |
| 5 | User | `~/.claude/CLAUDE.md` | 用户全局 |
| 6 (最低) | Local | `./CLAUDE.local.md` | 本地覆盖 (不跟踪) |

### 6.3 注入方式

Memory 内容通过特殊 header 注入上下文 (cli.js:236172)：

```
"Codebase and user instructions are shown below. Be sure to adhere to these
instructions. IMPORTANT: These instructions OVERRIDE any default behavior and
you MUST follow them exactly as written."
```

### 6.4 安全限制

| 限制 | 值 | 行号 |
|------|------|------|
| 大文件警告阈值 | 40,000 字符 | `qp` @ 236173 |
| IMPORTANT 标记长度限制 | 3,000 字符 | `cD1` @ 236174 |
| 嵌套深度限制 | 5 层 | `PV9` @ 236175 |
| 外部包含检测 | 阻止第三方仓库外部引用 | `g0A()` @ 236157 |

### 6.5 文件变更监听 (cli.js:237283)

```javascript
// 当以下文件变化时触发重新加载
if (q.includes("CLAUDE.md") || q.includes("CLAUDE.local.md") || q.includes(".claude/rules/"))
    return true;
```

### 6.6 条件规则 (Conditional Rules)

规则文件可以在 frontmatter 中指定 `globs`，只在当前文件匹配时才加载：

```javascript
function s$6(A, q, K, Y, z) {
    return bq1({
        rulesDir: q,
        type: K,
        conditionalRule: true
    }).filter((H) => {
        if (!H.globs || H.globs.length === 0) return false;
        return minimatch.default().add(H.globs).ignores(currentFile);
    });
}
```

---

## 7. 设置系统 (Settings)

### 7.1 配置文件层级 (cli.js:106198-106303)

| 优先级 | 类型 | 路径 | 说明 |
|--------|------|------|------|
| 1 (最高) | Managed | `C:\ProgramData\ClaudeCode\managed-settings.json` (Win) | IT 部署 |
| 2 | Remote | `remote-settings.json` | 远程同步 |
| 3 | Project | `.claude/settings.json` | 项目级 (可 git 跟踪) |
| 4 | Local | `.claude/settings.local.json` | 本地覆盖 (不跟踪) |
| 5 (最低) | User | `~/.claude/settings.json` | 用户全局 |

### 7.2 Schema 定义 (cli.js:35821)

```javascript
var h98 = "https://json.schemastore.org/claude-code-settings.json";
```

### 7.3 关键设置项

```json
{
    "permissions": { /* 工具权限配置 */ },
    "hooks": { /* Hook 事件配置 */ },
    "model": "claude-opus-4-6",
    "env": { /* 环境变量 */ },
    "sandbox": { /* 沙箱配置 */ },
    "extraKnownMarketplaces": { /* 额外插件市场 */ }
}
```

### 7.4 设置显示 (cli.js:201295-201299)

```javascript
"User settings (~/.claude/settings.json)"
"Project settings (.claude/settings.json)"
"Local settings (.claude/settings.local.json)"
```

### 7.5 Cowork 模式 (cli.js:106280-106281)

```javascript
// Cowork 环境使用不同的设置文件名
if (vV1() || _6(process.env.CLAUDE_CODE_USE_COWORK_PLUGINS))
    return "cowork_settings.json";
return "settings.json";
```

---

## 8. 插件系统 (Plugins)

### 8.1 插件目录结构

```
plugin/
├── .claude-plugin/
│   ├── plugin.json          # 插件元数据
│   └── marketplace.json     # 市场发布信息
├── commands/                # 斜杠命令 (*.md)
├── agents/                  # 自定义子代理
├── skills/                  # 技能 (SKILL.md)
├── hooks/hooks.json         # Hook 配置
└── .mcp.json                # MCP 服务器配置
```

### 8.2 plugin.json 加载 (cli.js:361345)

```javascript
let $ = path.join(pluginDir, ".claude-plugin", "plugin.json");
```

### 8.3 marketplace.json 发现 (cli.js:360673-360687)

```javascript
// 从 URL 安装
w = path.join(z, A.path || ".claude-plugin/marketplace.json");

// 从本地目录安装
w = path.join(A.path, ".claude-plugin", "marketplace.json");
```

### 8.4 命名空间隔离

插件命令使用 `plugin-name:command` 格式避免命名冲突：
- 用户技能: `/commit`
- 插件技能: `/my-plugin:commit`

### 8.5 插件安装管理 (cli.js:217225)

```javascript
// 同步 installed_plugins.json 与 settings.json 中的 enabledPlugins
"Syncing installed_plugins.json with enabledPlugins from all settings.json files"
```

### 8.6 Marketplace 配置 (cli.js:46753-46767)

```javascript
// 市场来源定义
z.object({
    path: z.string().optional()
        .describe("Path to marketplace.json within repo (defaults to .claude-plugin/marketplace.json)")
})

// 本地市场
z.object({
    path: z.string()
        .describe("Local directory containing .claude-plugin/marketplace.json")
})
```

---

## 9. MCP 集成

### 9.1 传输方式 (cli.js:46578)

```javascript
xiz = z.enum(["stdio", "sse", "sse-ide", "http", "ws", "sdk"]);
```

| 传输方式 | 说明 |
|----------|------|
| `stdio` | 标准输入输出 (本地进程) |
| `sse` | Server-Sent Events |
| `sse-ide` | IDE 专用 SSE |
| `http` | HTTP (推荐) |
| `ws` | WebSocket |
| `sdk` | SDK 内嵌 |

### 9.2 作用域 (cli.js:46578)

```javascript
lB6 = z.enum(["local", "user", "project", "dynamic", "enterprise", "claudeai", "managed"]);
```

### 9.3 stdio 传输配置 (cli.js:46579-46582)

```javascript
iB6 = z.object({
    type: z.literal("stdio").optional(),
    command: z.string().min(1, "Command cannot be empty"),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).optional()
});
```

### 9.4 SSE 传输配置 (cli.js:46583+)

```javascript
BwK = z.object({
    type: z.literal("sse"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional()
});
```

### 9.5 OAuth 支持 (cli.js:46583-46585)

```javascript
cz8 = z.object({
    clientId: z.string(),
    callbackPort: z.number().int().positive().optional()
});
```

### 9.6 MCP 工具命名

工具格式: `mcp__<server-name>__<tool-name>`

### 9.7 MCP 指令注入 (cli.js:433879-433890)

```javascript
function uKz(A) {
    let K = A.filter(z => z.type === "connected").filter(z => z.instructions);
    if (K.length === 0) return null;
    return `# MCP Server Instructions

The following MCP servers have provided instructions for how to use their tools:

${K.map(z => `## ${z.name}\n${z.instructions}`).join("\n\n")}`;
}
```

### 9.8 MCP CLI 命令 (cli.js:433892+)

```javascript
function hHq(A) {
    return `# MCP CLI Command

You have access to an \`mcp-cli\` CLI command for interacting with MCP servers.

**MANDATORY PREREQUISITE - THIS IS A HARD REQUIREMENT**
...`;
}
```

---

## 10. 关键设计模式

### 10.1 懒加载 (`v()` 包装器)

几乎所有模块都用 `v(() => { ... })` 包装，实现按需初始化：

```javascript
var jl7 = v(() => {
    Dl7 = {
        agentType: "Bash",
        whenToUse: "...",
        tools: [V4],
        model: "inherit",
        getSystemPrompt: () => ov9
    }
});
```

### 10.2 动态 vs 静态提示词段

| 函数 | 类型 | 说明 |
|------|------|------|
| `bd(key, fn)` | 静态 | 会话级别不变，加载一次 |
| `ud(key, fn, reason)` | 动态 | 每轮重新评估 |

```javascript
// 静态：会话开始后不变
bd("session_memory", () => LHq())
bd("env_info", () => WuA(q, K))
bd("language", () => yHq(_.language))

// 动态：每轮可能变化
ud("auto_memory", () => P0A(), "MEMORY.md is read from disk each turn")
ud("output_style", () => CHq($), "User can change mid-session")
ud("mcp_instructions", () => SHq(Y), "MCP servers connect/disconnect")
```

### 10.3 Feature Flags

通过 `y8("tengu_*", default)` 查询特性标志：

| Flag | 用途 |
|------|------|
| `tengu_coral_fern` | 过去会话搜索功能 |
| `tengu_vinteuil_phrase` | 简化系统提示词变体 |
| `tengu_system_prompt_global_cache` | 全局缓存优化 |
| `tengu_write_claudemd` | CLAUDE.md 写入事件跟踪 |

### 10.4 权限系统

工具执行前检查权限，用户可配置自动允许/拒绝/询问：

```
用户权限模式 → 工具调用 → 权限检查
  ├── 自动允许 → 直接执行
  ├── 需要询问 → 弹出权限确认
  └── 拒绝 → 返回拒绝消息
```

提示词中说明 (cli.js:433814)：
> "Tools are executed in a user-selected permission mode. When you attempt to call a tool that is not automatically allowed, the user will be prompted so that they can approve or deny."

### 10.5 上下文管理

- **自动压缩**: `"The system will automatically compress prior messages as it approaches context limits."` (cli.js:433814)
- **无限上下文**: `"The conversation has unlimited context through automatic summarization."` (cli.js:433714)
- **PreCompact Hook**: 压缩前触发，允许自定义处理

### 10.6 安全沙箱

- macOS: `sandbox-exec` 进程隔离
- Docker: 容器化执行
- 工具级别的读写权限控制

---

## 架构总图

```
┌──────────────────────────────────────────────────────────────────┐
│                      CLI Entry Point                              │
│                   (cli.js - single bundle)                        │
│                   v2.1.37 / Node.js ≥ 18                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              System Prompt Builder                         │   │
│  │  ┌─────────┬──────────┬─────────┬──────────┬──────────┐  │   │
│  │  │Identity │Tone/Style│Doing    │Tool      │Code Refs │  │   │
│  │  │VKz/CKz  │NKz/bKz   │EKz/hKz  │LKz/xKz   │yKz       │  │   │
│  │  └─────────┴──────────┴─────────┴──────────┴──────────┘  │   │
│  │  ┌─────────┬──────────┬─────────┬──────────┬──────────┐  │   │
│  │  │Task Mgmt│Questions │Safety   │Actions   │Dynamic   │  │   │
│  │  │TKz      │vKz       │tV6      │IKz       │ud()/bd() │  │   │
│  │  └─────────┴──────────┴─────────┴──────────┴──────────┘  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              │                                    │
│         ┌────────────────────┼────────────────────┐              │
│         ▼                    ▼                    ▼              │
│  ┌────────────┐    ┌─────────────────┐    ┌──────────────┐      │
│  │  Memory     │    │     Settings    │    │   Plugins    │      │
│  │ (CLAUDE.md) │    │   (4-tier)      │    │(.claude-     │      │
│  │             │    │                 │    │  plugin/)    │      │
│  │ Enterprise  │    │ Managed         │    │             │      │
│  │ Project     │    │ Project         │    │ commands/   │      │
│  │ Rules       │    │ Local           │    │ skills/     │      │
│  │ User        │    │ User            │    │ agents/     │      │
│  │ Local       │    │                 │    │ hooks/      │      │
│  └──────┬─────┘    └────────┬────────┘    └──────┬───────┘      │
│         │                   │                     │              │
│         └───────────┬───────┴─────────────────────┘              │
│                     ▼                                             │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                    Tool Execution Layer                     │   │
│  │                                                            │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────┐ │   │
│  │  │ Bash │ │ Read │ │Write │ │ Edit │ │ Glob │ │ Grep  │ │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └───────┘ │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────┐ │   │
│  │  │ Task │ │Fetch │ │Search│ │ Ask  │ │Skill │ │ Todo  │ │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └───────┘ │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────────┐            │   │
│  │  │ Plan │ │ Send │ │ Team │ │NotebookEdit  │            │   │
│  │  │ Mode │ │ Msg  │ │Create│ │              │            │   │
│  │  └──────┘ └──────┘ └──────┘ └──────────────┘            │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             │                                     │
│    ┌────────────────────────┼────────────────────────┐           │
│    ▼                        ▼                        ▼           │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────────┐   │
│  │   Hooks       │  │   Subagents    │  │       MCP          │   │
│  │  (15 events)  │  │                │  │  (6 transports)    │   │
│  │               │  │ ┌────────────┐ │  │                    │   │
│  │ PreToolUse    │  │ │  Explore   │ │  │ stdio / sse / http │   │
│  │ PostToolUse   │  │ │  (haiku)   │ │  │ sse-ide / ws / sdk │   │
│  │ SessionStart  │  │ ├────────────┤ │  │                    │   │
│  │ SessionEnd    │  │ │   Plan     │ │  │ 7 scopes:          │   │
│  │ Stop          │  │ │ (inherit)  │ │  │ local/user/project │   │
│  │ SubagentStart │  │ ├────────────┤ │  │ dynamic/enterprise │   │
│  │ SubagentStop  │  │ │   Bash     │ │  │ claudeai/managed   │   │
│  │ PreCompact    │  │ │  (inherit) │ │  │                    │   │
│  │ ...           │  │ ├────────────┤ │  │ Tool naming:       │   │
│  │               │  │ │  General   │ │  │ mcp__srv__tool     │   │
│  │ 3 hook types: │  │ │  Purpose   │ │  │                    │   │
│  │ - command     │  │ │  (all *)   │ │  │ Instructions →     │   │
│  │ - prompt      │  │ ├────────────┤ │  │ system prompt      │   │
│  │ - agent       │  │ │ Statusline │ │  │                    │   │
│  │               │  │ │  (sonnet)  │ │  │                    │   │
│  └──────────────┘  │ └────────────┘ │  └────────────────────┘   │
│                     └────────────────┘                            │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                    Skills System                           │   │
│  │                                                            │   │
│  │  Discovery: ~/.claude/skills/ + .claude/skills/ + plugins  │   │
│  │  Loading: Lazy (name/description only → full on trigger)   │   │
│  │  Format: SKILL.md with YAML frontmatter                    │   │
│  │  Namespace: plugin-name:skill-name                         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              Feature Flags (tengu_*)                       │   │
│  │  tengu_coral_fern      → 过去会话搜索                       │   │
│  │  tengu_vinteuil_phrase → 简化提示词                         │   │
│  │  tengu_system_prompt_global_cache → 全局缓存               │   │
│  │  tengu_write_claudemd  → CLAUDE.md 写入跟踪                │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 附录: 源码分析方法

### 获取源码

```bash
# 下载、解压、美化
curl -sL "$(curl -s https://registry.npmjs.org/@anthropic-ai/claude-code/latest | jq -r '.dist.tarball')" \
  -o claude-code.tgz && tar -xzf claude-code.tgz && npx js-beautify --replace package/cli.js
```

### 关键搜索模式

```bash
# 系统提示词
grep -n "You are Claude" package/cli.js
grep -n "# Tone and style\|# Doing tasks\|# Tool usage policy" package/cli.js

# 工具定义
grep -n "Executes a given bash command\|Reads a file from\|Fast file pattern" package/cli.js

# Hook 事件
grep -n "PreToolUse\|PostToolUse\|UserPromptSubmit\|SessionStart" package/cli.js

# 子代理
grep -n "subagent_type\|agentType.*Explore\|agentType.*Plan" package/cli.js

# 技能
grep -n "SKILL\.md\|loadSkill" package/cli.js

# Memory
grep -n "CLAUDE\.md\|CLAUDE\.local\.md" package/cli.js

# 设置
grep -n "settings\.json\|settings\.local\.json" package/cli.js

# 插件
grep -n "plugin\.json\|\.claude-plugin" package/cli.js

# MCP
grep -n "mcp__\|MCP.*transport" package/cli.js

# Feature flags
grep -n "tengu_" package/cli.js
```

### 注意事项

1. **变量名已 minified** — 搜索字符串字面量，而非变量名
2. **模板字符串** — 大量使用反引号模板和 `${}`
3. **懒加载** — `v(() => { ... })` 包装器
4. **Zod Schema** — 使用 `z.object()` / `z.string()` 等验证
