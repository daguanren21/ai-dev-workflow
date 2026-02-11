# Claude Code Multi-Agent 深度源码分析

> 基于 `@anthropic-ai/claude-code` CLI v2.1.x (`cli.js`, 7587 行 bundled) 的逆向分析。
> 本文档记录真实的混淆/打包后变量名，可直接在 cli.js 中搜索定位。

---

## 目录

1. [概述](#1-概述)
2. [Spawn 路由](#2-spawn-路由)
3. [Backend 注册与检测](#3-backend-注册与检测)
4. [InProcessRunner 核心循环](#4-inprocessrunner-核心循环)
5. [消息轮询 (Poll Loop)](#5-消息轮询-poll-loop)
6. [Mailbox 系统](#6-mailbox-系统)
7. [AsyncLocalStorage 上下文](#7-asynclocalstorage-上下文)
8. [共享任务列表](#8-共享任务列表)
9. [Shutdown 协议](#9-shutdown-协议)
10. [Agent 间协作时序图](#10-agent-间协作时序图)

---

## 1. 概述

### 分析方法

- 直接阅读 `cli.js` bundled 产物，搜索字符串字面量（`"shutdown_request"`、`"in-process"`、`"agent loop"`）定位代码区域
- 从导出映射块（`uA(module, { exportName: () => localName })`）反推函数真实语义
- 跟踪调用链：Task tool → spawn → runner → poll → mailbox

### cli.js 基本信息

| 属性 | 值 |
|------|-----|
| 文件 | `node_modules/@anthropic-ai/claude-code/cli.js` |
| 行数 | 7587（minified，每行极长） |
| 打包方式 | esbuild bundle，变量名被缩短但保留了日志字符串 |
| 关键日志前缀 | `[inProcessRunner]`、`[BackendRegistry]`、`[TeammateMailbox]` |

### 名称映射速查表

| 混淆名 | 真实含义 | 类型 |
|--------|---------|------|
| `rZY` | spawn 路由入口 | function |
| `Bx4` | spawn 包装（调用 rZY） | function |
| `nZY` | in-process spawn 路径 | async function |
| `lZY` | pane spawn 路径（使用已检测 backend） | async function |
| `iZY` | pane spawn 路径（新 tmux window） | async function |
| `nB` | `isInProcessEnabled` | function |
| `Cs` | `detectAndGetBackend` | async function |
| `sI4` | `InProcessBackend` 类 | class |
| `BZY` | `getTeammateExecutor` | function |
| `fZY` | InProcessRunner 核心循环 | async function |
| `RM6` | 调度执行（fire-and-forget 调用 fZY） | function |
| `ZZY` | 消息轮询（poll loop） | async function |
| `NR` | agent loop iterator（async generator） | async function* |
| `P46` | `runWithTeammateContext` | function |
| `C01` | subagent context nesting | function |
| `A8A` | AsyncLocalStorage 实例 | variable |
| `lk` | `getTeammateContext` | function |
| `lM` | `isInProcessTeammate` | function |
| `Q3` | `getTeamName` | function |
| `B5` | `getAgentName` | function |
| `_0` | `getAgentId` | function |
| `dp` | `readMailbox` | function |
| `X9` | `writeToMailbox` | function |
| `_31` | `readUnreadMessages` | function |
| `im1` | `markMessagesAsRead` | function |
| `lm1` | `markMessageAsReadByIndex` | function |
| `Ds` | `getInboxPath` | function |
| `nO1` | task `create` | function |
| `$U` | task `get` (read single) | function |
| `QC` | task `update` | function |
| `N46` | task `delete` | function |
| `zX` | task `listAll` | function |
| `_8A` | task `claim` | function |
| `O8A` | task `addDependency` | function |
| `GZY` | `findClaimableTask` | function |
| `PZY` | `buildClaimPrompt` | function |
| `aI4` | `autoClaimTask` | function |
| `Ms` | parse shutdown_request message | function |
| `fZ` | parse plan_approval message | function |
| `BD6` | parse plan_approval_response | function |
| `xj1` | build shutdown_request object | function |
| `nm1` | build idle_notification object | function |
| `oI4` | send idle notification to leader | function |
| `jZY` | write message to leader's mailbox | function |
| `jj1` | `spawnInProcessTeammate` | async function |
| `sm1` | extract summary from conversation | function |

---

## 2. Spawn 路由

### 入口链

```
Task tool .call()
  → Bx4(input, toolUseContext)         // 包装函数
    → rZY(input, toolUseContext)        // 路由入口
```

### `rZY` — 三条路径

```javascript
async function rZY(A, q) {
  if (nB())              return nZY(A, q);  // in-process 路径
  if (A.use_splitpane !== !1) return lZY(A, q);  // pane 路径（检测 backend）
  return iZY(A, q);                              // pane 路径（新 tmux window）
}
```

| 路径 | 函数 | 条件 | 说明 |
|------|------|------|------|
| in-process | `nZY` | `nB()` 返回 true | 同进程运行，EventEmitter 通信 |
| pane (detected) | `lZY` | `use_splitpane !== false` | 使用 `Cs()` 检测 tmux/iTerm2 |
| pane (new window) | `iZY` | fallback | 新建 tmux window |

### `nB()` — isInProcessEnabled 判断逻辑

```javascript
function nB() {
  if (q4())  // 非交互式 session
    return true;

  let A = uZY();     // 读取用户配置的 backend mode
  if (A === "in-process") return true;
  if (A === "tmux")      return false;

  // 默认：不在 tmux 内则使用 in-process
  return !yM6();  // yM6 = isInsideTmux
}
```

### `nZY` — In-Process Spawn 路径

```javascript
async function nZY(A, q) {
  let { name, prompt, agent_type, plan_mode_required } = A;
  let teamName = A.team_name || state.teamContext?.teamName;

  // 1. 生成 agentId = "{name}@{teamName}"
  let agentId = Pv(fvA(NvA(name, teamName)), teamName);

  // 2. 调用 jj1 创建 teammate 上下文
  let result = await jj1({ name, teamName, prompt, color, ... }, q);

  // 3. 启动 agent 循环（fire-and-forget）
  RM6({
    identity: { agentId, agentName, teamName, ... },
    taskId: result.taskId,
    prompt,
    teammateContext: result.teammateContext,
    toolUseContext: q,
    abortController: result.abortController,
    ...
  });

  // 4. 更新 UI state
  setAppState((s) => ({ ...s, teamContext: { ... } }));
}
```

---

## 3. Backend 注册与检测

### 模块导出映射（`Tx4`）

```javascript
var Tx4 = {};
uA(Tx4, {
  resetBackendDetection:  () => FZY,
  registerTmuxBackend:    () => YvA,
  registerITermBackend:   () => OvA,
  isInProcessEnabled:     () => nB,
  getTeammateExecutor:    () => BZY,
  getInProcessBackend:    () => Nx4,
  getCachedBackend:       () => AW1,
  getBackendByType:       () => DvA,
  detectAndGetBackend:    () => Cs,
});
```

### `Cs()` — detectAndGetBackend

```javascript
async function Cs() {
  if (TR) return TR;  // TR = cached detection result

  let insideTmux = await ph();    // ph = isInsideTmux
  let inITerm2   = v31();         // v31 = isInITerm2

  if (insideTmux) {
    // tmux 优先
    let backend = uM6();  // 创建 TmuxBackend 实例
    TR = { backend, isNative: true, needsIt2Setup: false };
    return TR;
  }

  if (inITerm2) {
    // 用户可能偏好 tmux over iTerm2
    if (Mx4()) { /* skip iTerm2 */ }
    else {
      let backend = Vx4();  // 创建 ITermBackend 实例
      TR = { backend, isNative: true, ... };
      return TR;
    }
  }

  // fallback: in-process (no terminal multiplexer)
  ...
}
```

### `BZY()` — getTeammateExecutor

```javascript
function BZY(useInProcess = false) {
  if (useInProcess && nB())
    return Nx4();       // → InProcessBackend (sI4)
  return mZY();         // → PaneBackendExecutor
}
```

### `sI4` — InProcessBackend 类

```javascript
class sI4 {
  type = "in-process";
  context = null;

  setContext(A) { this.context = A; }
  async isAvailable() { return true; }
  async spawn(A) {
    // 使用 context 中的 toolUseContext 进行 in-process spawn
    ...
  }
}
```

---

## 4. InProcessRunner 核心循环

### `fZY` — 完整 agent 循环

这是整个多 Agent 系统最核心的函数。它实现了 **handle → idle → poll → wake** 的无限循环。

```javascript
async function fZY(A) {
  let { identity, taskId, prompt, teammateContext,
        toolUseContext, abortController, model, ... } = A;

  // ── 构建 system prompt ──
  let systemPrompt = [...await tV(tools, model), YTA];
  if (agentDefinition?.getSystemPrompt()) {
    systemPrompt.push(`# Custom Agent Instructions\n${...}`);
  }

  let history = [];
  let currentPrompt = formatAsTeamMessage("team-lead", prompt);
  let shouldExit = false;

  // ── 主循环 ──
  while (!abortController.signal.aborted && !shouldExit) {

    // ── Phase 1: Handle（双重上下文嵌套）──
    await P46(teammateContext, async () => {        // AsyncLocalStorage 层 1
      return C01(subagentContext, async () => {     // AsyncLocalStorage 层 2

        // 标记为 running
        setAppState(task => ({ ...task, status: "running", isIdle: false }));

        // 调用 NR (agent loop iterator)
        for await (let event of NR({
          agentDefinition,
          promptMessages: [userMessage],
          toolUseContext,
          isAsync: true,
          forkContextMessages: history,
          model,
          ...
        })) {
          if (abortController.signal.aborted) break;
          history.push(event);
          // 更新进度 UI
        }
      });
    });

    // ── Phase 2: Idle ──
    setAppState(task => ({ ...task, isIdle: true }));

    // 发送 idle 通知给 team-lead
    if (!wasAlreadyIdle) {
      oI4(agentName, color, teamName, {
        idleReason: wasInterrupted ? "interrupted" : "available",
        summary: sm1(history)
      });
    }

    // ── Phase 3: Poll（等待新消息）──
    let result = await ZZY(identity, abortController, taskId, getAppState, setAppState, parentSessionId);

    // ── Phase 4: Wake ──
    switch (result.type) {
      case "shutdown_request":
        currentPrompt = formatAsTeamMessage(result.request?.from || "team-lead", result.originalMessage);
        break;
      case "new_message":
        currentPrompt = formatAsTeamMessage(result.from, result.message, result.color);
        break;
      case "aborted":
        shouldExit = true;
        break;
    }
  }
}
```

### `RM6` — Fire-and-Forget 调度

```javascript
function RM6(A) {
  fZY(A).catch((err) => {
    h(`[inProcessRunner] Unhandled error in ${A.identity.agentId}: ${err}`);
  });
}
```

`fZY` 被 `RM6` 以 fire-and-forget 方式调用，不阻塞 spawn 调用方。Agent 循环在 Node.js 事件循环中独立运行。

### `NR` — Agent Loop Iterator（Async Generator）

```javascript
async function* NR({
  agentDefinition, promptMessages, toolUseContext,
  canUseTool, isAsync, forkContextMessages,
  model, maxTurns, ...
}) {
  // 选择模型
  let resolvedModel = X46(agentDefinition.model, mainLoopModel, model, ...);

  // 主循环：LLM 调用 → tool 执行 → yield 结果
  while (turns < maxTurns && !aborted) {
    let response = await callLLM(resolvedModel, messages, tools);
    yield { type: "assistant", message: response };

    for (let toolCall of response.toolCalls) {
      let result = await executeTool(toolCall);
      yield { type: "user", message: toolResult };
    }

    if (noMoreToolCalls) break;
  }
}
```

`NR` 是一个 async generator，每次 yield 一个 `assistant` 或 `user` 类型的事件。外层 `fZY` 通过 `for await...of` 消费这些事件并更新 UI。

---

## 5. 消息轮询 (Poll Loop)

### `ZZY` — 核心 Poll 函数

Agent 在 idle 状态下通过此函数等待新消息或可认领任务。

```javascript
async function ZZY(identity, abortController, taskId, getAppState, setAppState, parentSessionId) {
  let pollCount = 0;

  while (!abortController.signal.aborted) {

    // ── 优先级 1: UI 层 pending 用户消息 ──
    let task = (await getAppState()).tasks[taskId];
    if (task?.pendingUserMessages.length > 0) {
      let msg = task.pendingUserMessages[0];
      // 从队列中移除
      setAppState(dequeue first message);
      return { type: "new_message", message: msg, from: "user" };
    }

    // 500ms 间隔（首次跳过）
    if (pollCount > 0) await WZY(500);   // WZY = sleep(ms)
    pollCount++;

    // ── 优先级 2: Shutdown 请求 ──
    let messages = dp(identity.agentName, identity.teamName);  // 读 mailbox
    for (let i = 0; i < messages.length; i++) {
      let parsed = Ms(messages[i].text);  // Ms = parseShutdownRequest
      if (parsed) {
        lm1(agentName, teamName, i);  // 标记已读
        return { type: "shutdown_request", request: parsed, originalMessage: messages[i].text };
      }
    }

    // ── 优先级 3: Leader 消息 ──
    let leaderIdx = messages.findIndex(m => !m.read && m.from === rz);  // rz = "team-lead"
    if (leaderIdx === -1) {
      // ── 优先级 4: 任意 Peer 消息 ──
      leaderIdx = messages.findIndex(m => !m.read);
    }
    if (leaderIdx !== -1) {
      lm1(agentName, teamName, leaderIdx);
      return { type: "new_message", message: messages[leaderIdx].text, from: messages[leaderIdx].from };
    }

    // ── 优先级 5: 自动认领任务 ──
    let claimPrompt = aI4(parentSessionId, identity.agentName);
    if (claimPrompt) {
      return { type: "new_message", message: claimPrompt, from: "task-list" };
    }
  }

  return { type: "aborted" };
}
```

### 消息优先级

```
UI pending messages  >  shutdown_request  >  leader message  >  peer message  >  auto-claim task
```

### 轮询常量

```javascript
var DZY = 500;  // 500ms poll interval
```

---

## 6. Mailbox 系统

### 存储路径

```javascript
function Ds(agentName, teamName) {
  // ~/.claude/{teamName}/inboxes/{agentName}.json
  let teamDir = iO1(teamName);
  let agentDir = iO1(agentName);
  return path.join(MW(), teamDir, "inboxes", `${agentDir}.json`);
}
```

每个 agent 有一个独立的 JSON 文件作为 inbox，格式为 `Message[]`。

### 函数映射

| 函数 | 真实含义 | 行为 |
|------|---------|------|
| `dp(name, team)` | `readMailbox` | 读取 inbox JSON，返回 `Message[]` |
| `_31(name, team)` | `readUnreadMessages` | `dp()` 结果过滤 `!read` |
| `X9(recipient, msg, team)` | `writeToMailbox` | 加锁 → 读 → append → 写 |
| `im1(name, team)` | `markMessagesAsRead` | 加锁 → 全部标记 `read: true` |
| `lm1(name, team, index)` | `markMessageAsReadByIndex` | 加锁 → 标记指定 index |

### 文件锁

`X9`、`im1`、`lm1` 均使用 `cm1.lockSync(path, { lockfilePath })` 进行互斥。`cm1` 是内置的 `proper-lockfile` 兼容实现（bundled 在 cli.js 中，提供 `lock`/`lockSync`/`unlock`/`unlockSync`/`check`/`checkSync` API）。

```javascript
// X9 (writeToMailbox) 简化:
function X9(recipient, message, teamName) {
  let inboxPath = Ds(recipient, teamName);
  let lockPath  = `${inboxPath}.lock`;

  if (!exists(inboxPath))
    writeFileSync(inboxPath, "[]");

  let unlock;
  try {
    unlock = cm1.lockSync(inboxPath, { lockfilePath: lockPath });
    let messages = dp(recipient, teamName);  // read
    messages.push({ ...message, read: false });
    writeFileSync(inboxPath, JSON.stringify(messages, null, 2));
  } finally {
    if (unlock) unlock();
  }
}
```

### In-Process 模式的消息投递

在 in-process 模式下，`jZY` 用于将 idle 通知写入 leader 的 mailbox：

```javascript
function jZY(agentName, text, color, teamName) {
  X9("team-lead", {
    from: agentName,
    text: text,
    timestamp: new Date().toISOString(),
    color: color
  }, teamName);
}
```

实际的消息唤醒机制依赖 `ZZY` 的 500ms 轮询——即使是 in-process 模式，mailbox 仍使用文件系统而非 EventEmitter（与 README.md 中的简化描述略有不同）。

---

## 7. AsyncLocalStorage 上下文

### 实例定义

```javascript
import { AsyncLocalStorage as _G5 } from "async_hooks";

var A8A;  // AsyncLocalStorage instance

// 初始化块
var uT = v(() => {
  A8A = new _G5;
});
```

`_G5` 是 Node.js `AsyncLocalStorage` 的打包别名。`A8A` 是全局唯一的实例。

### 导出映射（`Y8A`）

```javascript
var Y8A = {};
uA(Y8A, {
  waitForTeammatesToBecomeIdle: () => K8A,
  setDynamicTeamContext:        () => JG5,
  runWithTeammateContext:       () => P46,
  isTeammate:                   () => Kz,
  isTeamLead:                   () => iM,
  isPlanModeRequired:           () => zy1,
  isInProcessTeammate:          () => lM,
  hasWorkingInProcessTeammates: () => q8A,
  hasActiveInProcessTeammates:  () => f46,
  getTeammateContext:           () => lk,
  getTeammateColor:             () => R$,
  getTeamName:                  () => Q3,
  getParentSessionId:           () => yn,
  getDynamicTeamContext:        () => Yy1,
  getAgentName:                 () => B5,
  getAgentId:                   () => _0,
  createTeammateContext:        () => Z46,
  clearDynamicTeamContext:      () => XG5,
});
```

### 核心函数

```javascript
// 获取当前 agent 的上下文（从 AsyncLocalStorage）
function lk() {
  return A8A.getStore();
}

// 在指定上下文中执行回调（注入到当前 async 调用链）
function P46(context, callback) {
  return A8A.run(context, callback);
}

// 检查当前调用链是否在 in-process teammate 中
function lM() {
  return A8A.getStore() !== undefined;
}

// 获取当前 agent 的 ID
function _0() {
  let ctx = lk();
  if (ctx) return ctx.agentId;
  return BT?.agentId;  // BT = dynamic context fallback
}

// 获取当前 agent 的名称
function B5() {
  let ctx = lk();
  if (ctx) return ctx.agentName;
  return BT?.agentName;
}

// 获取当前 team 名称
function Q3(fallback) {
  let ctx = lk();
  if (ctx) return ctx.teamName;
  if (BT?.teamName) return BT.teamName;
  return fallback?.teamName;
}
```

### 双重上下文嵌套

`fZY` 中使用了两层 `AsyncLocalStorage.run()`：

```javascript
await P46(teammateContext, async () => {        // 层 1: teammate context
  return C01(subagentContext, async () => {     // 层 2: subagent context
    // 在此闭包内，任何 async 调用都能通过
    // lk() 获取 teammate context
    // D_A() 获取 subagent context
    ...
  });
});
```

- **层 1 (`P46`)**：注入 teammate 身份（agentId、teamName、color 等）
- **层 2 (`C01`)**：注入 subagent 运行信息（agentType、计量等）

`C01` 使用独立的 `CS7` (`AsyncLocalStorage` 实例)：

```javascript
var CS7;
CS7 = new RO9;  // RO9 = AsyncLocalStorage alias

function C01(context, callback) {
  return CS7.run(context, callback);
}
```

---

## 8. 共享任务列表

### 文件结构

```
~/.claude/tasks/{teamName}/
  ├── 1.json          ← Task #1
  ├── 2.json          ← Task #2
  ├── N.json          ← Task #N
  ├── .lock           ← 全局计数器锁
  └── .counter        ← 自增 ID 计数器
```

### CRUD 函数

#### `nO1` — create

```javascript
function nO1(sessionId, taskData) {
  let lockPath = dt8(sessionId);     // 获取 .lock 路径
  let unlock;
  try {
    unlock = wy1.default.lockSync(lockPath);  // wy1 = lockfile module
    let nextId = String(WG5(sessionId) + 1);  // WG5 = getCounter
    let task = { id: nextId, ...taskData };
    let filePath = Hy1(sessionId, nextId);    // Hy1 = getTaskFilePath
    writeFileSync(filePath, JSON.stringify(task, null, 2));
    lO1();  // invalidate cache
    return nextId;
  } finally {
    if (unlock) unlock();
  }
}
```

#### `$U` — get (read single)

```javascript
function $U(sessionId, taskId) {
  let filePath = Hy1(sessionId, taskId);
  try {
    let content = readFileSync(filePath, "utf-8");
    let data = JSON.parse(content);
    let result = MG5.safeParse(data);  // Zod schema validation
    if (!result.success) return null;
    return result.data;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
```

#### `QC` — update

```javascript
function QC(sessionId, taskId, updates) {
  let existing = $U(sessionId, taskId);
  if (!existing) return null;
  let updated = { ...existing, ...updates, id: taskId };
  let filePath = Hy1(sessionId, taskId);
  writeFileSync(filePath, JSON.stringify(updated, null, 2));
  lO1();  // invalidate cache
  return updated;
}
```

#### `N46` — delete

```javascript
function N46(sessionId, taskId) {
  let filePath = Hy1(sessionId, taskId);
  if (!exists(filePath)) return false;
  try {
    // 更新 counter 如果需要
    removeFile(filePath);
    // 清除其他 task 中对此 task 的 blocks/blockedBy 引用
    let allTasks = zX(sessionId);
    for (let task of allTasks) {
      let newBlocks = task.blocks.filter(id => id !== taskId);
      let newBlockedBy = task.blockedBy.filter(id => id !== taskId);
      if (changed) QC(sessionId, task.id, { blocks: newBlocks, blockedBy: newBlockedBy });
    }
    lO1();
    return true;
  } catch { return false; }
}
```

#### `zX` — listAll

```javascript
function zX(sessionId) {
  let taskDir = ik(sessionId);        // ik = getTaskDir
  if (!exists(taskDir)) return [];
  let files = readDir(taskDir);       // w8A = readdirSync
  let tasks = [];
  for (let file of files) {
    if (!file.endsWith(".json")) continue;
    let taskId = file.replace(".json", "");
    let task = $U(sessionId, taskId);
    if (task) tasks.push(task);
  }
  return tasks;
}
```

#### `_8A` — claim

```javascript
function _8A(sessionId, taskId, ownerName, options = {}) {
  let filePath = Hy1(sessionId, taskId);
  if (!exists(filePath)) return { success: false, reason: "task_not_found" };

  let unlock;
  try {
    unlock = wy1.default.lockSync(filePath);
    let task = $U(sessionId, taskId);
    if (!task) return { success: false, reason: "task_not_found" };

    // 已被其他人认领
    if (task.owner && task.owner !== ownerName)
      return { success: false, reason: "already_claimed", task };

    // 已完成
    if (task.status === "completed")
      return { success: false, reason: "already_resolved", task };

    // 检查 blockedBy（所有依赖必须已完成）
    let allTasks = zX(sessionId);
    let openIds = new Set(allTasks.filter(t => t.status !== "completed").map(t => t.id));
    for (let dep of task.blockedBy) {
      if (openIds.has(dep)) return { success: false, reason: "blocked" };
    }

    // 成功认领
    QC(sessionId, taskId, { owner: ownerName, status: "in_progress" });
    return { success: true };
  } finally {
    if (unlock) unlock();
  }
}
```

### 自动认领（Auto-Claim）

#### `GZY` — findClaimableTask

```javascript
function GZY(tasks) {
  // 计算未完成的 task ID 集合
  let openIds = new Set(
    tasks.filter(t => t.status !== "completed").map(t => t.id)
  );

  return tasks.find(t => {
    if (t.status !== "pending") return false;
    if (t.owner) return false;
    // blockedBy 中的 task 全部完成（不在 openIds 中）
    return t.blockedBy.every(dep => !openIds.has(dep));
  });
}
```

#### `PZY` — buildClaimPrompt

```javascript
function PZY(task) {
  let prompt = `Complete all open tasks. Start with task #${task.id}:\n\n ${task.subject}`;
  if (task.description) prompt += `\n\n${task.description}`;
  return prompt;
}
```

#### `aI4` — autoClaimTask

```javascript
function aI4(sessionId, agentName) {
  try {
    let allTasks = zX(sessionId);      // 读取所有 task
    let claimable = GZY(allTasks);     // 查找可认领的
    if (!claimable) return;

    let result = _8A(sessionId, claimable.id, agentName);  // 尝试认领
    if (!result.success) return;

    QC(sessionId, claimable.id, { status: "in_progress" });
    return PZY(claimable);  // 返回 prompt
  } catch (e) {
    return;
  }
}
```

自动认领在 `ZZY`（poll loop）中作为最低优先级被调用：当没有任何消息时，agent 会检查任务列表是否有可认领的任务。

---

## 9. Shutdown 协议

### 消息类型判断函数

```javascript
// 解析 shutdown_request
function Ms(text) {
  try {
    let parsed = BS4.safeParse(JSON.parse(text));  // BS4 = shutdownRequest zod schema
    if (parsed.success) return parsed.data;
  } catch {}
  return null;
}

// 解析 plan_approval 消息
function fZ(text) {
  try {
    let parsed = mS4.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {}
  return null;
}

// 解析 plan_approval_response
function BD6(text) {
  try {
    let parsed = FS4.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {}
  return null;
}
```

### 构建 Shutdown 请求

```javascript
function xj1(params) {
  return {
    type: "shutdown_request",
    requestId: params.requestId,
    from: params.from,
    reason: params.reason,
    timestamp: new Date().toISOString()
  };
}

function dNA(params) {  // shutdown_approved
  return {
    type: "shutdown_approved",
    requestId: params.requestId,
    from: params.from,
    timestamp: new Date().toISOString(),
    paneId: params.paneId,
    backendType: params.backendType
  };
}

function cNA(params) {  // shutdown_rejected
  return {
    type: "shutdown_rejected",
    requestId: params.requestId,
    from: params.from,
    reason: params.reason,
    timestamp: new Date().toISOString()
  };
}
```

### Shutdown 在 Poll Loop 中的优先处理

在 `ZZY` 中，shutdown 消息被赋予最高优先级（仅次于 UI pending messages）：

```javascript
// 遍历所有未读消息，优先查找 shutdown_request
for (let i = 0; i < messages.length; i++) {
  let parsed = Ms(messages[i].text);
  if (parsed) {
    let skippedCount = messages.slice(0, i).filter(m => !m.read).length;
    // 日志：prioritized over {skippedCount} unread messages
    markAsRead(i);
    return { type: "shutdown_request", request: parsed, ... };
  }
}
```

### Idle 通知

```javascript
function nm1(agentName, options) {
  return {
    type: "idle_notification",
    from: agentName,
    timestamp: new Date().toISOString(),
    idleReason: options?.idleReason,    // "available" | "interrupted"
    summary: options?.summary,          // 最后一次对话的摘要
    completedTaskId: options?.completedTaskId,
    completedStatus: options?.completedStatus,
    failureReason: options?.failureReason
  };
}

function oI4(agentName, color, teamName, options) {
  let notification = nm1(agentName, options);
  jZY(agentName, JSON.stringify(notification), color, teamName);
  // → 写入 team-lead 的 mailbox
}
```

---

## 10. Agent 间协作时序图

### 完整流程：spawn → claim → execute → idle → wake → shutdown

```
Team Lead                    Worker A (researcher)          Worker B (implementer)
    │                              │                              │
    ├── TeamCreate("project") ─────┤──────────────────────────────┤
    │   创建 ~/.claude/teams/project/config.json                  │
    │                              │                              │
    ├── TaskCreate(task1) ─────────┤──────────────────────────────┤
    ├── TaskCreate(task2) ─────────┤──────────────────────────────┤
    ├── TaskCreate(task3,          │                              │
    │   blockedBy:[1,2]) ──────────┤──────────────────────────────┤
    │                              │                              │
    ├── Task(spawn worker-a) ──────►                              │
    │   nZY → jj1 → RM6 → fZY     │                              │
    │                              ├── NR() → LLM 调用            │
    │                              │                              │
    ├── Task(spawn worker-b) ──────┤──────────────────────────────►
    │   nZY → jj1 → RM6 → fZY     │                       fZY 启动
    │                              │                              │
    │                              ├── handle 完成                │
    │                              ├── oI4 → idle 通知            │
    │                              ├── ZZY (poll loop) 开始       │
    │                              │   ┌───────────────────┐      │
    │                              │   │ poll #1:           │      │
    │                              │   │  dp() → 无消息     │      │
    │                              │   │  aI4() → claim #1  │      │
    │                              │   │  ← 返回 claim prompt│     │
    │                              │   └───────────────────┘      │
    │                              │                              │
    │                              ├── wake: 处理 task #1         │
    │                              │                              ├── ZZY poll
    │                              │                              │   aI4() → claim #2
    │                              │                              ├── 处理 task #2
    │                              │                              │
    │                              ├── task #1 完成               │
    │                              │   QC(id=1, status=completed) │
    │                              │   → task3.blockedBy=[2]      │
    │                              │                              │
    │                              ├── oI4 → idle 通知            │
    │                              ├── ZZY poll...               │
    │                              │                              ├── task #2 完成
    │                              │                              │   QC(id=2, status=completed)
    │                              │                              │   → task3.blockedBy=[]
    │                              │                              │
    │                              │                              ├── oI4 → idle 通知
    │                              │                              ├── ZZY poll
    │                              │                              │   aI4() → claim #3 ✓
    │                              │                              │   (blockedBy 已清空)
    │                              │                              │
    │                              │                              ├── 处理 task #3
    │                              │                              ├── task #3 完成
    │                              │                              ├── oI4 → idle
    │                              │                              │
    │◄── idle notification ────────┤                              │
    │◄── idle notification ────────┤──────────────────────────────┤
    │                              │                              │
    ├── shutdown_request ──────────►                              │
    │   X9("worker-a", msg, team)  │                              │
    │                              ├── ZZY poll                   │
    │                              │   Ms() → 匹配 shutdown      │
    │                              │   ← 传给 model 处理         │
    │                              ├── model 调用 shutdown_response│
    │                              ├── exit                       │
    │                              │                              │
    ├── shutdown_request ──────────┤──────────────────────────────►
    │                              │                              ├── ZZY → Ms() match
    │                              │                              ├── exit
    │                              │                              │
    ├── TeamDelete() ──────────────┤──────────────────────────────┤
    │   删除 ~/.claude/teams/project/                             │
    │   删除 ~/.claude/tasks/project/                             │
    ▼                              ▼                              ▼
```

### 关键数据流总结

```
┌─────────────────────────────────────────────────────────┐
│  fZY (agent loop)                                        │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ P46/C01  │    │   NR()   │    │  ZZY()   │           │
│  │ context  │───►│ LLM loop │───►│ poll loop│──┐        │
│  │ inject   │    │ (handle) │    │ (idle)   │  │        │
│  └──────────┘    └──────────┘    └──────────┘  │        │
│                                        │        │        │
│       ┌────────────────────────────────┘        │        │
│       ▼                                         ▼        │
│  ┌──────────┐                          ┌──────────┐     │
│  │   dp()   │  ← 读 inbox 文件         │  aI4()   │     │
│  │ mailbox  │                          │ auto-    │     │
│  │ read     │                          │ claim    │     │
│  └──────────┘                          └──────────┘     │
│       │                                     │            │
│       ▼                                     ▼            │
│  Ms() / fZ() / BD6()            GZY() → _8A() → QC()   │
│  消息类型判断                     查找 → 认领 → 更新     │
│                                                          │
│  → wake: 回到 NR() 处理新 prompt                        │
└─────────────────────────────────────────────────────────┘
```
