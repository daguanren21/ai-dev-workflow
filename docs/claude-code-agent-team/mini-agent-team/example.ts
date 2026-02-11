// ============================================================
// Mini Agent Team — 完整使用示例
//
// 演示流程：
//   1. 创建团队
//   2. 创建任务（含依赖关系）
//   3. Spawn 2 个 agent
//   4. Agent 认领并执行任务
//   5. Agent 间互相通信
//   6. 任务完成后 shutdown
//   7. 清理团队
//
// 运行: npx tsx docs/claude-code-agent-team/mini-agent-team/example.ts
// ============================================================

import { createTeam, deleteTeam, readTeamConfig } from "./team.js";
import { createTask, listTasks, claimTask, updateTask } from "./task.js";
import {
  sendMessage,
  sendShutdownRequest,
  waitForMessage,
  drainMessages,
} from "./message.js";
import { spawnAgent, getAgent } from "./agent.js";
import type { AgentContext, AgentHandler } from "./types.js";

const TEAM = "demo-project";

// ── 模拟 handler（替代真实 LLM 调用）────────────────────────

/**
 * researcher agent：
 *   - 第 1 次调用：认领任务 1 → "做研究" → 完成
 *   - 被唤醒后：收到消息，回复确认
 */
function createResearcherHandler(): AgentHandler {
  let callCount = 0;

  return async (prompt: string, ctx: AgentContext): Promise<string | null> => {
    callCount++;
    await delay(100); // 模拟处理时间

    if (callCount === 1) {
      // 第一次：认领并完成任务 1
      console.log(`\n  📋 [${ctx.agentName}] 认领任务 1...`);
      await claimTask(ctx.teamName, "1", ctx.agentName);
      await delay(200);

      console.log(`  ✅ [${ctx.agentName}] 任务 1 完成 — "分析项目结构"`);
      await updateTask(ctx.teamName, "1", { status: "completed" });

      // 通知 implementer 研究结果
      sendMessage(
        ctx.agentName,
        "implementer",
        "研究完成：项目使用 Express + TypeScript，入口在 src/index.ts",
        { summary: "Research findings" },
      );

      return "已完成研究任务并通知 implementer";
    }

    if (callCount === 2) {
      // 被唤醒后的处理
      console.log(`  📨 [${ctx.agentName}] 收到新消息: "${prompt.slice(0, 50)}"`);
      return "确认收到，准备待命";
    }

    return null; // 第 3 次主动退出
  };
}

/**
 * implementer agent：
 *   - 第 1 次调用：等待任务 3 解除阻塞，认领 → 实现 → 完成
 *   - 被唤醒后：收到消息，回复
 */
function createImplementerHandler(): AgentHandler {
  let callCount = 0;

  return async (prompt: string, ctx: AgentContext): Promise<string | null> => {
    callCount++;
    await delay(150);

    if (callCount === 1) {
      // 第一次：先处理收到的研究结果，再认领任务 2
      console.log(`\n  📋 [${ctx.agentName}] 认领任务 2...`);
      await claimTask(ctx.teamName, "2", ctx.agentName);
      await delay(300);

      console.log(`  ✅ [${ctx.agentName}] 任务 2 完成 — "实现用户认证"`);
      await updateTask(ctx.teamName, "2", { status: "completed" });

      // 通知 team-lead
      sendMessage(
        ctx.agentName,
        "team-lead",
        "任务 2 完成，用户认证模块已实现",
        { summary: "Task 2 done" },
      );

      return "已完成实现任务";
    }

    if (callCount === 2) {
      // 认领任务 3（此时应已解除阻塞）
      try {
        console.log(`\n  📋 [${ctx.agentName}] 认领任务 3（集成测试）...`);
        await claimTask(ctx.teamName, "3", ctx.agentName);
        await delay(200);

        console.log(`  ✅ [${ctx.agentName}] 任务 3 完成 — "编写集成测试"`);
        await updateTask(ctx.teamName, "3", { status: "completed" });

        sendMessage(
          ctx.agentName,
          "team-lead",
          "全部任务完成！",
          { summary: "All tasks done" },
        );
      } catch (e: unknown) {
        console.log(`  ⚠️  [${ctx.agentName}] 认领任务 3 失败: ${e}`);
      }
      return "集成测试完成";
    }

    return null;
  };
}

