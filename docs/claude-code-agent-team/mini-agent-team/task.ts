// ============================================================
// Mini Agent Team — 共享任务列表
// 对应 Claude Code 的 TaskCreate / TaskList / TaskUpdate / TaskGet
//
// 关键设计：
//   - 每个 Task 是独立 JSON 文件 → tasks/{id}.json
//   - 使用 .lock 目录做并发互斥（简化版 proper-lockfile）
//   - blockedBy / blocks 实现依赖图
//   - 完成任务时自动解除下游 blockedBy
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { taskDir } from "./team.js";
import type { Task } from "./types.js";

// ── 文件级锁 ─────────────────────────────────────────────────

function lockPath(dir: string): string {
  return path.join(dir, ".lock");
}

/**
 * 简易文件锁：用 mkdir 原子操作创建 .lock 目录。
 * 生产环境应使用 proper-lockfile 包。
 */
async function acquireLock(dir: string, retries = 20): Promise<void> {
  const lp = lockPath(dir);
  for (let i = 0; i < retries; i++) {
    try {
      fs.mkdirSync(lp);
      return;
    } catch {
      await sleep(50 + Math.random() * 50);
    }
  }
  // 超时后强制清理残留锁
  try {
    fs.rmdirSync(lp);
    fs.mkdirSync(lp);
  } catch {
    throw new Error(`Failed to acquire lock on ${dir}`);
  }
}

function releaseLock(dir: string): void {
  try {
    fs.rmdirSync(lockPath(dir));
  } catch {
    /* 锁已释放 */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── ID 生成 ──────────────────────────────────────────────────

function nextId(dir: string): string {
  const ids = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseInt(path.basename(f, ".json"), 10))
    .filter((n) => !isNaN(n));
  return String(ids.length === 0 ? 1 : Math.max(...ids) + 1);
}

function taskPath(teamName: string, id: string): string {
  return path.join(taskDir(teamName), `${id}.json`);
}

// ── CRUD ─────────────────────────────────────────────────────

/** 创建任务（带文件锁） */
export async function createTask(
  teamName: string,
  subject: string,
  description: string,
  opts: {
    activeForm?: string;
    blockedBy?: string[];
    metadata?: Record<string, unknown>;
  } = {},
): Promise<Task> {
  const dir = taskDir(teamName);
  await acquireLock(dir);
  try {
    const id = nextId(dir);
    const now = Date.now();
    const task: Task = {
      id,
      subject,
      description,
      status: "pending",
      activeForm: opts.activeForm,
      blockedBy: opts.blockedBy ?? [],
      blocks: [],
      createdAt: now,
      updatedAt: now,
      metadata: opts.metadata,
    };

    // 更新被依赖任务的 blocks 字段
    for (const depId of task.blockedBy) {
      const depPath = taskPath(teamName, depId);
      if (fs.existsSync(depPath)) {
        const dep = JSON.parse(fs.readFileSync(depPath, "utf-8")) as Task;
        if (!dep.blocks.includes(id)) {
          dep.blocks.push(id);
          fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
        }
      }
    }

    fs.writeFileSync(taskPath(teamName, id), JSON.stringify(task, null, 2));
    return task;
  } finally {
    releaseLock(dir);
  }
}

/** 列出所有任务（排除 deleted），按 ID 升序 */
export async function listTasks(teamName: string): Promise<Task[]> {
  const dir = taskDir(teamName);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const tasks: Task[] = [];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf-8");
    const task = JSON.parse(raw) as Task;
    if (task.status !== "deleted") tasks.push(task);
  }

  return tasks.sort((a, b) => parseInt(a.id) - parseInt(b.id));
}

/** 获取单个任务 */
export async function getTask(
  teamName: string,
  taskId: string,
): Promise<Task | null> {
  const p = taskPath(teamName, taskId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Task;
}

/** 更新任务字段（带文件锁） */
export async function updateTask(
  teamName: string,
  taskId: string,
  updates: Partial<
    Pick<Task, "status" | "subject" | "description" | "activeForm" | "owner" | "metadata">
  > & {
    addBlockedBy?: string[];
    addBlocks?: string[];
  },
): Promise<Task> {
  const dir = taskDir(teamName);
  await acquireLock(dir);
  try {
    const p = taskPath(teamName, taskId);
    if (!fs.existsSync(p)) throw new Error(`Task ${taskId} not found`);

    const task = JSON.parse(fs.readFileSync(p, "utf-8")) as Task;

    // 合并简单字段
    if (updates.status !== undefined) task.status = updates.status;
    if (updates.subject !== undefined) task.subject = updates.subject;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.activeForm !== undefined) task.activeForm = updates.activeForm;
    if (updates.owner !== undefined) task.owner = updates.owner;
    if (updates.metadata) {
      task.metadata = { ...task.metadata, ...updates.metadata };
    }

    // 依赖关系
    for (const depId of updates.addBlockedBy ?? []) {
      if (!task.blockedBy.includes(depId)) task.blockedBy.push(depId);
    }
    for (const depId of updates.addBlocks ?? []) {
      if (!task.blocks.includes(depId)) task.blocks.push(depId);
    }

    // 完成时自动解除下游 blockedBy
    if (updates.status === "completed") {
      for (const downstreamId of task.blocks) {
        const dp = taskPath(teamName, downstreamId);
        if (fs.existsSync(dp)) {
          const downstream = JSON.parse(fs.readFileSync(dp, "utf-8")) as Task;
          downstream.blockedBy = downstream.blockedBy.filter((id) => id !== taskId);
          downstream.updatedAt = Date.now();
          fs.writeFileSync(dp, JSON.stringify(downstream, null, 2));
        }
      }
    }

    task.updatedAt = Date.now();
    fs.writeFileSync(p, JSON.stringify(task, null, 2));
    return task;
  } finally {
    releaseLock(dir);
  }
}

/** 认领任务：设置 owner + 状态改为 in_progress */
export async function claimTask(
  teamName: string,
  taskId: string,
  ownerName: string,
): Promise<Task> {
  const task = await getTask(teamName, taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.owner) throw new Error(`Task ${taskId} already owned by ${task.owner}`);

  // 检查是否被阻塞
  const unfinishedDeps: string[] = [];
  for (const depId of task.blockedBy) {
    const dep = await getTask(teamName, depId);
    if (dep && dep.status !== "completed") {
      unfinishedDeps.push(depId);
    }
  }
  if (unfinishedDeps.length > 0) {
    throw new Error(
      `Task ${taskId} is blocked by unfinished tasks: ${unfinishedDeps.join(", ")}`,
    );
  }

  return updateTask(teamName, taskId, {
    owner: ownerName,
    status: "in_progress",
  });
}
