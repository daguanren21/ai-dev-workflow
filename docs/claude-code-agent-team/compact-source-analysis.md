# Claude Code 上下文压缩（Compact）深度源码分析

> 基于 `@anthropic-ai/claude-code` CLI v2.1.x (`cli.js`, 7587 行 bundled) 的逆向分析。
> 本文档聚焦对话上下文管理：当 token 数接近模型窗口上限时，系统如何自动总结、压缩并恢复上下文。

---

## 目录

1. [概述](#1-概述)
2. [三层压缩架构](#2-三层压缩架构)
3. [阈值计算体系](#3-阈值计算体系)
4. [Micro-Compact — 静默裁剪](#4-micro-compact--静默裁剪)
5. [Auto-Compact — 自动总结](#5-auto-compact--自动总结)
6. [总结 Prompt 与 Summary 结构](#6-总结-prompt-与-summary-结构)
7. [上下文恢复 — Post-Compact 附件](#7-上下文恢复--post-compact-附件)
8. [Session Memory — 缓存加速](#8-session-memory--缓存加速)
9. [Token 消耗模型](#9-token-消耗模型)
10. [完整生命周期时序图](#10-完整生命周期时序图)

---

## 1. 概述

### 核心问题

LLM 的上下文窗口是有限的（200K 或 1M tokens）。当长时间对话导致 token 数逼近上限时，必须在"丢失历史"和"超出窗口"之间做出选择。

Claude Code 的解法：**周期性地用 LLM 生成结构化摘要，替换全部历史消息，同时恢复关键上下文（文件内容、任务列表等）**。

### 名称映射速查表

| 混淆名 | 真实含义 | 类型 |
|--------|---------|------|
| `pm` | micro-compact（裁剪旧 tool output） | function |
| `Qs4` | auto-compact 决策入口 | async function |
| `RFY` | 判断是否超过 auto-compact 阈值 | async function |
| `MW1` | **核心总结函数**（manual + auto 共用） | async function |
| `$s4` | 执行 LLM 总结调用 | async function |
| `UOA` | 构建总结请求 prompt（全量 compact） | function |
| `YR7` | 构建总结请求 prompt（部分 compact） | function |
| `ox1` | 将 summary 包装为新会话起始消息 | function |
| `B99` | 清理 summary 中的 XML 标签 | function |
| `qc` | 计算各类阈值并返回判断结果 | function |
| `yG` | 获取模型上下文窗口大小 | function |
| `a51` | 计算 effective window（窗口 - max_output） | function |
| `lg1` | 计算 auto-compact 触发阈值 | function |
| `vv` | 计算消息列表的总 token 数 | function |
| `PZ` | 计算最后一条消息的累积 token 数 | function |
| `um` | 检查 auto-compact 是否启用 | function |
| `Os4` | post-compact 文件恢复 | async function |
| `Xs4` | post-compact 任务列表恢复 | async function |
| `_s4` | post-compact todo list 恢复 | function |
| `mZ6` | session memory 缓存 compact | async function |
| `ws4` | partial compact（从指定消息开始） | async function |
| `ds4` | tool use summary 生成（简短） | async function |
| `o51` | 从 LLM 响应中提取 summary 文本 | function |
| `Bbq` | 基础上下文窗口大小常量 = 200,000 | constant |
| `EFY` | max_output_tokens 上限 = 20,000 | constant |
| `XSA` | auto-compact 缓冲区 = 13,000 | constant |
| `kFY` | 警告阈值偏移 = 20,000 | constant |
| `LFY` | 错误阈值偏移 = 20,000 | constant |
| `DSA` | blocking limit 安全边距 = 3,000 | constant |

---

## 2. 三层压缩架构

```
┌──────────────────────────────────────────────────────────────┐
│                     对话进行中 (token 持续增长)                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Layer 1: Micro-Compact (pm)                           │  │
│  │                                                        │  │
│  │  触发条件: 每次 LLM 调用前自动执行                       │  │
│  │  机制: 裁剪旧的 tool_result 大体积输出                   │  │
│  │  LLM 调用: 无（纯内存操作）                              │  │
│  │  用户感知: 无                                            │  │
│  │  Token 消耗: 0                                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                           │                                   │
│                    tokens 仍然不够？                           │
│                           ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Layer 2: Auto-Compact (Qs4 → MW1)                     │  │
│  │                                                        │  │
│  │  触发条件: token count >= effective_window - 13000      │  │
│  │  机制: 调用 LLM 生成结构化 summary，替换全部历史         │  │
│  │  LLM 调用: 1 次（input ≈ 全部历史，output ≈ summary）  │  │
│  │  用户感知: 状态栏显示 "compacting"                       │  │
│  │  Token 消耗: ≈ 当前上下文大小                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                           │                                   │
│                    用户主动触发？                              │
│                           ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Layer 3: /compact 手动命令                             │  │
│  │                                                        │  │
│  │  触发条件: 用户输入 /compact [可选指令]                   │  │
│  │  机制: 同 Layer 2，但允许自定义总结指令                   │  │
│  │  LLM 调用: 1 次                                        │  │
│  │  用户感知: 主动操作，可看到 summary                      │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 触发位置 — 主查询循环 `fR`

三层压缩都在主查询循环 `fR`（async generator）的每次迭代开始时执行：

```javascript
async function* fR({ messages, systemPrompt, ... }) {
  while (true) {
    // ── Step 1: Micro-compact（每次都执行）──
    let { messages: compacted, compactionInfo } = pm(messages);
    if (compactionInfo?.boundaryMessage)
      yield compactionInfo.boundaryMessage;

    // ── Step 2: Auto-compact 检查 ──
    let { compactionResult } = await Qs4(
      messages, context, cacheSafeParams, querySource
    );
    if (compactionResult) {
      // summary 替换了全部历史
      // 继续用压缩后的消息进行 LLM 调用
    }

    // ── Step 3: 正常 LLM 调用 ──
    let response = await callLLM(compacted, systemPrompt, tools);
    yield response;
    // ...
  }
}
```

---

## 3. 阈值计算体系

### 函数调用链

```
yG(model)                    获取上下文窗口大小
  │                          200,000 或 1,000,000
  ▼
a51(model)                   effective window = 窗口 - max_output
  │                          180,000 或 980,000
  ▼
lg1(model)                   auto-compact 阈值 = effective - 13,000
  │                          167,000 或 967,000
  ▼
qc(currentTokens, model)     综合判断，返回多个阈值标志
```

### `yG` — 上下文窗口大小

```javascript
// Bbq = 200000（基础窗口）
function yG(model, provider) {
  // 新模型（Sonnet 4, Opus 4.6）→ 1M
  if (model.includes("[1m]") || (provider?.includes(DN1) && gbq(model)))
    return 1e6;   // 1,000,000

  // 其他所有模型 → 200K
  return Bbq;      // 200,000
}

function gbq(model) {
  let m = model.toLowerCase();
  return m.includes("claude-sonnet-4") || m.includes("opus-4-6");
}
```

### `a51` — Effective Window

```javascript
function a51(model) {
  // max_output_tokens，capped at EFY=20000
  let maxOutput = Math.min(jSA(model), EFY);
  return yG(model) - maxOutput;
}
// 200K 模型: 200,000 - 20,000 = 180,000
// 1M 模型:   1,000,000 - 20,000 = 980,000
```

### `lg1` — Auto-Compact 阈值

```javascript
function lg1(model) {
  let effective = a51(model);         // 180,000 或 980,000
  let threshold = effective - XSA;    // XSA = 13,000
  // 支持环境变量覆盖
  let override = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  if (override) {
    let pct = parseFloat(override);
    if (!isNaN(pct) && pct > 0 && pct <= 100) {
      let custom = Math.floor(effective * (pct / 100));
      return Math.min(custom, threshold);
    }
  }
  return threshold;
}
// 200K 模型: 180,000 - 13,000 = 167,000
// 1M 模型:   980,000 - 13,000 = 967,000
```

### `qc` — 综合阈值判断

```javascript
function qc(currentTokens, model) {
  let autoCompactThreshold = lg1(model);  // 167K 或 967K
  let effective = um() ? autoCompactThreshold : a51(model);
  let percentLeft = Math.max(0, Math.round((effective - currentTokens) / effective * 100));

  let warningThreshold  = effective - kFY;   // kFY = 20,000
  let errorThreshold    = effective - LFY;   // LFY = 20,000
  let blockingLimit     = yG(model) - DSA;   // DSA = 3,000

  return {
    percentLeft,                                      // 剩余百分比
    isAboveWarningThreshold:      currentTokens >= warningThreshold,
    isAboveErrorThreshold:        currentTokens >= errorThreshold,
    isAboveAutoCompactThreshold:  um() && currentTokens >= autoCompactThreshold,
    isAtBlockingLimit:            currentTokens >= blockingLimit
  };
}
```

### 阈值全景表

| 阈值 | 200K 模型 | 1M 模型 | 说明 |
|------|----------|---------|------|
| 上下文窗口 | 200,000 | 1,000,000 | `yG()` |
| Effective window | 180,000 | 980,000 | `a51()` = 窗口 - 20K |
| **Auto-compact 触发** | **167,000** | **967,000** | `lg1()` = effective - 13K |
| 警告阈值 | 160,000 | 960,000 | effective - 20K |
| 错误阈值 | 160,000 | 960,000 | effective - 20K |
| 阻塞上限 | 197,000 | 997,000 | 窗口 - 3K |

---

## 4. Micro-Compact — 静默裁剪

### `pm` 函数

Micro-compact 是最轻量的压缩层——**不调用 LLM**，只在内存中裁剪旧的 tool output。

```javascript
function pm(messages, customThreshold, context) {
  if (DISABLE_MICROCOMPACT) return { messages };

  // 1. 扫描所有 tool_use / tool_result 对
  let toolPairs = [];
  let tokenSizes = new Map();
  for (let msg of messages) {
    for (let block of msg.message.content) {
      if (block.type === "tool_use" && isCompactableToolType(block.name))
        toolPairs.push(block.id);
      if (block.type === "tool_result" && toolPairs.includes(block.tool_use_id))
        tokenSizes.set(block.tool_use_id, estimateSize(block));
    }
  }

  // 2. 保留最近 N 个 tool result 的完整内容
  let recentIds = toolPairs.slice(-MFY);  // MFY = 保留数量

  // 3. 从旧到新，标记需要裁剪的 tool result
  let totalSaved = 0;
  let toTruncate = new Set();
  for (let id of toolPairs) {
    if (recentIds.includes(id)) continue;
    if (totalSaved > threshold) {
      toTruncate.add(id);
      totalSaved += tokenSizes.get(id) || 0;
    }
  }

  // 4. 安全检查：如果还没到警告阈值，不裁剪
  if (!customThreshold) {
    let totalTokens = PZ(messages);
    if (!qc(totalTokens, model).isAboveWarningThreshold || totalSaved < DFY)
      toTruncate.clear();
  }

  // 5. 对用户连续消息进行去重（consecutive user message dedup）
  // ...

  return { messages: truncatedMessages, compactionInfo };
}
```

### 可裁剪的工具类型（`PFY`）

不是所有 tool output 都会被裁剪。`PFY` 是一个 Set，包含输出通常较大的工具：

- `Read`（文件读取 — 输出可能数千行）
- `Grep`（搜索结果）
- `Glob`（文件列表）
- `Bash`（命令输出）
- `WebFetch`（网页内容）
- MCP 工具

小输出工具（如 `Edit`、`Write`）的 result 通常不被裁剪。

---

## 5. Auto-Compact — 自动总结

### `Qs4` — 决策入口

```javascript
async function Qs4(messages, context, cacheSafeParams, querySource) {
  // 1. 环境变量检查
  if (DISABLE_COMPACT) return { wasCompacted: false };

  // 2. 阈值检查
  let model = context.options.mainLoopModel;
  if (!await RFY(messages, model, querySource))
    return { wasCompacted: false };

  // 3. 优先尝试 session memory（免费恢复）
  let cached = await mZ6(messages, context.agentId, lg1(model));
  if (cached)
    return { wasCompacted: true, compactionResult: cached };

  // 4. 调用 LLM 生成 summary
  try {
    let result = await MW1(messages, context, cacheSafeParams, true, undefined, true);
    return { wasCompacted: true, compactionResult: result };
  } catch (e) {
    return { wasCompacted: false };
  }
}
```

### `RFY` — 阈值检查

```javascript
async function RFY(messages, model, querySource) {
  // session_memory 和 compact 本身不触发 auto-compact（防递归）
  if (querySource === "session_memory" || querySource === "compact")
    return false;

  // auto-compact 是否启用
  if (!um()) return false;

  // 计算当前 token 数
  let currentTokens = vv(messages);
  let threshold = lg1(model);
  let effectiveWindow = a51(model);

  h(`autocompact: tokens=${currentTokens} threshold=${threshold} effectiveWindow=${effectiveWindow}`);

  let { isAboveAutoCompactThreshold } = qc(currentTokens, model);
  return isAboveAutoCompactThreshold;
}
```

### `MW1` — 核心总结函数

这是整个 compact 系统最核心的函数，manual `/compact` 和 auto-compact 共用。

```javascript
async function MW1(messages, context, cacheSafeParams,
                   isAuto, customInstructions, silentMode) {
  // ── 1. 准备阶段 ──
  let preCompactTokens = vv(messages);          // 压缩前 token 数
  let lastAssistantContent = ea4(messages);     // 提取最后一条 assistant 消息

  // ── 2. Pre-compact hook ──
  context.onCompactProgress?.({ type: "hooks_start", hookType: "pre_compact" });
  context.setSDKStatus?.("compacting");

  let hookResult = await sW6({
    trigger: isAuto ? "auto" : "manual",
    customInstructions: customInstructions ?? null
  }, context.abortController.signal);

  // hook 可以注入额外的总结指令
  if (hookResult.newCustomInstructions)
    customInstructions = hookResult.newCustomInstructions;

  // ── 3. 构建总结请求 ──
  let summaryRequestPrompt = UOA(customInstructions);
  let summaryRequestMessage = createUserMessage({ content: summaryRequestPrompt });

  // ── 4. 确定总结时可用的工具（Read + MCP tools）──
  let tools = await shouldIncludeTools(model, ...)
    ? filterTools([ReadTool, WebFetchTool, ...mcpTools])
    : [ReadTool];

  // ── 5. 调用 LLM 生成 summary ──
  let response = await callLLM({
    messages: [...allHistoryMessages, summaryRequestMessage],
    systemPrompt: ["You are a helpful AI assistant tasked with summarizing conversations."],
    maxThinkingTokens: 0,     // 不使用扩展思考
    tools: tools,              // 总结时仍可读取文件
    querySource: "compact",    // 标记来源（防止递归触发）
    maxOutputTokensOverride: hL6  // compact 专用 output 上限
  });

  // ── 6. 提取 summary 文本 ──
  let summaryText = o51(response);  // 从 <summary>...</summary> 标签中提取
  if (!summaryText) throw Error("Failed to generate conversation summary");

  // ── 7. 恢复关键上下文 ──
  let recentFiles = R0A(context.readFileState);  // 最近读取的文件列表
  context.readFileState.clear();

  let [fileAttachments, taskAttachments] = await Promise.all([
    Os4(recentFiles, context, tokenBudget),   // 重新读取文件内容
    Xs4(context)                               // 恢复任务列表
  ]);

  let attachments = [...fileAttachments, ...taskAttachments];

  // todo list
  let todoAttachment = _s4(context.agentId);
  if (todoAttachment) attachments.push(todoAttachment);

  // agent context
  let agentAttachment = RZ6(context.agentId);
  if (agentAttachment) attachments.push(agentAttachment);

  // ── 8. 触发 session_start hook（source="compact"）──
  let sessionStartHookResults = await NP("compact", { model });

  // ── 9. 构建最终 summary 消息 ──
  let transcriptPath = AO(p6());  // 完整 transcript 的路径
  let summaryMessages = [
    createUserMessage({
      content: ox1(summaryText, isAuto, transcriptPath),
      isCompactSummary: true,
      isVisibleInTranscriptOnly: true
    })
  ];

  // ── 10. 记录 telemetry ──
  let postCompactTokens = PZ([response]);
  let usage = wp(response);

  c("tengu_compact", {
    preCompactTokenCount:           preCompactTokens,
    postCompactTokenCount:          postCompactTokens,
    compactionInputTokens:          usage?.input_tokens,
    compactionOutputTokens:         usage?.output_tokens,
    compactionCacheReadTokens:      usage?.cache_read_input_tokens ?? 0,
    compactionCacheCreationTokens:  usage?.cache_creation_input_tokens ?? 0,
    compactionTotalTokens:          usage ? (input + cacheCreate + cacheRead + output) : 0,
  });

  // ── 11. 返回结果 ──
  return {
    summaryMessages,
    attachments,
    hookResults: sessionStartHookResults,
    preCompactTokenCount: preCompactTokens,
    postCompactTokenCount: postCompactTokens,
    compactionUsage: usage
  };
}
```

---

## 6. 总结 Prompt 与 Summary 结构

### `UOA` — 全量 Compact Prompt

这是发送给 LLM 的总结指令，要求生成包含 **9 个章节**的结构化摘要：

```
System: "You are a helpful AI assistant tasked with summarizing conversations."

User: [UOA 构建的 prompt，包含:]

  Your task is to create a detailed summary of the conversation so far...

  Before providing your final summary, wrap your analysis in <analysis> tags...

  In your analysis process:
  1. Chronologically analyze each message and section:
     - The user's explicit requests and intents
     - Your approach to addressing them
     - Key decisions, technical concepts, code patterns
     - File names, full code snippets, function signatures, file edits
     - Errors and how you fixed them
     - Specific user feedback

  Your summary should include:
  1. Primary Request and Intent
  2. Key Technical Concepts
  3. Files and Code Sections (含完整代码片段)
  4. Errors and Fixes
  5. Problem Solving
  6. All User Messages (非 tool result 的原文)
  7. Pending Tasks
  8. Current Work (最近在做什么)
  9. Optional Next Step

  [用户自定义指令，如果有]

  IMPORTANT: Do NOT use any tools.
  You MUST respond with ONLY the <summary>...</summary> block.
```

### LLM 输出格式

```xml
<analysis>
[思考过程 — 确保覆盖所有要点]
</analysis>

<summary>
1. Primary Request and Intent:
   [详细描述]

2. Key Technical Concepts:
   - [概念 1]
   - [概念 2]

3. Files and Code Sections:
   - [文件名]
     - [重要性说明]
     - [代码片段]

4. Errors and Fixes:
   - [错误描述]: [修复方法]

5. Problem Solving:
   [问题解决过程]

6. All User Messages:
   - [用户消息原文]

7. Pending Tasks:
   - [待完成任务]

8. Current Work:
   [当前工作详情]

9. Optional Next Step:
   [下一步计划]
</summary>
```

### `B99` — Summary 清理

```javascript
function B99(summaryText) {
  // 将 <analysis>...</analysis> 转为 "Analysis:\n..."
  // 将 <summary>...</summary> 转为 "Summary:\n..."
  // 压缩连续空行
  return cleanedText;
}
```

### `ox1` — 包装为新会话起始消息

```javascript
function ox1(summary, isAuto, transcriptPath, hasRecentMessages) {
  let text = `This session is being continued from a previous conversation
that ran out of context. The summary below covers the earlier portion
of the conversation.

${B99(summary)}`;

  if (transcriptPath)
    text += `\n\nIf you need specific details from before compaction
(like exact code snippets, error messages, or content you generated),
read the full transcript at: ${transcriptPath}`;

  if (hasRecentMessages)
    text += `\n\nRecent messages are preserved verbatim.`;

  if (isAuto)
    text += `\nPlease continue the conversation from where we left off
without asking the user any further questions. Continue with the last
task that you were asked to work on.`;

  return text;
}
```

---

## 7. 上下文恢复 — Post-Compact 附件

Summary 本身不足以恢复完整上下文。Claude Code 在 compact 后会自动附加以下内容：

### 文件恢复（`Os4`）

```javascript
async function Os4(recentlyReadFiles, context, tokenBudget) {
  // 1. 获取 compact 前最近读取的文件列表
  // 2. 对每个文件重新执行 Read 操作
  // 3. 在 token budget（amY）内尽可能多地恢复
  // 4. 返回文件内容 attachment 数组

  let attachments = await Promise.all(
    recentlyReadFiles.map(async (file) => {
      let content = await readFile(file.filename, {
        // 使用 compact 专用读取限制
        maxTokens: smY  // compact 文件读取 token 限制
      });
      return content ? createFileAttachment(content) : null;
    })
  );

  // token budget 限制
  let totalTokens = 0;
  return attachments.filter((att) => {
    if (att === null) return false;
    let size = estimateTokens(att);
    if (totalTokens + size <= amY) {  // amY = 文件恢复 token 总预算
      totalTokens += size;
      return true;
    }
    return false;
  });
}
```

### 任务列表恢复（`Xs4`）

```javascript
async function Xs4(context) {
  // 恢复当前团队的任务列表状态
  // 让 agent 在 compact 后知道还有哪些任务待完成
}
```

### Todo List 恢复（`_s4`）

```javascript
function _s4(agentId) {
  let todos = dB(agentId);  // 读取当前 todo 列表
  if (todos.length === 0) return null;
  return createTodoAttachment({
    type: "todo",
    content: todos,
    itemCount: todos.length,
    context: "compact"
  });
}
```

### Agent Context 恢复（`RZ6`）

```javascript
function RZ6(agentId) {
  // 如果当前是 teammate agent，恢复 team 上下文
  // 包括 team name、agent role、其他 teammate 信息等
}
```

### Compact 后的消息结构

```
compact 后的完整上下文:

[1] summary 消息（ox1 包装）
    "This session is being continued from a previous conversation..."
    [结构化摘要]

[2] 文件附件（Os4）
    - 最近读取的 file_a.ts 内容
    - 最近读取的file_b.py 内容
    ...（受 token budget 限制）

[3] 任务列表（Xs4）
    - task #1: completed
    - task #2: in_progress
    ...

[4] Todo list（_s4）
    - [ ] 待办项 1
    - [x] 已完成项 2
    ...

[5] Agent context（RZ6）
    - team: my-project
    - role: implementer
    ...

[6] Session start hook 结果

── 从这里开始，后续新消息正常追加 ──
```

---

## 8. Session Memory — 缓存加速

### `mZ6` — 缓存 Compact

在执行完整 LLM compact 之前，系统会先检查是否有 **session memory** 可以直接使用，从而避免额外的 LLM 调用。

```javascript
async function mZ6(messages, agentId, autoCompactThreshold) {
  // 1. 检查 session memory 功能是否启用
  if (!BZ6()) return null;

  // 2. 获取之前已生成的 summary 模板
  let template = CZ6();
  if (!template) return null;
  if (await Ss4(template)) return null;  // 空模板

  // 3. 找到上次 summary 的位置
  let lastSummarizedId = Ps4();
  let splitIndex;
  if (lastSummarizedId) {
    splitIndex = messages.findIndex(m => m.uuid === lastSummarizedId);
    if (splitIndex === -1) return null;
  } else {
    splitIndex = messages.length - 1;  // resumed session
  }

  // 4. 计算保留的最近消息
  let recentStart = TFY(messages, splitIndex);
  let recentMessages = messages.slice(recentStart).filter(m => !isInternal(m));

  // 5. 构建 compact 结果（不调用 LLM）
  let result = vFY(messages, template, recentMessages, hookResults, transcriptPath, agentId);
  let compacted = mergeMessages(result);

  // 6. 检查压缩后是否仍超阈值
  let postCompactTokens = SU1(compacted);
  if (autoCompactThreshold !== undefined && postCompactTokens >= autoCompactThreshold)
    return null;  // 缓存的 summary 不够新，需要重新生成

  return { ...result, postCompactTokenCount: postCompactTokens };
}
```

**关键优势**：当 session memory 可用时，compact 操作 **零 LLM 调用，零额外 token 消耗**。

---

## 9. Token 消耗模型

### 单次 Compact 的开销

```
┌─────────────────────────────────────────────────────────┐
│                   Compact LLM 调用                       │
│                                                         │
│  ┌─── input ────────────────────────────────────────┐  │
│  │ system prompt:    ~100 tokens                     │  │
│  │ 全部历史消息:      ~167,000 tokens (触发阈值)     │  │
│  │ 总结指令 (UOA):   ~800 tokens                     │  │
│  │ ─────────────────────────────────────────────     │  │
│  │ 合计 input:       ~168,000 tokens                 │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─── output ───────────────────────────────────────┐  │
│  │ <analysis>:       ~1,000-3,000 tokens             │  │
│  │ <summary>:        ~2,000-6,000 tokens             │  │
│  │ ─────────────────────────────────────────────     │  │
│  │ 合计 output:      ~3,000-8,000 tokens             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  总消耗:  ~170,000-176,000 tokens                       │
│  (约等于"把全部历史重发一遍")                            │
└─────────────────────────────────────────────────────────┘
```

### Prompt Cache 优化

如果启用了 prompt caching，情况会好很多：

```
无缓存:
  input_tokens:                 168,000  (全价)
  cache_read_input_tokens:      0
  output_tokens:                5,000
  ────────────────────────────────
  等效 token:                   173,000

有缓存 (system prompt + 部分历史命中):
  input_tokens:                 20,000   (未缓存部分)
  cache_read_input_tokens:      148,000  (缓存命中，1/10 价格)
  output_tokens:                5,000
  ────────────────────────────────
  等效 token:                   39,800   (大幅降低)
```

### 长对话的累积 Token 消耗

假设使用 200K 窗口模型，对话持续进行：

```
对话消耗:     0 ───────────────── 167K    第一次 compact (~170K)
              ↓                   ↓
上下文:       0 → 50K → 100K → 167K → 15K(summary)
              ↓                          ↓
对话消耗:     170K ────────────── 337K    第二次 compact (~170K)
              ↓                   ↓
上下文:       15K → 80K → 130K → 167K → 15K(summary)
              ...

每 ~152K tokens 的有效对话，额外消耗 ~170K tokens 用于 compact
开销比例: 170K / (152K + 170K) ≈ 53%

结论: 长对话中约一半的 token 消耗花在了 compact 上
```

### 1M 窗口模型的改善

```
1M 模型:
  每 ~952K tokens 的有效对话，额外消耗 ~970K tokens 用于 compact
  开销比例: 970K / (952K + 970K) ≈ 50.5%

  比例类似，但绝对触发频率大幅降低（约 6 倍）
  对于大多数会话，1M 窗口可能只需 0-1 次 compact
```

### 环境变量调优

| 变量 | 效果 | 适用场景 |
|------|------|---------|
| `DISABLE_COMPACT=1` | 完全禁用 | 短对话，确定不会超限 |
| `DISABLE_AUTO_COMPACT=1` | 只禁用自动触发 | 想手动控制 compact 时机 |
| `DISABLE_MICROCOMPACT=1` | 禁用静默裁剪 | 需要保留所有 tool output |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80` | 窗口 80% 时触发 | 提前 compact，留更多余量 |

---

## 10. 完整生命周期时序图

```
User                    Claude Code (fR 主循环)                LLM
 │                              │                              │
 ├── 发送消息 ─────────────────►│                              │
 │                              ├── pm() micro-compact         │
 │                              │   (裁剪旧 tool output)       │
 │                              │                              │
 │                              ├── Qs4() 检查 auto-compact    │
 │                              │   RFY(): tokens < threshold  │
 │                              │   → 不触发                    │
 │                              │                              │
 │                              ├── 正常调用 LLM ──────────────►│
 │                              │                              │
 │                              │◄── response ─────────────────┤
 │◄── 显示结果 ────────────────┤                              │
 │                              │                              │
 │    (对话继续... tokens 增长)  │                              │
 │                              │                              │
 ├── 发送消息 ─────────────────►│                              │
 │                              ├── pm() micro-compact         │
 │                              │   tokens 仍然很高             │
 │                              │                              │
 │                              ├── Qs4() 检查 auto-compact    │
 │                              │   RFY(): tokens >= 167K !!   │
 │                              │                              │
 │                              ├── mZ6() 尝试 session memory  │
 │                              │   → 无缓存可用               │
 │                              │                              │
 │  [状态栏: "compacting"]      ├── MW1() 核心总结             │
 │                              │                              │
 │                              │   1. vv() → 167,000 tokens   │
 │                              │   2. pre_compact hook         │
 │                              │   3. 构建 UOA() prompt        │
 │                              │                              │
 │                              ├── 总结调用 ──────────────────►│
 │                              │   system: "summarize..."      │
 │                              │   messages: [全部历史+UOA]    │
 │                              │   input: ~168K tokens         │
 │                              │                              │
 │                              │◄── <summary>...</summary> ───┤
 │                              │   output: ~5K tokens          │
 │                              │                              │
 │                              │   4. o51() 提取 summary       │
 │                              │   5. Os4() 恢复文件内容       │
 │                              │   6. Xs4() 恢复任务列表       │
 │                              │   7. _s4() 恢复 todo list     │
 │                              │   8. ox1() 包装为新消息       │
 │                              │                              │
 │                              │   上下文: 167K → ~15K         │
 │                              │                              │
 │                              ├── 用 compact 后消息调用 LLM ─►│
 │                              │   input: ~15K + 新消息        │
 │                              │                              │
 │                              │◄── response ─────────────────┤
 │◄── 显示结果 ────────────────┤                              │
 │                              │                              │
 │    (继续对话... 从 ~15K 重新开始增长)                        │
 │                              │                              │
 │── /compact [指令] ──────────►│                              │
 │                              ├── MW1() 手动 compact         │
 │                              │   (同上流程，但使用用户指令)   │
 │                              │   customInstructions = 指令   │
 │◄── 显示 "compacted" ───────┤                              │
 ▼                              ▼                              ▼
```
