import { execFileSync } from 'node:child_process'

const VALUE_FLAGS = new Set([
  'base',
  'date',
  'description',
  'draft-id',
  'hours',
  'kind',
  'manhour-key',
  'requirement',
  'task',
  'benchmark',
  'complexity',
])

export interface ParsedArgs {
  command: string
  flags: Record<string, string | boolean>
}

export interface WorkflowConfig {
  dailyHourCap: number
  defaultBaseBranch: string
  defaultBenchmarkCategory: string
  defaultComplexity: 'simple' | 'medium' | 'complex'
  stateDir: string
  gitlab: {
    url: string
    token: string
    projectId: string
  }
  redacted: Omit<WorkflowConfig, 'redacted'>
}

export interface InferredGitLabProject {
  url: string
  projectId: string
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv
  if (!command) {
    throw new Error('Missing command')
  }

  const flags: Record<string, string | boolean> = {}
  for (let index = 0; index < rest.length; index += 1) {
    const part = rest[index]
    if (!part.startsWith('--')) {
      throw new Error(`Unexpected argument: ${part}`)
    }

    const name = part.slice(2)
    if (!name) {
      throw new Error('Empty flag name')
    }

    if (VALUE_FLAGS.has(name)) {
      const value = rest[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for --${name}`)
      }
      flags[toCamelCase(name)] = value
      index += 1
    }
    else {
      flags[toCamelCase(name)] = true
    }
  }

  return { command, flags }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): WorkflowConfig {
  const dailyHourCap = Number.parseFloat(env.WORKFLOW_DAILY_HOUR_CAP || '8')
  if (!Number.isFinite(dailyHourCap) || dailyHourCap <= 0) {
    throw new Error('WORKFLOW_DAILY_HOUR_CAP must be a positive number')
  }

  const inferredGitLabProject = inferGitLabProjectFromRemote(
    env.GIT_REMOTE_URL || readGitRemoteUrl(),
  )
  const gitlabUrl = trimTrailingSlash(env.GITLAB_URL || inferredGitLabProject?.url || '')
  const gitlabProjectId = env.GITLAB_PROJECT_ID || inferredGitLabProject?.projectId || ''

  const config = {
    dailyHourCap,
    defaultBaseBranch: env.WORKFLOW_DEFAULT_BASE_BRANCH || 'dev',
    defaultBenchmarkCategory: env.WORKFLOW_DEFAULT_BENCHMARK_CATEGORY || '前端-新增组件',
    defaultComplexity: parseDefaultComplexity(env.WORKFLOW_DEFAULT_COMPLEXITY || 'medium'),
    stateDir: env.WORKFLOW_STATE_DIR || '.codex-workflow',
    gitlab: {
      url: gitlabUrl,
      token: env.GITLAB_TOKEN || '',
      projectId: gitlabProjectId,
    },
  }

  return {
    ...config,
    redacted: {
      ...config,
      gitlab: {
        ...config.gitlab,
        token: config.gitlab.token ? '<redacted>' : '',
      },
    },
  }
}

export function inferGitLabProjectFromRemote(remoteUrl?: string): InferredGitLabProject | undefined {
  const value = remoteUrl?.trim()
  if (!value) {
    return undefined
  }

  const https = parseHttpRemote(value)
  if (https) {
    return https
  }

  const ssh = parseSshRemote(value)
  if (ssh) {
    return ssh
  }

  return undefined
}

function parseHttpRemote(remoteUrl: string): InferredGitLabProject | undefined {
  try {
    const parsed = new URL(remoteUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined
    }

    return normalizeRemoteProject({
      url: `${parsed.protocol}//${parsed.host}`,
      projectPath: parsed.pathname,
    })
  }
  catch {
    return undefined
  }
}

function parseSshRemote(remoteUrl: string): InferredGitLabProject | undefined {
  const scpLike = /^git@([^:]+):(.+)$/.exec(remoteUrl)
  if (scpLike) {
    return normalizeRemoteProject({
      url: `https://${scpLike[1]}`,
      projectPath: scpLike[2],
    })
  }

  try {
    const parsed = new URL(remoteUrl)
    if (parsed.protocol !== 'ssh:' || parsed.username !== 'git') {
      return undefined
    }

    return normalizeRemoteProject({
      url: `https://${parsed.host}`,
      projectPath: parsed.pathname,
    })
  }
  catch {
    return undefined
  }
}

function normalizeRemoteProject({ url, projectPath }: {
  url: string
  projectPath: string
}): InferredGitLabProject | undefined {
  const projectId = projectPath
    .replace(/^\/+/, '')
    .replace(/\.git$/, '')

  if (!projectId || !projectId.includes('/')) {
    return undefined
  }

  return {
    url: trimTrailingSlash(url),
    projectId,
  }
}

function readGitRemoteUrl(): string | undefined {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  }
  catch {
    return undefined
  }
}

function toCamelCase(name: string): string {
  return name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function parseDefaultComplexity(value: string): 'simple' | 'medium' | 'complex' {
  if (value === 'simple' || value === 'medium' || value === 'complex') {
    return value
  }
  throw new TypeError('WORKFLOW_DEFAULT_COMPLEXITY must be simple, medium, or complex')
}
