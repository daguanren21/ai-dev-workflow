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
])

export function parseArgs(argv) {
  const [command, ...rest] = argv
  if (!command) {
    throw new Error('Missing command')
  }

  const flags = {}
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

export function readConfig(env = process.env) {
  const dailyHourCap = Number.parseFloat(env.WORKFLOW_DAILY_HOUR_CAP || '8')
  if (!Number.isFinite(dailyHourCap) || dailyHourCap <= 0) {
    throw new Error('WORKFLOW_DAILY_HOUR_CAP must be a positive number')
  }

  const config = {
    dailyHourCap,
    defaultBaseBranch: env.WORKFLOW_DEFAULT_BASE_BRANCH || 'dev',
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

function toCamelCase(name) {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}
