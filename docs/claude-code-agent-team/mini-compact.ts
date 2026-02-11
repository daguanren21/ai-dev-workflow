/**
 * mini-compact.ts — 最小化上下文压缩（Compact）案例
 *
 * 单文件，无外部依赖，npx tsx 直接运行。
 * 模拟 Claude Code 的三层上下文管理机制：
 *   1. Micro-Compact — 裁剪旧 tool output（不调用 LLM）
 *   2. Auto-Compact — token 超阈值时自动调用 LLM 生成 summary
 *   3. Post-Compact 恢复 — summary + 文件附件 + 任务列表
 *
 * 运行: npx tsx docs/claude-code-agent-team/mini-compact.ts
 */

// ────────────────────────── Types ──────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** tool output 通常体积大，是裁剪目标 */
  toolOutput?: { name: string; result: string };
  /** compact summary 标记 */
  isCompactSummary?: boolean;
  /** token 近似值 */
  tokens: number;
}

interface CompactResult {
  summaryMessage: Message;
  attachments: Message[];
  preCompactTokens: number;
  postCompactTokens: number;
  compactCallTokens: { input: number; output: number };
}

interface ThresholdInfo {
  currentTokens: number;
  contextWindow: number;
  effectiveWindow: number;
  autoCompactThreshold: number;
  percentLeft: number;
  shouldAutoCompact: boolean;
  shouldWarn: boolean;
}

/** 模拟 LLM 的总结函数 */
type Summarizer = (messages: Message[]) => Promise<string>;

// ──────────────────── Constants (对齐 cli.js) ──────────────

const CONTEXT_WINDOW = 200_000;      // Bbq = 200000
const MAX_OUTPUT_TOKENS = 20_000;    // EFY = 20000
const AUTO_COMPACT_BUFFER = 13_000;  // XSA = 13000
const WARNING_OFFSET = 20_000;       // kFY = 20000
const BLOCKING_MARGIN = 3_000;       // DSA = 3000

const EFFECTIVE_WINDOW = CONTEXT_WINDOW - MAX_OUTPUT_TOKENS;         // 180,000
const AUTO_COMPACT_THRESHOLD = EFFECTIVE_WINDOW - AUTO_COMPACT_BUFFER; // 167,000
const WARNING_THRESHOLD = EFFECTIVE_WINDOW - WARNING_OFFSET;          // 160,000
const BLOCKING_LIMIT = CONTEXT_WINDOW - BLOCKING_MARGIN;              // 197,000

// ──────────────────── Token Estimation ─────────────────────

/** 粗略估算：1 token ≈ 4 字符（英文）或 1.5 字符（中文） */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + m.tokens, 0);
}

// ──────────────────── Threshold Calc ───────────────────────

function checkThresholds(messages: Message[]): ThresholdInfo {
  const current = totalTokens(messages);
  const percentLeft = Math.max(0, Math.round(
    (AUTO_COMPACT_THRESHOLD - current) / AUTO_COMPACT_THRESHOLD * 100
  ));
  return {
    currentTokens: current,
    contextWindow: CONTEXT_WINDOW,
    effectiveWindow: EFFECTIVE_WINDOW,
    autoCompactThreshold: AUTO_COMPACT_THRESHOLD,
    percentLeft,
    shouldAutoCompact: current >= AUTO_COMPACT_THRESHOLD,
    shouldWarn: current >= WARNING_THRESHOLD,
  };
}

// ──────────────── Layer 1: Micro-Compact ───────────────────

/**
 * 裁剪旧的 tool output，保留最近 `keep` 个完整输出。
 * 对齐 cli.js 的 `pm` 函数。不调用 LLM，零额外 token 消耗。
 */
