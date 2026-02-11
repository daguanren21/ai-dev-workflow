# Claude Code Agent Team 架构文档

> 基于 Claude Code CLI v2.1.x 源码分析，系统性描述 Agent Team（Multi-Agent 协作）的设计与实现。

---

## 目录

1. [概览](#1-概览)
2. [TeamCreate — 团队创建](#2-teamcreate--团队创建)
3. [Agent 生成 — Task Tool 路由](#3-agent-生成--task-tool-路由)
4. [In-Process Runner — 核心运行循环](#4-in-process-runner--核心运行循环)
5. [消息路由 — SendMessage](#5-消息路由--sendmessage)
6. [共享任务列表 — 文件系统存储](#6-共享任务列表--文件系统存储)
7. [Agent 生命周期](#7-agent-生命周期)
8. [关键设计决策](#8-关键设计决策)

---

## 1. 概览

### 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                   User Terminal / IDE                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Team Lead (orchestrator)               │  │
│  │  - TeamCreate / TeamDelete                         │  │
│  │  - TaskCreate / TaskList / TaskUpdate              │  │
│  │  - SendMessage (direct / broadcast)                │  │
│  │  - Task tool → spawn teammates                     │  │
│  └───────────┬────────────────────┬───────────────────┘  │
│              │                    │                       │
│    ┌─────────▼──────┐  ┌─────────▼──────┐               │
│    │  Teammate A     │  │  Teammate B     │  ...         │
│    │  (in-process)   │  │  (in-process)   │              │
│    │                 │  │                 │               │
│    │ AgentLoop:      │  │ AgentLoop:      │              │
│    │  idle → wake    │  │  idle → wake    │              │
│    │  → handle       │  │  → handle       │              │
│    │  → execute      │  │  → execute      │              │
│    │  → idle         │  │  → idle         │              │
│    └────────┬────────┘  └────────┬────────┘              │
│             │                    │                        │
└─────────────┼────────────────────┼────────────────────────┘
              │                    │
   ┌──────────▼────────────────────▼──────────┐
   │        Persistent Storage (filesystem)    │
   │                                           │
   │  ~/.claude/teams/{name}/                  │
   │    └─ config.json  (成员列表、元数据)      │
   │                                           │
   │  ~/.claude/tasks/{name}/                  │
   │    ├─ 1.json       (任务数据)             │
   │    ├─ 2.json                              │
   │    ├─ N.json                              │
   │    └─ .lock        (并发锁)               │
   │                                           │
   │  消息投递: EventEmitter (in-process)       │
   │           或 inbox 文件 (pane mode)        │
   └───────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 | 对应工具 |
|------|------|----------|
| **TeamCreate** | 创建团队目录、config.json | `TeamCreate` tool |
| **Task tool** | 路由并生成子 Agent | `Task` tool |
| **InProcessRunner** | Agent 运行循环、上下文隔离 | 内部模块 |
| **SendMessage** | Agent 间消息路由 | `SendMessage` tool |
| **TaskList** | 共享任务的 CRUD | `TaskCreate/List/Update/Get` tools |
| **TeamDelete** | 清理团队资源 | `TeamDelete` tool |

---

## 2. TeamCreate — 团队创建

### 创建流程

```
TeamCreate({ team_name: "my-project", description: "..." })
    │
    ├─ 1. 创建目录  ~/.claude/teams/my-project/
    ├─ 2. 创建目录  ~/.claude/tasks/my-project/
    ├─ 3. 写入 config.json（包含 team-lead 成员）
    └─ 4. 返回 team 配置
```

### config.json 结构

```json
{
  "name": "my-project",
  "description": "Working on feature X",
  "leadAgentId": "team-lead@my-project",
  "createdAt": 1706000000000,
  "members": [
    {
      "agentId": "team-lead@my-project",
      "name": "team-lead",
      "agentType": "team-lead",
      "color": "#4A90D9",
      "joinedAt": 1706000000000,
      "backendType": "in-process"
    },
    {
      "agentId": "worker-1@my-project",
      "name": "worker-1",
      "agentType": "general-purpose",
      "model": "haiku",
      "prompt": "Analyze the codebase...",
      "color": "#D94A4A",
      "joinedAt": 1706000001000,
      "backendType": "in-process",
      "cwd": "/path/to/project"
    }
  ]
}
```

### Member 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `agentId` | string | 唯一标识，格式 `{name}@{team}` |
| `name` | string | 人类可读名称，用于消息路由 |
| `agentType` | string | 类型：team-lead / Explore / general-purpose 等 |
| `backendType` | "in-process" \| "pane" | 执行后端 |
| `model` | string? | 模型：haiku / sonnet / opus |
| `prompt` | string? | 初始 prompt |
| `color` | string | 终端 UI 显示颜色 |

---

## 3. Agent 生成 — Task Tool 路由

### 路由逻辑

当 Team Lead 调用 `Task` tool 生成子 Agent 时：

```
Task({
  subagent_type: "general-purpose",
  name: "worker-1",
  team_name: "my-project",
  prompt: "实现用户认证模块",
  model: "sonnet"
})
    │
    ├─ 1. 选择 subagent_type → 决定工具集和权限
    ├─ 2. 决定 backend:
    │     ├─ tmux 环境 → pane runner (每个 agent 独立终端面板)
    │     └─ 其他环境 → in-process runner (同一进程内)
    ├─ 3. 创建 Member → 写入 config.json
    ├─ 4. 初始化隔离上下文 (AsyncLocalStorage)
    └─ 5. 启动 Agent 运行循环
```

### 两种 Backend

| 特性 | In-Process | Pane (tmux/iTerm2) |
|------|-----------|-------------------|
| 运行方式 | 同一 Node 进程内 | 独立终端面板 |
| 消息投递 | EventEmitter（内存） | 文件 inbox |
| 终端要求 | 任意终端 | 需要 tmux 或 iTerm2 |
| 切换查看 | Shift+Up/Down | 点击面板 |
| 并行上限 | ~7 agents | 受终端面板数限制 |

### Agent 类型与工具集

| Agent Type | 可用工具 | 适用场景 |
|-----------|---------|---------|
| `Explore` | Read, Glob, Grep, WebFetch... (只读) | 代码搜索、问题探索 |
| `general-purpose` | 全部工具 | 复杂多步骤任务 |
| `Plan` | 只读 + ExitPlanMode | 架构设计 |
| `Bash` | Bash 命令 | git、npm 操作 |
| 自定义 agent | 按 `.claude/agents/` 配置 | 特定领域 |

---

## 4. In-Process Runner — 核心运行循环

### 运行循环伪代码

```typescript
async function runAgent(name: string, prompt: string, ctx: AgentContext) {
  // AsyncLocalStorage 注入上下文
  asyncLocalStorage.run(ctx, async () => {
    let currentPrompt = prompt;

    while (!aborted) {
      // ── Phase 1: Handle（处理当前 prompt）──
      const response = await callLLM(currentPrompt, {
        tools: getToolsForAgentType(ctx.agentType),
        systemPrompt: buildSystemPrompt(ctx),
      });

      // 执行 LLM 返回的工具调用
      for (const toolCall of response.toolCalls) {
        await executeTool(toolCall);
      }

      // ── Phase 2: Idle（等待新消息）──
      notifyLeader({ type: "idle", agent: name });

      const message = await waitForMessage(name, abortSignal);

      // ── Phase 3: Wake（处理收到的消息）──
      if (message.type === "shutdown_request") {
        sendShutdownResponse(name, message.sender, message.requestId, true);
        break; // 退出循环
      }

      // 将消息注入为新的 prompt → 回到 Phase 1
      currentPrompt = message.content;
    }
  });
}
```

### AsyncLocalStorage 上下文隔离

```
┌─────────── Node.js 进程 ───────────┐
│                                     │
│  AsyncLocalStorage<AgentContext>     │
│                                     │
│  ┌─ Agent A context ─┐             │
│  │ agentId: "a@team"  │             │
│  │ teamName: "team"   │             │
│  │ taskDir: "..."     │             │
│  └────────────────────┘             │
│                                     │
│  ┌─ Agent B context ─┐             │
│  │ agentId: "b@team"  │             │
│  │ teamName: "team"   │             │
│  │ taskDir: "..."     │             │
│  └────────────────────┘             │
│                                     │
│  每个 agent 的 async 调用链          │
│  自动继承正确的 context              │
└─────────────────────────────────────┘
```

关键点：
- 多个 agent 共享同一 Node.js 进程和事件循环
- `AsyncLocalStorage` 让每个 agent 的异步调用链自动携带正确的上下文
- 不需要全局变量，不需要手动传参
- 工具调用时通过 `asyncLocalStorage.getStore()` 获取当前 agent 的上下文

---

## 5. 消息路由 — SendMessage

### 消息类型

| type | 说明 | 必填字段 |
|------|------|---------|
| `message` | 点对点消息 | recipient, content, summary |
| `broadcast` | 群发（开销=N-1条消息） | content, summary |
| `shutdown_request` | 请求 agent 关闭 | recipient |
| `shutdown_response` | 回复关闭请求 | request_id, approve |
| `plan_approval_response` | 审批计划 | request_id, recipient, approve |

### In-Process 消息投递流程

```
SendMessage(from: "lead", to: "worker-1", content: "开始任务3")
    │
    ├─ 1. 构建 TeamMessage 对象
    ├─ 2. 推入 worker-1 的 pendingQueue（内存数组）
    ├─ 3. EventEmitter.emit("msg:worker-1", message)
    │         │
    │         └─► worker-1 正在 waitForMessage() 中挂起
    │             → listener 被触发
    │             → Promise resolve
    │             → agent 从 idle 状态唤醒
    └─ 4. 返回消息对象
```

### waitForMessage 机制（idle → wake 的关键）

```typescript
function waitForMessage(agentName: string): Promise<TeamMessage> {
  // 快路径：队列已有消息 → 立即返回
  if (queue.length > 0) return Promise.resolve(queue.shift());

  // 慢路径：注册 EventEmitter listener → 挂起
  return new Promise((resolve) => {
    bus.once(`msg:${agentName}`, (msg) => resolve(msg));
  });
}
```

这是 agent 实现 **idle（挂起）→ wake（唤醒）** 的核心机制：
- Agent 处理完当前轮次后调用 `waitForMessage()` 挂起
- 其他 agent 通过 `sendMessage()` 投递消息
- EventEmitter 触发回调 → Promise resolve → agent 恢复执行

---

## 6. 共享任务列表 — 文件系统存储

### 存储结构

```
~/.claude/tasks/{team-name}/
    ├─ 1.json     ← Task 1
    ├─ 2.json     ← Task 2
    ├─ 3.json     ← Task 3
    └─ .lock      ← 文件锁（目录或 lockfile）
```

### Task JSON 结构

```json
{
  "id": "1",
  "subject": "Review authentication module",
  "description": "Review all files in app/services/auth/",
  "status": "in_progress",
  "owner": "worker-1",
  "activeForm": "Reviewing auth module...",
  "blockedBy": [],
  "blocks": ["3"],
  "createdAt": 1706000000000,
  "updatedAt": 1706000001000,
  "metadata": { "priority": "high" }
}
```

### 并发安全 — file-lock

多个 agent 可能同时读写同一个 task 文件。Claude Code 使用文件锁保证原子性：

```
Agent A: createTask()      Agent B: updateTask()
    │                          │
    ├─ acquireLock(.lock) ──── ├─ acquireLock(.lock) ← 等待
    ├─ read → modify → write   │      ...
    ├─ releaseLock(.lock) ──── ├─ 获得锁
    │                          ├─ read → modify → write
    │                          ├─ releaseLock(.lock)
```

### 依赖图 — blockedBy / blocks

```
Task 1 (no deps)  ──blocks──►  Task 3 (blockedBy: [1, 2])
Task 2 (no deps)  ──blocks──►  Task 3

当 Task 1 完成:
  → Task 3.blockedBy 变为 [2]（自动移除 1）
当 Task 2 完成:
  → Task 3.blockedBy 变为 []（可被认领）
```

### CRUD 操作映射

| 操作 | 工具 | 文件系统行为 |
|------|------|-------------|
| 创建 | `TaskCreate` | 写 `{nextId}.json` |
| 列表 | `TaskList` | 读所有 `*.json`，过滤 deleted |
| 获取 | `TaskGet` | 读 `{id}.json` |
| 更新 | `TaskUpdate` | 读 → 改 → 写 `{id}.json` |
| 认领 | `TaskUpdate(owner=)` | 设 owner + status=in_progress |
| 完成 | `TaskUpdate(status=completed)` | 标记完成 + 解除下游 blockedBy |

---

## 7. Agent 生命周期

### 状态机

```
              spawn
 ┌──────────┐      ┌──────────┐
 │ created  │─────►│ running  │◄─────────────────┐
 └──────────┘      └────┬─────┘                   │
                        │                          │
                   处理完毕                    收到消息
                        │                     (wake)
                        ▼                          │
                   ┌──────────┐                    │
                   │   idle   │────────────────────┘
                   └────┬─────┘
                        │
                  收到 shutdown_request
                        │
                        ▼
                   ┌──────────┐
                   │ shutdown │
                   └──────────┘
```

### 各状态说明

| 状态 | 说明 | 触发条件 |
|------|------|---------|
| **created** | Agent 已注册，尚未开始 | `Task` tool 调用 |
| **running** | 正在处理 prompt / 执行工具 | 初始 prompt 或被消息唤醒 |
| **idle** | 等待消息中，挂起在 `waitForMessage()` | 当前轮次处理完毕 |
| **shutdown** | 已退出 | 收到 `shutdown_request` 并批准 |

### Idle 通知

Agent 进入 idle 后会向 Team Lead 发送通知：
- Team Lead 可据此分配新任务或发送新指令
- Idle 是正常状态，不代表 agent 出错
- 发送消息给 idle agent 会立即唤醒它

### Shutdown 协议

```
Team Lead                           Worker Agent
    │                                    │
    ├── shutdown_request ──────────────► │
    │   { requestId: "abc" }             │
    │                                    ├── 保存状态
    │                                    ├── 清理资源
    │◄── shutdown_response ──────────────┤
    │   { requestId: "abc",              │
    │     approve: true }                │
    │                                    │ (进程退出)
    ├── TeamDelete() ─────────────────── X
    │   (清理目录)
```

---

## 8. 关键设计决策

### 为什么用 AsyncLocalStorage？

**问题**：多个 agent 在同一个 Node.js 进程中运行，如何隔离上下文？

**方案对比**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 全局变量 | 简单 | 无法隔离，并发冲突 |
| 手动传参 | 显式 | 每个函数都要加 ctx 参数 |
| **AsyncLocalStorage** | **透明、自动传播** | **需要 Node.js 12.17+** |
| Worker Threads | 真正隔离 | 通信开销大、内存占用高 |

**选择 AsyncLocalStorage 的理由**：
- 同一进程内零通信开销
- 异步调用链自动传播，无需改造所有函数签名
- 每个 agent 的工具调用自动获取正确的 team/task 上下文
- 与 Node.js 事件循环天然兼容

### 为什么用文件系统而非内存？

**问题**：任务列表和团队配置为什么不放在内存里？

**理由**：

1. **跨进程共享** — Pane 模式下每个 agent 是独立进程，内存无法共享
2. **持久化** — 进程崩溃后任务不丢失，可以 resume
3. **可观测性** — 用户可以直接 `cat` 查看任务状态，方便调试
4. **Git 友好** — JSON 文件天然支持 diff/merge
5. **UNIX 哲学** — 文件系统作为数据库，每个任务是独立文件
6. **并发安全** — 配合 file-lock，多进程安全读写

### 为什么消息用 EventEmitter 而非文件？

In-process 模式下的选择：

| 方案 | 延迟 | 适用场景 |
|------|------|---------|
| **EventEmitter** | **微秒级** | **同进程 agent** |
| 文件轮询 | 毫秒~秒级 | 跨进程 agent (pane 模式) |
| Socket/IPC | 毫秒级 | 分布式 agent |

In-process 模式选 EventEmitter 因为所有 agent 共享同一事件循环，消息投递本质上就是函数调用，零序列化开销。

---

## 附录：Mini 实现

`mini-agent-team/` 目录下包含简化版 TypeScript 实现，复现了上述核心机制：

| 文件 | 对应架构组件 |
|------|------------|
| `types.ts` | 核心类型定义 |
| `team.ts` | TeamCreate/Delete + config 管理 |
| `message.ts` | SendMessage + EventEmitter 路由 |
| `task.ts` | 共享任务列表 CRUD + file-lock |
| `agent.ts` | In-Process Runner + AsyncLocalStorage |
| `example.ts` | 完整演示：创建团队 → spawn agents → 协作 → shutdown |

运行方式：

```bash
npx tsx docs/claude-code-agent-team/mini-agent-team/example.ts
```
