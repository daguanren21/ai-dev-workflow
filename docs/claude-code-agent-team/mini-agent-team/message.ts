// ============================================================
// Mini Agent Team — 消息路由
// 对应 Claude Code 的 SendMessage 工具
//
// 关键设计：
//   - In-process 模式使用 EventEmitter 做消息投递
//   - 每个 agent 有一个 pending 队列 + Promise 机制
//   - sendMessage → 写入目标 agent 的队列并触发事件
//   - waitForMessage → 返回 Promise，在 sendMessage 时被 resolve
// ============================================================

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { readTeamConfig } from "./team.js";
import type { TeamMessage, MessageType } from "./types.js";

// ── 全局消息总线（In-Process 模式的核心） ────────────────────

const bus = new EventEmitter();
bus.setMaxListeners(100);

/**
 * 每个 agent 的 pending 消息队列。
 * key = agentName, value = 待消费的消息数组。
 */
const pendingQueues = new Map<string, TeamMessage[]>();

/** 获取或创建 pending 队列 */
function getQueue(agentName: string): TeamMessage[] {
  let q = pendingQueues.get(agentName);
  if (!q) {
    q = [];
    pendingQueues.set(agentName, q);
  }
  return q;
}

// ── 发送消息 ─────────────────────────────────────────────────

/**
 * 发送单条消息给指定 agent。
 *
 * 流程：
 *   1. 构建 TeamMessage 对象
 *   2. 推入目标 agent 的 pending 队列
 *   3. 通过 EventEmitter 通知目标 agent（唤醒 idle 等待）
 */
export function sendMessage(
  from: string,
  to: string,
  content: string,
  opts: {
    type?: MessageType;
    summary?: string;
    requestId?: string;
    approve?: boolean;
  } = {},
): TeamMessage {
  const msg: TeamMessage = {
    id: randomUUID(),
    type: opts.type ?? "message",
    sender: from,
    recipient: to,
    content,
    summary: opts.summary ?? content.slice(0, 40),
    timestamp: Date.now(),
    requestId: opts.requestId,
    approve: opts.approve,
  };

  // 推入目标队列
  getQueue(to).push(msg);

  // 触发事件 → 唤醒正在 waitForMessage 的 agent
  bus.emit(`msg:${to}`, msg);

  return msg;
}

/**
 * 广播消息给团队所有成员（除了发送者）。
 * 注意：广播开销 = N-1 条消息，应谨慎使用。
 */
export function broadcastMessage(
  from: string,
  teamName: string,
  content: string,
  summary?: string,
): TeamMessage[] {
  const config = readTeamConfig(teamName);
  const sent: TeamMessage[] = [];

  for (const member of config.members) {
    if (member.name === from) continue;
    sent.push(
      sendMessage(from, member.name, content, {
        type: "broadcast",
        summary: summary ?? content.slice(0, 40),
      }),
    );
  }
  return sent;
}

/** 发送 shutdown 请求 */
export function sendShutdownRequest(
  from: string,
  to: string,
  content = "Shutting down, task complete.",
): TeamMessage {
  const requestId = randomUUID();
  return sendMessage(from, to, content, {
    type: "shutdown_request",
    requestId,
    summary: "Shutdown request",
  });
}

/** 回复 shutdown 请求 */
export function sendShutdownResponse(
  from: string,
  to: string,
  requestId: string,
  approve: boolean,
  content = "",
): TeamMessage {
  return sendMessage(from, to, content || (approve ? "Approved" : "Rejected"), {
    type: "shutdown_response",
    requestId,
    approve,
    summary: approve ? "Shutdown approved" : "Shutdown rejected",
  });
}

// ── 接收消息 ─────────────────────────────────────────────────

/** 消费 pending 队列中的所有消息（非阻塞） */
export function drainMessages(agentName: string): TeamMessage[] {
  const q = getQueue(agentName);
  return q.splice(0); // 取出并清空
}

/**
 * 等待下一条消息（阻塞式）。
 *
 * 核心机制：
 *   1. 如果队列已有消息 → 立即返回第一条
 *   2. 否则注册 EventEmitter listener → 返回 Promise
 *   3. sendMessage 触发事件 → resolve Promise → agent 被唤醒
 *
 * 这对应 Claude Code 中 in-process agent 的 idle → wake 过程。
 * Agent 在 idle 时调用此函数挂起，收到消息后恢复执行。
 */
export function waitForMessage(
  agentName: string,
  signal?: AbortSignal,
): Promise<TeamMessage> {
  // 快路径：队列已有消息
  const q = getQueue(agentName);
  if (q.length > 0) {
    return Promise.resolve(q.shift()!);
  }

  // 慢路径：等待 EventEmitter 事件
  return new Promise<TeamMessage>((resolve, reject) => {
    const eventName = `msg:${agentName}`;

    const onMessage = (msg: TeamMessage) => {
      cleanup();
      const idx = q.indexOf(msg);
      if (idx !== -1) q.splice(idx, 1);
      resolve(msg);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    const cleanup = () => {
      bus.removeListener(eventName, onMessage);
      signal?.removeEventListener("abort", onAbort);
    };

    bus.once(eventName, onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 清理某个 agent 的所有 pending 消息 */
export function clearQueue(agentName: string): void {
  pendingQueues.delete(agentName);
}
