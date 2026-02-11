/**
 * mini-multi-agents.ts — 最小化多 Agent 协作案例
 *
 * 单文件，无外部依赖，npx tsx 直接运行。
 * 只保留多 Agent 协作的 4 个本质机制：
 *   1. EventEmitter 消息总线（idle → wake）
 *   2. 共享内存任务列表（无文件 I/O）
 *   3. Agent 运行循环（handle → idle → poll → wake）
 *   4. 自动任务认领（对齐 cli.js 的 aI4/GZY/PZY）
 *
 * 运行: npx tsx docs/claude-code-agent-team/mini-multi-agents.ts
 */

import { EventEmitter } from "node:events";

// ────────────────────────── Types ──────────────────────────

interface Task {
  id: string;
  subject: string;
  status: "pending" | "in_progress" | "completed";
  owner: string | null;
  blockedBy: string[];
}

interface Message {
  from: string;
  to: string;
  content: string;
  type: "message" | "shutdown_request" | "idle";
}

/** Agent handler — 模拟 LLM，返回 null 表示本轮无输出（退出循环） */
type AgentHandler = (
  prompt: string,
  api: AgentAPI
) => Promise<string | null>;

/** 暴露给 handler 的 API，允许 agent 操作任务列表 */
interface AgentAPI {
  name: string;
  listTasks(): Task[];
  claim(taskId: string): boolean;
  complete(taskId: string): void;
  send(to: string, content: string): void;
}

// ────────────────────── Message Bus ────────────────────────

const bus = new EventEmitter();
bus.setMaxListeners(50);

const queues = new Map<string, Message[]>();

function getQueue(name: string): Message[] {
  if (!queues.has(name)) queues.set(name, []);
  return queues.get(name)!;
}

function send(from: string, to: string, content: string, type: Message["type"] = "message"): void {
  const msg: Message = { from, to, content, type };
  getQueue(to).push(msg);
  bus.emit(`msg:${to}`, msg);
}

