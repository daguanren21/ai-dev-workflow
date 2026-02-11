// ============================================================
// Mini Agent Team — Team 创建 / 配置管理
// 对应 Claude Code 的 TeamCreate / TeamDelete 工具
// ============================================================

import fs from "node:fs";
import path from "node:path";
import type { TeamConfig, Member } from "./types.js";

/** 团队数据根目录（可通过环境变量覆盖，便于测试） */
const TEAM_ROOT =
  process.env.MINI_TEAM_ROOT ??
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".mini-team");

// ── 路径工具 ─────────────────────────────────────────────────

export function teamDir(teamName: string): string {
  return path.join(TEAM_ROOT, teamName);
}

export function configPath(teamName: string): string {
  return path.join(teamDir(teamName), "config.json");
}

export function taskDir(teamName: string): string {
  return path.join(teamDir(teamName), "tasks");
}

// ── Team CRUD ────────────────────────────────────────────────

/**
 * 创建团队：
 *   1. 建目录  ~/.mini-team/{name}/
 *   2. 建任务目录 ~/.mini-team/{name}/tasks/
 *   3. 写 config.json（包含 team-lead 成员）
 *
 * 对应 Claude Code 的 TeamCreate 工具。
 */
export function createTeam(
  name: string,
  description = "",
  leadName = "team-lead",
): TeamConfig {
  const dir = teamDir(name);
  if (fs.existsSync(dir)) {
    throw new Error(`Team "${name}" already exists at ${dir}`);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(taskDir(name), { recursive: true });

  const leadAgentId = `${leadName}@${name}`;
  const config: TeamConfig = {
    name,
    description,
    leadAgentId,
    createdAt: Date.now(),
    members: [
      {
        agentId: leadAgentId,
        name: leadName,
        agentType: "team-lead",
        color: "#4A90D9",
        joinedAt: Date.now(),
        backendType: "in-process",
      },
    ],
  };

  fs.writeFileSync(configPath(name), JSON.stringify(config, null, 2));
  return config;
}

/** 删除团队：移除整个目录树。对应 TeamDelete 工具。 */
export function deleteTeam(name: string): void {
  const dir = teamDir(name);
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

/** 读取团队配置 */
export function readTeamConfig(teamName: string): TeamConfig {
  const p = configPath(teamName);
  if (!fs.existsSync(p)) {
    throw new Error(`Team "${teamName}" not found`);
  }
  return JSON.parse(fs.readFileSync(p, "utf-8")) as TeamConfig;
}

/** 写回团队配置 */
export function writeTeamConfig(teamName: string, config: TeamConfig): void {
  fs.writeFileSync(configPath(teamName), JSON.stringify(config, null, 2));
}

/** 添加成员到团队。对应 Task tool spawn 时的注册步骤。 */
export function addMember(
  teamName: string,
  memberName: string,
  agentType = "general-purpose",
  opts: Partial<Pick<Member, "model" | "prompt" | "cwd">> = {},
): Member {
  const config = readTeamConfig(teamName);
  const agentId = `${memberName}@${teamName}`;

  if (config.members.some((m) => m.name === memberName)) {
    throw new Error(
      `Member "${memberName}" already exists in team "${teamName}"`,
    );
  }

  const member: Member = {
    agentId,
    name: memberName,
    agentType,
    color: randomColor(),
    joinedAt: Date.now(),
    backendType: "in-process",
    ...opts,
  };

  config.members.push(member);
  writeTeamConfig(teamName, config);
  return member;
}

/** 从团队中移除成员 */
export function removeMember(teamName: string, memberName: string): void {
  const config = readTeamConfig(teamName);
  config.members = config.members.filter((m) => m.name !== memberName);
  writeTeamConfig(teamName, config);
}

// ── 工具函数 ─────────────────────────────────────────────────

const COLORS = [
  "#D94A4A", "#4AD94A", "#D9D94A", "#4AD9D9",
  "#D94AD9", "#FF8C00", "#8A2BE2",
];
let colorIdx = 0;

function randomColor(): string {
  return COLORS[colorIdx++ % COLORS.length];
}