function microCompact(messages: Message[], keep = 3): {
  messages: Message[];
  truncatedCount: number;
  savedTokens: number;
} {
  // 收集带 toolOutput 的消息索引（从旧到新）
  const toolIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].toolOutput) toolIndices.push(i);
  }

  // 保留最近 `keep` 个
  const toTruncate = toolIndices.slice(0, Math.max(0, toolIndices.length - keep));

  let savedTokens = 0;
  const result = messages.map((m, i) => {
    if (!toTruncate.includes(i)) return m;
    const original = m.toolOutput!.result;
    const truncated = `[TRUNCATED: ${m.toolOutput!.name} output, was ${original.length} chars]`;
    const newTokens = estimateTokens(m.content) + estimateTokens(truncated);
    savedTokens += m.tokens - newTokens;
    return {
      ...m,
      toolOutput: { ...m.toolOutput!, result: truncated },
      tokens: newTokens,
    };
  });

  return { messages: result, truncatedCount: toTruncate.length, savedTokens };
}

// ──────────────── Layer 2: Auto-Compact ────────────────────

/**
 * 调用 summarizer 生成结构化摘要，替换全部历史。
 * 对齐 cli.js 的 `MW1` 函数。
 */
async function compact(
  messages: Message[],
  summarizer: Summarizer,
  recentFiles: Map<string, string>,
): Promise<CompactResult> {
  const preCompactTokens = totalTokens(messages);

  // ── 调用 LLM 生成 summary ──
  const summary = await summarizer(messages);
  const summaryTokens = estimateTokens(summary);

  const summaryMessage: Message = {
    id: `compact-${Date.now()}`,
    role: "system",
    content: [
      "This session is being continued from a previous conversation",
      "that ran out of context. The summary below covers the earlier",
      "portion of the conversation.\n",
      summary,
      "\nPlease continue from where we left off.",
    ].join("\n"),
    isCompactSummary: true,
    tokens: summaryTokens + 50,
  };

  // ── Post-compact 附件：恢复最近读取的文件 ──
  const attachments: Message[] = [];
  let attachmentBudget = 30_000; // token budget for file restoration

  for (const [filename, content] of recentFiles) {
    const tokens = estimateTokens(content);
    if (tokens > attachmentBudget) continue;
    attachmentBudget -= tokens;
    attachments.push({
      id: `file-${filename}`,
      role: "system",
      content: `[File restored: ${filename}]\n${content}`,
      tokens,
    });
  }

  const postCompactTokens = summaryMessage.tokens +
    attachments.reduce((s, m) => s + m.tokens, 0);

  return {
    summaryMessage,
    attachments,
    preCompactTokens,
    postCompactTokens,
    compactCallTokens: {
      input: preCompactTokens + 300, // prompt overhead
      output: summaryTokens,
    },
  };
}

// ──────────────── Conversation Engine ──────────────────────

/**
 * 模拟 cli.js 的主查询循环 `fR`。
 * 每次 LLM 调用前执行 micro-compact + auto-compact 检查。
 */