// ── 主流程 ───────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Mini Agent Team — 演示                     ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // 清理可能残留的旧数据
  deleteTeam(TEAM);

  // ── Step 1: 创建团队 ──
  console.log("▶ Step 1: 创建团队");
  const config = createTeam(TEAM, "Demo: Multi-agent 协作");
  console.log(`  团队 "${config.name}" 已创建，leader: ${config.leadAgentId}\n`);

  // ── Step 2: 创建任务（含依赖） ──
  console.log("▶ Step 2: 创建任务");

  const task1 = await createTask(TEAM, "分析项目结构", "研究 src/ 下的模块组织", {
    activeForm: "Analyzing project structure",
  });
  console.log(`  Task ${task1.id}: ${task1.subject}`);

  const task2 = await createTask(TEAM, "实现用户认证", "添加 JWT 认证中间件", {
    activeForm: "Implementing auth",
  });
  console.log(`  Task ${task2.id}: ${task2.subject}`);

  const task3 = await createTask(TEAM, "编写集成测试", "为认证流程编写 E2E 测试", {
    activeForm: "Writing integration tests",
    blockedBy: [task1.id, task2.id], // 依赖任务 1 和 2
  });
  console.log(`  Task ${task3.id}: ${task3.subject} (blockedBy: [${task3.blockedBy}])`);

  const allTasks = await listTasks(TEAM);
  console.log(`  共 ${allTasks.length} 个任务\n`);

  // ── Step 3: Spawn agents ──
  console.log("▶ Step 3: Spawn agents");

  const researcher = spawnAgent(TEAM + "-researcher", TEAM, createResearcherHandler(), {
    initialPrompt: "请分析项目结构",
    agentType: "Explore",
  });
  console.log(`  Spawned: ${researcher.name} (${researcher.agentId})`);

  const implementer = spawnAgent(TEAM + "-implementer", TEAM, createImplementerHandler(), {
    initialPrompt: "等待研究结果后实现功能",
    agentType: "general-purpose",
  });
  console.log(`  Spawned: ${implementer.name} (${implementer.agentId})\n`);

  // ── Step 4: Team Lead 监听消息 & 协调 ──
  console.log("▶ Step 4: Team Lead 协调中...\n");

  // 给 agents 一些处理时间
  await delay(1500);

  // 检查 team-lead 收到的消息
  const leadMsgs = drainMessages("team-lead");
  console.log(`\n  📬 Team Lead 收到 ${leadMsgs.length} 条消息:`);
  for (const m of leadMsgs) {
    console.log(`     [${m.sender}] ${m.content.slice(0, 60)}`);
  }

  // 查看任务状态
  console.log("\n▶ Step 5: 查看任务状态");
  const tasksAfter = await listTasks(TEAM);
  for (const t of tasksAfter) {
    const ownerStr = t.owner ? ` (owner: ${t.owner})` : "";
    const blockStr = t.blockedBy.length > 0 ? ` [blocked by: ${t.blockedBy}]` : "";
    console.log(`  Task ${t.id}: [${t.status}] ${t.subject}${ownerStr}${blockStr}`);
  }

  // 给 implementer 发消息让它继续做任务 3
  console.log("\n▶ Step 6: 唤醒 implementer 做任务 3");
  sendMessage("team-lead", TEAM + "-implementer", "任务 1、2 都完成了，请继续做任务 3", {
    summary: "Continue to task 3",
  });

  await delay(1500);

  // 最终任务状态
  console.log("\n▶ Step 7: 最终任务状态");
  const finalTasks = await listTasks(TEAM);
  for (const t of finalTasks) {
    const ownerStr = t.owner ? ` (owner: ${t.owner})` : "";
    console.log(`  Task ${t.id}: [${t.status}] ${t.subject}${ownerStr}`);
  }

  // 查看团队成员
  const finalConfig = readTeamConfig(TEAM);
  console.log(`\n  团队成员: ${finalConfig.members.map((m) => m.name).join(", ")}`);

  // ── Step 8: Shutdown ──
  console.log("\n▶ Step 8: Shutdown agents");

  const researcherHandle = getAgent(TEAM + "-researcher");
  const implementerHandle = getAgent(TEAM + "-implementer");

  if (researcherHandle && researcherHandle.state !== "shutdown") {
    sendShutdownRequest("team-lead", TEAM + "-researcher", "All tasks done");
    // 给 researcher 一个新消息让它继续循环到可以收到 shutdown
    await delay(500);
  }

  if (implementerHandle && implementerHandle.state !== "shutdown") {
    sendShutdownRequest("team-lead", TEAM + "-implementer", "All tasks done");
    await delay(500);
  }

  // 等待 agents 退出
  await Promise.race([
    Promise.all([
      researcherHandle?.waitForExit(),
      implementerHandle?.waitForExit(),
    ]),
    delay(3000), // 超时 3 秒
  ]);

  // ── Step 9: 清理 ──
  console.log("\n▶ Step 9: 清理团队");
  deleteTeam(TEAM);
  console.log(`  团队 "${TEAM}" 已删除\n`);

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   演示完成！                                 ║");
  console.log("╚══════════════════════════════════════════════╝");
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 启动 ─────────────────────────────────────────────────────

main().catch((err) => {
  console.error("Fatal error:", err);
  deleteTeam(TEAM); // 确保清理
  process.exit(1);
});
