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

  const config = {
    dailyHourCap,
    defaultBaseBranch: env.WORKFLOW_DEFAULT_BASE_BRANCH || 'dev',
    defaultBenchmarkCategory: env.WORKFLOW_DEFAULT_BENCHMARK_CATEGORY || '前端-新增组件',
    defaultComplexity: parseDefaultComplexity(env.WORKFLOW_DEFAULT_COMPLEXITY || 'medium'),
    stateDir: env.WORKFLOW_STATE_DIR || '.codex-workflow',
    gitlab: {
      url: trimTrailingSlash(env.GITLAB_URL || ''),
      token: env.GITLAB_TOKEN || '',
      projectId: env.GITLAB_PROJECT_ID || '',
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