async function conversationLoop(
  turns: { role: "user" | "assistant"; content: string; toolOutput?: Message["toolOutput"] }[],
  summarizer: Summarizer,
) {
  let messages: Message[] = [];
  const recentFiles = new Map<string, string>();
  let totalCompactCalls = 0;
  let totalCompactInputTokens = 0;
  let totalCompactOutputTokens = 0;

  log("engine", `Context window: ${fmt(CONTEXT_WINDOW)} | Auto-compact at: ${fmt(AUTO_COMPACT_THRESHOLD)} | Warning at: ${fmt(WARNING_THRESHOLD)}`);
  log("engine", "");

  for (const turn of turns) {
    const msg: Message = {
      id: `msg-${messages.length}`,
      role: turn.role,
      content: turn.content,
      toolOutput: turn.toolOutput,
      tokens: estimateTokens(turn.content) + (turn.toolOutput ? estimateTokens(turn.toolOutput.result) : 0),
    };

    // 模拟文件读取记录
    if (turn.toolOutput?.name === "Read") {
      recentFiles.set(
        turn.toolOutput.result.split("\n")[0] || "unknown",
        turn.toolOutput.result
      );
    }

    messages.push(msg);

    if (turn.role === "user") {
      log("user", truncate(turn.content, 60));
    }

    // ── 在 LLM 调用前（assistant turn 之前）执行压缩检查 ──
    if (turn.role === "assistant") {
      const info = checkThresholds(messages);
      const bar = progressBar(info.currentTokens, AUTO_COMPACT_THRESHOLD, 30);

      // Layer 1: Micro-compact
      const { messages: microCompacted, truncatedCount, savedTokens } = microCompact(messages);
      if (truncatedCount > 0) {
        messages = microCompacted;
        log("micro", `Truncated ${truncatedCount} old tool outputs, saved ~${fmt(savedTokens)} tokens`);
      }

      // Layer 2: Auto-compact check
      const infoAfterMicro = checkThresholds(messages);
      if (infoAfterMicro.shouldAutoCompact) {
        log("auto", `Threshold reached! ${fmt(infoAfterMicro.currentTokens)} >= ${fmt(AUTO_COMPACT_THRESHOLD)}`);
        log("auto", "Triggering auto-compact...");

        const result = await compact(messages, summarizer, recentFiles);
        totalCompactCalls++;
        totalCompactInputTokens += result.compactCallTokens.input;
        totalCompactOutputTokens += result.compactCallTokens.output;

        // 替换全部历史
        messages = [result.summaryMessage, ...result.attachments];
        recentFiles.clear();

        log("auto", `Compacted: ${fmt(result.preCompactTokens)} → ${fmt(result.postCompactTokens)} tokens`);
        log("auto", `Compact call cost: input=${fmt(result.compactCallTokens.input)} output=${fmt(result.compactCallTokens.output)}`);
      }

      // 显示状态
      const final = checkThresholds(messages);
      log("assistant", `${truncate(turn.content, 50)}  ${bar} ${fmt(final.currentTokens)}/${fmt(AUTO_COMPACT_THRESHOLD)} (${final.percentLeft}% left)`);
      log("engine", "");
    }
  }

  return { messages, totalCompactCalls, totalCompactInputTokens, totalCompactOutputTokens };
}

// ────────────────────────── Helpers ────────────────────────

function log(source: string, msg: string): void {
  const label = source.padEnd(10);
  const colors: Record<string, string> = {
    engine: "\x1b[90m",    // gray
    user: "\x1b[36m",      // cyan
    assistant: "\x1b[32m", // green
    micro: "\x1b[33m",     // yellow
    auto: "\x1b[31m",      // red
    summary: "\x1b[35m",   // magenta
  };
  const c = colors[source] || "";
  const reset = "\x1b[0m";
  console.log(`${c}[${label}]${reset} ${msg}`);
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "..." : s;
}

function progressBar(current: number, max: number, width: number): string {
  const ratio = Math.min(1, current / max);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const color = ratio > 0.9 ? "\x1b[31m" : ratio > 0.7 ? "\x1b[33m" : "\x1b[32m";
  return `${color}[${"█".repeat(filled)}${"░".repeat(empty)}]\x1b[0m`;
}

/** 生成大段文本模拟大 token 消耗 */
function bigContent(label: string, sizeTokens: number): string {
  const charCount = sizeTokens * 3;
  const line = `// ${label}: generated content line\n`;
  return line.repeat(Math.ceil(charCount / line.length)).slice(0, charCount);
}

