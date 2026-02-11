// ============================================================
// Mini Agent Team — Type Definitions
// 对应 Claude Code CLI v2.1.x Agent Team 核心类型
// ============================================================

/** 团队配置，持久化到 ~/.mini-team/{name}/config.json */
export interface TeamConfig {
  name: string;
  description: string;
  leadAgentId: string;
  createdAt: number;
  members: Member[];
}

/** 团队成员 */
export interface Member {
  agentId: string; // 格式: {name}@{team-name}
  name: string;
  agentType: string; // "team-lead" | "Explore" | "general-purpose" | 自定义
  color: string;
  joinedAt: number;
  backendType: "in-process"; // mini 版只实现 in-process
  model?: string;
  prompt?: string;
  cwd?: string;
}

/** 任务，持久化到 ~/.mini-team/{name}/tasks/{id}.json */
export interface Task {
  id: string;
  subject: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "deleted";
  owner?: string;
  activeForm?: string;
  blockedBy: string[];
  blocks: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

/** 消息类型 */
export type MessageType =
  | "message"
  | "broadcast"
  | "shutdown_request"
  | "shutdown_response";

/** 团队内消息 */
export interface TeamMessage {
  id: string;
  type: MessageType;
  sender: string;
  recipient?: string; // broadcast 时为空
  content: string;
  summary: string;
  timestamp: number;
  // shutdown 协议字段
  requestId?: string;
  approve?: boolean;
}

/** Agent 运行上下文 — 通过 AsyncLocalStorage 注入 */
export interface AgentContext {
  agentId: string;
  agentName: string;
  teamName: string;
  teamConfigPath: string;
  taskDir: string;
}

/** Agent 的状态 */
export type AgentState = "created" | "running" | "idle" | "shutdown";

/** Agent handler：模拟 LLM 决策，接收 prompt → 返回动作 */
export type AgentHandler = (
  prompt: string,
  ctx: AgentContext,
) => Promise<string | null>;

/** Agent 运行时句柄 */
export interface AgentHandle {
  name: string;
  agentId: string;
  state: AgentState;
  /** 向此 agent 发送消息，唤醒 idle 循环 */
  deliver: (msg: TeamMessage) => void;
  /** 等待 agent 完全退出 */
  waitForExit: () => Promise<void>;
}
