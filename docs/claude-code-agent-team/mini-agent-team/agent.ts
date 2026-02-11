// ============================================================
// Mini Agent Team — Agent 运行循环
// 对应 Claude Code 的 In-Process Runner
//
// 关键设计：
//   - AsyncLocalStorage 上下文隔离（每个 agent 有独立上下文）
//   - 核心循环: handle(prompt) → idle → waitForMessage → handle...
//   - idle 通知 + shutdown 协议
//   - 用 AgentHandler（模拟函数）替代真实 LLM 调用
// ============================================================

import { AsyncLocalStorage } from "node:async_hooks";
import { addMember, taskDir } from "./team.js";
import {
  waitForMessage,
  sendMessage,
  sendShutdownResponse,
  clearQueue,
} from "./message.js";
import type {
  AgentContext,
  AgentHandler,
  AgentHandle,
  AgentState,
  TeamMessage,
} from "./types.js";

// ── AsyncLocalStorage 实例（全局唯一） ───────────────────────

/**
 * 这是整个 In-Process 模式的核心隔离机制。
 *
 * 当多个 agent 在同一个 Node.js 进程中并发运行时，
 * 它们共享同一个事件循环，但每个 agent 的异步调用链
 * 通过 AsyncLocalStorage 携带各自独立的 AgentContext。
 *
 * 任何地方调用 getAgentContext() 都能拿到当前 agent 的上下文，
 * 无需手动传参。
 */
const asyncLocalStorage = new AsyncLocalStorage<AgentContext>();

/** 获取当前 agent 上下文（在 agent 循环内调用） */
export function getAgentContext(): AgentContext {
  const ctx = asyncLocalStorage.getStore();
  if (!ctx) throw new Error("Not inside an agent context");
  return ctx;
}

// ── Agent 注册表 ─────────────────────────────────────────────

const agents = new Map<string, AgentHandle>();

/** 获取所有活跃 agent */
export function getAgents(): Map<string, AgentHandle> {
  return agents;
}

/** 按名称获取 agent handle */
export function getAgent(name: string): AgentHandle | undefined {
  return agents.get(name);
}

// ── 核心：spawn agent ────────────────────────────────────────

/**
 * 生成并启动一个 agent。
 *
 * 流程：
 *   1. 注册到团队 config.json（addMember）
 *   2. 创建 AbortController 用于 shutdown
 *   3. 在 AsyncLocalStorage.run() 内启动运行循环
 *   4. 返回 AgentHandle 供外部控制
 *
 * @param name     agent 名称（团队内唯一）
 * @param teamName 团队名称
 * @param handler  模拟 LLM 决策的函数（替代真实 API 调用）
 * @param opts     初始 prompt、agentType 等
 */
export function spawnAgent(
  name: string,
  teamName: string,
  handler: AgentHandler,
  opts: {
    initialPrompt?: string;
    agentType?: string;
  } = {},
): AgentHandle {
  // 1. 注册成员
  const member = addMember(teamName, name, opts.agentType ?? "general-purpose");

  // 2. 构建上下文
  const ctx: AgentContext = {
    agentId: member.agentId,
    agentName: name,
    teamName,
    teamConfigPath: `~/.mini-team/${teamName}/config.json`,
    taskDir: taskDir(teamName),
  };

  // 3. 状态 & 控制
  let state: AgentState = "created";
  const abortController = new AbortController();
  let exitResolve: () => void;
  const exitPromise = new Promise<void>((r) => {
    exitResolve = r;
  });

  // 4. 构建 handle
  const handle: AgentHandle = {
    name,
    agentId: member.agentId,
    get state() {
      return state;
    },
    set state(s: AgentState) {
      state = s;
    },
    deliver(msg: TeamMessage) {
      // sendMessage 已经会 push + emit，这里仅作为语义接口
      // 实际投递由 message.ts 的 sendMessage 完成
    },
    waitForExit() {
      return exitPromise;
    },
  };

  agents.set(name, handle);

  // 5. 启动运行循环（异步，不阻塞调用方）
  const runLoop = async () => {
    state = "running";
    let currentPrompt = opts.initialPrompt ?? "(no initial prompt)";

    try {
      while (!abortController.signal.aborted) {
        // ── Phase 1: Handle ──
        // 调用 handler（模拟 LLM），传入当前 prompt
        const result = await handler(currentPrompt, ctx);

        if (result === null || abortController.signal.aborted) {
          break; // handler 返回 null 表示主动退出
        }

        log(name, `Handle 完成, 结果: ${result.slice(0, 60)}...`);

        // ── Phase 2: Idle ──
        state = "idle";
        log(name, "进入 idle 状态，等待消息...");

        // 通知 team-lead 当前 agent 已 idle
        sendMessage(name, "team-lead", `[idle] ${name} 已完成当前任务，等待指令`, {
          summary: `${name} idle`,
        });

        // 挂起，等待消息唤醒
        let message: TeamMessage;
        try {
          message = await waitForMessage(name, abortController.signal);
        } catch (e: unknown) {
          if (e instanceof DOMException && e.name === "AbortError") break;
          throw e;
        }

        // ── Phase 3: Wake ──
        state = "running";
        log(name, `被消息唤醒: [${message.type}] from ${message.sender}`);

        // Shutdown 协议
        if (message.type === "shutdown_request") {
          log(name, "收到 shutdown 请求，批准并退出");
          sendShutdownResponse(
            name,
            message.sender,
            message.requestId!,
            true,
            "Shutting down gracefully",
          );
          break;
        }

        // 将消息内容作为新 prompt → 回到 Phase 1
        currentPrompt = message.content;
      }
    } catch (err) {
      log(name, `运行循环异常: ${err}`);
    } finally {
      state = "shutdown";
      clearQueue(name);
      agents.delete(name);
      log(name, "已退出");
      exitResolve!();
    }
  };

  // 在 AsyncLocalStorage 上下文中运行循环
  asyncLocalStorage.run(ctx, () => {
    runLoop(); // 不 await，让它异步运行
  });

  return handle;
}

// ── 工具函数 ─────────────────────────────────────────────────

function log(agent: string, msg: string): void {
  const time = new Date().toISOString().slice(11, 23);
  console.log(`  [${time}] [${agent}] ${msg}`);
}