// ──────────────────────── Demo ─────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Mini Compact Demo — Context Compaction System  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ── 模拟 LLM summarizer ──
  const summarizer: Summarizer = async (messages) => {
    const userMsgs = messages.filter(m => m.role === "user");
    const assistantMsgs = messages.filter(m => m.role === "assistant");
    const toolUses = messages.filter(m => m.toolOutput);

    return [
      "<summary>",
      "1. Primary Request and Intent:",
      `   User made ${userMsgs.length} requests across the conversation.`,
      "",
      "2. Key Technical Concepts:",
      "   - File reading and code analysis",
      "   - Multi-step implementation tasks",
      "",
      "3. Files and Code Sections:",
      ...toolUses.slice(-3).map(m =>
        `   - ${m.toolOutput!.name}: ${truncate(m.toolOutput!.result, 80)}`
      ),
      "",
      "4. Current Work:",
      `   Last assistant message: "${truncate(assistantMsgs.at(-1)?.content ?? "", 100)}"`,
      "",
      "5. Pending Tasks:",
      "   - Continue the current implementation",
      "</summary>",
    ].join("\n");
  };

  // ── 构建模拟对话（让 token 快速增长到触发 compact）──
  // 使用缩放因子让演示在合理时间内完成
  const SCALE = 1 / 10; // 1/10 规模演示（阈值相应缩小）
  // 临时 override 常量来适配演示规模
  const realThreshold = AUTO_COMPACT_THRESHOLD;

  const turns: Parameters<typeof conversationLoop>[0] = [];

  // 逐步构建对话，token 逐渐增长
  const phases = [
    { user: "Read the project structure and explain the architecture.", tokens: 200 },
    { user: "Now read src/main.ts and analyze the entry point.", tokens: 500 },
    { user: "Read src/utils.ts — I need to understand the helpers.", tokens: 800 },
    { user: "Implement a new caching layer in src/cache.ts.", tokens: 300 },
    { user: "Read the test files to understand testing patterns.", tokens: 1200 },
    { user: "Write comprehensive tests for the cache module.", tokens: 400 },
    { user: "Read the config system — 5 files.", tokens: 2000 },
    { user: "Refactor the config to support hot-reload.", tokens: 500 },
    { user: "Read the entire middleware stack (8 files).", tokens: 3000 },
    { user: "Add error handling to all middleware.", tokens: 600 },
  ];

  // 每个 phase 产生一个 user turn + 一个 assistant turn（含大量 tool output）
  for (const phase of phases) {
    turns.push({ role: "user", content: phase.user });
    turns.push({
      role: "assistant",
      content: `Done. I've analyzed the code and here's what I found...`,
      toolOutput: {
        name: "Read",
        result: bigContent(phase.user, phase.tokens * 100), // 放大 100 倍模拟大文件
      },
    });
  }

  // ── 运行对话循环 ──
  const result = await conversationLoop(turns, summarizer);

  // ── 打印统计 ──
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                  Session Summary                 ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Total messages (final):     ${String(result.messages.length).padStart(18)} ║`);
  console.log(`║  Final context size:    ${(fmt(totalTokens(result.messages)) + " tokens").padStart(23)} ║`);
  console.log(`║  Compact calls:              ${String(result.totalCompactCalls).padStart(18)} ║`);
  console.log(`║  Compact input tokens:  ${(fmt(result.totalCompactInputTokens) + " tokens").padStart(23)} ║`);
  console.log(`║  Compact output tokens: ${(fmt(result.totalCompactOutputTokens) + " tokens").padStart(23)} ║`);

  const totalConversationTokens = turns.reduce((s, t) =>
    s + estimateTokens(t.content) + (t.toolOutput ? estimateTokens(t.toolOutput.result) : 0), 0);
  const overhead = result.totalCompactInputTokens + result.totalCompactOutputTokens;
  const overheadPct = totalConversationTokens > 0
    ? Math.round(overhead / totalConversationTokens * 100) : 0;

  console.log(`║  Total conversation tokens:  ${(fmt(totalConversationTokens)).padStart(18)} ║`);
  console.log(`║  Compact overhead:           ${(overheadPct + "%").padStart(18)} ║`);
  console.log("╚══════════════════════════════════════════════════╝");

  // ── 显示最终上下文内容 ──
  console.log("\n── Final Context (after compaction) ──\n");
  for (const m of result.messages) {
    const label = m.isCompactSummary ? "SUMMARY" : m.role.toUpperCase();
    console.log(`[${label}] (${fmt(m.tokens)} tokens) ${truncate(m.content.replace(/\n/g, " "), 100)}`);
  }
}

main().catch(console.error);