function waitForMessage(name: string, signal: AbortSignal): Promise<Message> {
  const q = getQueue(name);
  // 快路径：队列已有消息
  if (q.length > 0) return Promise.resolve(q.shift()!);
  // 慢路径：挂起等待
  return new Promise<Message>((resolve, reject) => {
    const onMsg = (msg: Message) => {
      cleanup();
      resolve(msg);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error("aborted"));
    };
    const cleanup = () => {
      bus.removeListener(`msg:${name}`, onMsg);
      signal.removeEventListener("abort", onAbort);
    };
    bus.once(`msg:${name}`, onMsg);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ──────────────────── Shared Task List ─────────────────────

const tasks: Task[] = [];
let nextId = 1;

function addTask(subject: string, blockedBy: string[] = []): Task {
  const task: Task = { id: String(nextId++), subject, status: "pending", owner: null, blockedBy: [...blockedBy] };
  tasks.push(task);
  return task;
}

function claim(taskId: string, owner: string): boolean {
  const t = tasks.find((x) => x.id === taskId);
  if (!t || t.status !== "pending" || t.owner || t.blockedBy.length > 0) return false;
  t.status = "in_progress";
  t.owner = owner;
  return true;
}

function complete(taskId: string): void {
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return;
  t.status = "completed";
  // 解除下游依赖（对齐 cli.js 的 blockedBy 自动移除）
  for (const other of tasks) {
    const idx = other.blockedBy.indexOf(taskId);
    if (idx !== -1) other.blockedBy.splice(idx, 1);
  }
}

/** 查找当前可认领的任务（pending + 无阻塞 + 无 owner） */
function findClaimable(): Task | undefined {
  return tasks.find((t) => t.status === "pending" && t.blockedBy.length === 0 && !t.owner);
}

// ───────────────────── Agent Runner ────────────────────────

interface AgentHandle {
  name: string;
  waitForExit(): Promise<void>;
}

function spawnAgent(name: string, handler: AgentHandler, initialPrompt: string): AgentHandle {
  const ac = new AbortController();

  const api: AgentAPI = {
    name,
    listTasks: () => tasks,
    claim: (id) => claim(id, name),
    complete: (id) => complete(id),
    send: (to, content) => send(name, to, content),
  };

  const loop = (async () => {
    let prompt = initialPrompt;
    log(name, "spawned");

    while (!ac.signal.aborted) {
      // ── Phase 1: Handle ──
      const result = await handler(prompt, api);
      if (result === null) {
        log(name, "handler returned null, exiting");
        break;
      }

      // ── Phase 2: Idle ──
      send(name, "team-lead", `idle after: ${result}`, "idle");
      log(name, "idle — waiting for message or claimable task");

      // 自动任务认领轮询（对齐 cli.js 的 aI4 — 500ms poll interval）
      let msg: Message | undefined;
      while (!ac.signal.aborted) {
        // 先检查消息队列（优先级：消息 > 自动认领）
        const q = getQueue(name);
        if (q.length > 0) {
          msg = q.shift();
          break;
        }
        // 尝试自动认领
        const claimable = findClaimable();
        if (claimable && claim(claimable.id, name)) {
          log(name, `auto-claimed task #${claimable.id}: ${claimable.subject}`);
          msg = { from: "system", to: name, content: `work on task #${claimable.id}: ${claimable.subject}`, type: "message" };
          break;
        }
        // 等待 500ms 后重试（对齐 cli.js 的 ZZY 500ms poll）
        await Promise.race([
          waitForMessage(name, ac.signal).then((m) => { msg = m; }),
          new Promise((r) => setTimeout(r, 500)),
        ]).catch(() => {});
        if (msg) break;
      }
      if (!msg) break;

      // ── Phase 3: Wake ──
      if (msg.type === "shutdown_request") {
        log(name, "received shutdown, exiting");
        send(name, msg.from, "shutdown approved", "message");
        break;
      }
      log(name, `woke — message from ${msg.from}: ${msg.content}`);
      prompt = msg.content;
    }

    log(name, "exited");
  })();

  return {
    name,
    waitForExit: () => loop,
  };
}

// ───────────────────────── Demo ────────────────────────────

function log(agent: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${agent.padEnd(12)}] ${msg}`);
}

async function main() {
  console.log("=== Mini Multi-Agent Demo ===\n");

  // ── 1. 创建任务（task3 依赖 task1 + task2）──
  const t1 = addTask("Research: analyze codebase structure");
  const t2 = addTask("Implement: write utility functions");
  const t3 = addTask("Integrate: combine research + implementation", [t1.id, t2.id]);
  log("team-lead", `created 3 tasks (task #${t3.id} blocked by #${t1.id}, #${t2.id})`);

  // ── 2. Spawn agents（模拟 handler 替代 LLM）──
  const researcher = spawnAgent("researcher", async (prompt, api) => {
    // 模拟研究工作
    const claimable = api.listTasks().find((t) => t.owner === api.name && t.status === "in_progress");
    if (claimable) {
      await sleep(300); // 模拟工作耗时
      api.complete(claimable.id);
      log(api.name, `completed task #${claimable.id}: ${claimable.subject}`);
      api.send("implementer", `task #${claimable.id} done, findings ready`);
      return `finished task #${claimable.id}`;
    }
    return prompt.includes("shutdown") ? null : "waiting for work";
  }, "start");

  const implementer = spawnAgent("implementer", async (prompt, api) => {
    const claimable = api.listTasks().find((t) => t.owner === api.name && t.status === "in_progress");
    if (claimable) {
      await sleep(300);
      api.complete(claimable.id);
      log(api.name, `completed task #${claimable.id}: ${claimable.subject}`);
      return `finished task #${claimable.id}`;
    }
    return prompt.includes("shutdown") ? null : "waiting for work";
  }, "start");

  // 等待 agents 完成所有任务
  await sleep(5000);

  // ── 3. Shutdown 协议 ──
  log("team-lead", "sending shutdown to all agents");
  send("team-lead", "researcher", "all done", "shutdown_request");
  send("team-lead", "implementer", "all done", "shutdown_request");

  await Promise.all([researcher.waitForExit(), implementer.waitForExit()]);

  // ── 4. 打印最终状态 ──
  console.log("\n=== Final Task Status ===");
  for (const t of tasks) {
    console.log(`  #${t.id} [${t.status.padEnd(11)}] owner=${(t.owner ?? "-").padEnd(12)} ${t.subject}`);
  }

  const allDone = tasks.every((t) => t.status === "completed");
  console.log(`\n${allDone ? "✓ All tasks completed!" : "✗ Some tasks still pending."}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch(console.error);
